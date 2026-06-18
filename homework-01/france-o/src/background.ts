// Service worker: central registry of detected Onetag ad frames per tab.
//
//  - Receives detections from content scripts and stores them keyed by frameId.
//  - Enables the toolbar action only on tabs that have at least one detection
//    (the action is disabled by default, so the icon is greyed out otherwise).
//  - Streams the current ad list to any connected DevTools panel.
//  - On a highlight request, computes the frame hierarchy and tells the right
//    frames to reveal/outline the relevant <iframe> elements.

import type {
  AdRecordWire,
  BackgroundToPanel,
  DetectionMessage,
  FrameCommand,
  NavKind,
  PanelMessage,
  Reason,
  VisibilityResponse,
} from './messages.js';

interface AdRecord {
  key: string;
  frameId: number;
  url: string;
  reasons: Reason[];
  // closed: the frame no longer exists (removed from the page).
  closed: boolean;
  // shown: this record was rendered to an open panel at least once. Only shown
  // records become "closed" on removal; never-shown ones (e.g. a placeholder
  // iframe replaced during load before the panel saw it) are just dropped.
  shown: boolean;
  // Visibility problems on the ad iframe or its ancestors; hiddenSig dedupes.
  hiddenReasons: string[];
  hiddenSig: string;
}

// tabId -> Map(key -> AdRecord)
const adsByTab = new Map<number, Map<string, AdRecord>>();
// tabId -> Set(Port) of connected panels
const panelsByTab = new Map<number, Set<chrome.runtime.Port>>();

function getTabAds(tabId: number): Map<string, AdRecord> {
  let map = adsByTab.get(tabId);
  if (!map) {
    map = new Map();
    adsByTab.set(tabId, map);
  }
  return map;
}

function addReason(record: AdRecord, reason: Reason): void {
  if (!record.reasons.includes(reason)) record.reasons.push(reason);
}

function serialize(tabId: number): AdRecordWire[] {
  const map = adsByTab.get(tabId);
  if (!map) return [];
  return [...map.values()].map((r) => ({
    key: r.key,
    frameId: r.frameId,
    url: r.url,
    reasons: r.reasons,
    closed: r.closed,
    hiddenReasons: r.hiddenReasons,
  }));
}

function safePost(port: chrome.runtime.Port, message: BackgroundToPanel): void {
  try {
    port.postMessage(message);
  } catch {
    // Port disconnected (e.g. the service worker suspended); ignore.
  }
}

// Pushes are debounced per tab so that a burst of changes — a placeholder
// iframe being reported, replaced by a freshly created one, then the stale
// record pruned by reconcile() — collapses into a single render. Without this
// the panel briefly shows two rows before settling on one (a visible flicker).
const pushTimers = new Map<number, ReturnType<typeof setTimeout>>();

function pushToPanels(tabId: number): void {
  if (pushTimers.has(tabId)) return;
  pushTimers.set(
    tabId,
    setTimeout(() => {
      pushTimers.delete(tabId);
      const ports = panelsByTab.get(tabId);
      if (!ports || ports.size === 0) return;
      // The panel is about to render these active ads, so mark them shown: from
      // now on, removing one moves it to the closed list instead of dropping it.
      const map = adsByTab.get(tabId);
      if (map) for (const record of map.values()) if (!record.closed) record.shown = true;
      const ads = serialize(tabId);
      for (const port of ports) safePost(port, { type: 'state', ads });
    }, 100)
  );
}

function updateAction(tabId: number): void {
  const map = adsByTab.get(tabId);
  const hasAds = map ? [...map.values()].some((r) => !r.closed) : false;
  const op = hasAds ? chrome.action.enable(tabId) : chrome.action.disable(tabId);
  Promise.resolve(op).catch(() => {});
  chrome.action
    .setTitle({
      tabId,
      title: hasAds
        ? 'Onetag ads detected — open DevTools › Onetag'
        : 'Onetag Ad Inspector (no Onetag ads on this page)',
    })
    .catch(() => {});
}

function recordSelf(tabId: number, frameId: number, url: string, reasons: Reason[]): void {
  const map = getTabAds(tabId);
  const key = `f${frameId}`;
  const record: AdRecord =
    map.get(key) ??
    { key, frameId, url, reasons: [], closed: false, shown: false, hiddenReasons: [], hiddenSig: '' };
  record.url = url;
  record.closed = false; // a live report means the frame is alive again
  for (const reason of reasons) addReason(record, reason);
  map.set(key, record);
  updateAction(tabId);
  pushToPanels(tabId);
  // A new ad frame appearing is a good moment to drop any frames that vanished
  // (e.g. a placeholder iframe that was replaced by this one).
  void reconcile(tabId);
}

// ---- Inspect orchestration ---------------------------------------------

type FrameDetails = chrome.webNavigation.GetAllFrameResultDetails;

async function framesById(tabId: number): Promise<Map<number, FrameDetails>> {
  let frames: FrameDetails[] = [];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  } catch {
    frames = [];
  }
  return new Map(frames.map((f) => [f.frameId, f]));
}

// Reconcile records against the frames that actually exist. A record whose
// frame is gone is either:
//   - moved to "closed" (kept, non-clickable) if the panel had already shown it
//     — i.e. an ad that was removed from the page while being observed; or
//   - dropped, if it was never shown (e.g. a placeholder iframe the OneTag
//     renderer replaced during load before the panel rendered it — which would
//     otherwise look like a duplicate).
async function reconcile(tabId: number): Promise<void> {
  const map = adsByTab.get(tabId);
  if (!map || map.size === 0) return;
  const byId = await framesById(tabId);
  let changed = false;
  for (const [key, record] of [...map]) {
    if (record.closed) continue; // already closed; keep as history
    if (byId.has(record.frameId)) continue; // still alive
    if (record.shown) {
      record.closed = true;
    } else {
      map.delete(key);
    }
    changed = true;
  }

  // Visibility: for each live ad, walk its iframe + ancestors (across frames)
  // and flag any that are hidden / zero-sized.
  for (const record of map.values()) {
    if (record.closed) continue;
    const issues = await collectVisibilityIssues(tabId, record.frameId, byId);
    const sig = issues.join('|');
    if (sig !== record.hiddenSig) {
      record.hiddenSig = sig;
      record.hiddenReasons = issues;
      changed = true;
    }
  }

  if (changed) {
    updateAction(tabId);
    pushToPanels(tabId);
  }
}

// Walk the ancestor frame chain of the ad frame; ask each hosting frame to
// inspect the relevant iframe element + its ancestors in that document. The
// union covers the full chain, including container iframes at each level.
async function collectVisibilityIssues(
  tabId: number,
  adFrameId: number,
  byId: Map<number, FrameDetails>
): Promise<string[]> {
  const issues: string[] = [];
  let cur: number | null = adFrameId;
  let guard = 0;
  while (cur != null && cur !== 0 && byId.has(cur) && guard++ < 50) {
    const frame: FrameDetails = byId.get(cur)!;
    try {
      const res = (await chrome.tabs.sendMessage(
        tabId,
        { type: 'check-visibility', url: frame.url } satisfies FrameCommand,
        { frameId: frame.parentFrameId }
      )) as VisibilityResponse | undefined;
      if (res?.issues?.length) issues.push(...res.issues);
    } catch {
      // No content script in that frame, or it's gone; skip this level.
    }
    cur = frame.parentFrameId;
  }
  return issues;
}

// The DevTools panel performs the actual `inspect()` call, so the background's
// only job is to resolve which iframe to reveal: the ad's URL, plus the URL of
// the frame that hosts the <iframe> element (null when that is the top frame,
// where DevTools eval runs by default).
async function inspectTarget(
  tabId: number,
  key: string
): Promise<{ adUrl: string; frameUrl: string | null } | null> {
  const record = adsByTab.get(tabId)?.get(key);
  if (!record) return null;

  const byId = await framesById(tabId);
  const parentId = byId.get(record.frameId)?.parentFrameId ?? 0;

  const frameUrl = parentId !== 0 ? byId.get(parentId)?.url ?? null : null;
  return { adUrl: record.url, frameUrl };
}

function sendToFrame(tabId: number, frameId: number, message: FrameCommand): void {
  chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => {});
}

// ---- Message + lifecycle wiring ----------------------------------------

chrome.runtime.onMessage.addListener((message: DetectionMessage, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  const frameId = sender.frameId ?? 0;

  if (message.type === 'onetag-detected') {
    recordSelf(tabId, frameId, message.url, message.reasons ?? []);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel') return;
  let boundTabId: number | null = null;

  port.onMessage.addListener((message: PanelMessage) => {
    if (message.type === 'init') {
      boundTabId = message.tabId;
      if (!panelsByTab.has(boundTabId)) panelsByTab.set(boundTabId, new Set());
      panelsByTab.get(boundTabId)!.add(port);
      safePost(port, { type: 'state', ads: serialize(boundTabId) });
      // Ask every live frame to re-report. This surfaces iframes that already
      // existed before the panel was opened: detection runs at page load, but a
      // suspended service worker may have since dropped its in-memory registry,
      // and a still-alive frame won't re-report on its own without a mutation.
      chrome.tabs
        .sendMessage(boundTabId, { type: 'rescan' } satisfies FrameCommand)
        .catch(() => {});
    } else if (message.type === 'inspect' && boundTabId != null) {
      void inspectTarget(boundTabId, message.key).then((target) => {
        if (target) safePost(port, { type: 'inspect-target', ...target });
      });
    } else if (message.type === 'poll' && boundTabId != null) {
      // Detect frames removed from the page since the last check.
      void reconcile(boundTabId);
    }
  });

  port.onDisconnect.addListener(() => {
    if (boundTabId != null) panelsByTab.get(boundTabId)?.delete(port);
  });
});

// The inspector is a snapshot of the CURRENT page only, so any top-frame
// navigation wipes every list (active and closed).
function clearTab(tabId: number): void {
  adsByTab.delete(tabId);
  updateAction(tabId);
  pushToPanels(tabId);
}

function notifyPanels(tabId: number, message: BackgroundToPanel): void {
  const ports = panelsByTab.get(tabId);
  if (ports) for (const port of ports) safePost(port, message);
}

function topKey(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

// Tracks the last committed top-frame page key per tab, to tell same-page
// reloads from navigations to a different page.
const lastTopKey = new Map<number, string>();

// Classify a top-frame commit using webNavigation transition info. Same-page
// reloads — whether a manual reload (F5 / Ctrl-R / reload button) or a
// programmatic location.reload() — and client-side redirects (meta refresh,
// location.href/replace) are all treated as "auto-refresh" here; the panel then
// downgrades to "user-refresh" if the page-side gesture heuristic saw a key
// press just before (catching F5 / Ctrl-R). location.reload() and the reload
// button can't be told apart, so the button is an accepted false positive.
function classifyCommit(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails): NavKind {
  const newKey = topKey(details.url);
  const prevKey = lastTopKey.get(details.tabId) ?? null;
  lastTopKey.set(details.tabId, newKey);
  if (prevKey === null || prevKey !== newKey) return 'navigate';
  if (details.transitionQualifiers?.includes('client_redirect')) return 'auto-refresh';
  if (details.transitionType === 'reload') return 'auto-refresh';
  return 'navigate';
}

chrome.webNavigation.onCommitted.addListener((details) => {
  // The top frame navigating to a new document resets the whole tab.
  if (details.frameId === 0) {
    notifyPanels(details.tabId, { type: 'nav', kind: classifyCommit(details) });
    clearTab(details.tabId);
    return;
  }
  // A sub-frame (re)navigated: drop its stale record (it re-reports itself if
  // the new document is still a OneTag ad), then prune any frames that have
  // disappeared (e.g. a placeholder iframe replaced by a freshly created one).
  const map = adsByTab.get(details.tabId);
  if (map?.delete(`f${details.frameId}`)) {
    updateAction(details.tabId);
    pushToPanels(details.tabId);
  }
  void reconcile(details.tabId);
});

// SPA route changes (history.pushState/replaceState) don't reload the document
// and emit no onCommitted, so handle them explicitly: it's a new page snapshot,
// so wipe the lists, then ask the (un-reloaded) live frames to re-report what's
// still present.
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;
  lastTopKey.set(details.tabId, topKey(details.url));
  notifyPanels(details.tabId, { type: 'nav', kind: 'navigate' });
  clearTab(details.tabId);
  chrome.tabs.sendMessage(details.tabId, { type: 'rescan' } satisfies FrameCommand).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  adsByTab.delete(tabId);
  panelsByTab.delete(tabId);
  lastTopKey.delete(tabId);
  const timer = pushTimers.get(tabId);
  if (timer) clearTimeout(timer);
  pushTimers.delete(tabId);
});

// When a tab gains focus, refresh its toolbar state from what we know, and ask
// its frames to re-report in case the service worker restarted and lost its
// in-memory registry. The per-tab action state Chrome keeps means the icon is
// already independent per tab; this just keeps it accurate.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateAction(tabId);
  chrome.tabs.sendMessage(tabId, { type: 'rescan' } satisfies FrameCommand).catch(() => {});
});

// The action is disabled by default and enabled per-tab only when that tab has
// at least one Onetag ad, so the icon acts purely as a status light. This runs
// on every service-worker start so the global default is always "disabled".
chrome.action.disable().catch(() => {});
