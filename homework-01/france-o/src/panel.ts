// The DevTools panel UI. Bound to the inspected tab, it streams that tab's
// OneTag ad list from the background worker and, when a row is clicked, reveals
// the corresponding <iframe> element in the Elements panel via inspect().

import type { AdRecordWire, BackgroundToPanel, NavKind, PanelMessage, Reason } from './messages.js';

// `inspect()` is the DevTools command-line API function, injected as a bare
// global into the inspectedWindow.eval scope. It is NOT a property of
// globalThis/window, so it must be called as a bare identifier — hence this
// ambient declaration (used only inside the stringified `findAndInspect`).
declare function inspect(node: unknown): void;

const tabId = chrome.devtools.inspectedWindow.tabId;
const listEl = document.getElementById('list') as HTMLUListElement;
const emptyEl = document.getElementById('empty') as HTMLDivElement;
const countEl = document.getElementById('count') as HTMLSpanElement;
const integrationEl = document.getElementById('integration') as HTMLElement;
const overviewEl = document.getElementById('overview') as HTMLElement;
const adsHeadEl = document.getElementById('ads-head') as HTMLElement;
const adsBodyEl = document.getElementById('ads-body') as HTMLElement;
const adsTwEl = document.getElementById('ads-tw') as HTMLElement;

const PREBID_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 1.7l8.9 5.15v10.3L12 22.3l-8.9-5.15V6.85z" fill="#f60"/>' +
  '<path d="M12 6.4l4.85 2.8v5.6L12 17.6l-4.85-2.8V9.2z" fill="#fff" fill-opacity=".85"/>' +
  '</svg>';

const GPT_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="2" y="5" width="20" height="14" rx="2" fill="#4285f4"/>' +
  '<rect x="5" y="8.5" width="10" height="2.5" rx="1.25" fill="#fff" fill-opacity=".9"/>' +
  '<rect x="5" y="13" width="6" height="2.5" rx="1.25" fill="#fff" fill-opacity=".7"/>' +
  '</svg>';

const REASON_LABELS: Record<Reason, string> = {
  'iframe-src': 'iframe src',
  script: 'script',
};

// The MV3 service worker suspends after a period of inactivity, which
// disconnects this long-lived port. We reconnect on disconnect so the panel
// keeps receiving live updates, and guard sends against a momentarily dead port.
let port: chrome.runtime.Port;

function connect(): void {
  port = chrome.runtime.connect({ name: 'panel' });
  port.onMessage.addListener((message: BackgroundToPanel) => {
    if (message.type === 'state') render(message.ads);
    else if (message.type === 'inspect-target') revealInElements(message.adUrl, message.frameUrl);
    else if (message.type === 'nav') bgNavKind = message.kind;
  });
  port.onDisconnect.addListener(connect);
  send({ type: 'init', tabId });
}

function send(message: PanelMessage): void {
  try {
    port.postMessage(message);
  } catch {
    // Port disconnected since last use; re-establish and retry once.
    connect();
    try {
      port.postMessage(message);
    } catch {
      // Give up; onDisconnect/connect will recover for the next action.
    }
  }
}

connect();
refreshIntegration();

// There's no DOM event for an iframe being removed, so nudge the background
// periodically to re-check which frames are still alive while the panel is open.
// The same tick refreshes the Prebid integration info (auctions evolve in time).
setInterval(() => {
  send({ type: 'poll' });
  refreshIntegration();
}, 1000);

// Locate the <iframe> whose src corresponds to `adUrl` and reveal it in the
// Elements panel. `frameUrl` selects the frame that hosts the element (the page
// can nest the ad iframe inside other frames); null means the top frame.
function revealInElements(adUrl: string, frameUrl: string | null): void {
  const expression = `(${findAndInspect.toString()})(${JSON.stringify(adUrl)})`;
  const options = frameUrl ? { frameURL: frameUrl } : {};

  chrome.devtools.inspectedWindow.eval(expression, options, (found) => {
    // A falsy result means the iframe wasn't found (or eval threw because the
    // frameURL no longer matches). Retry once against the top frame as a best
    // effort before giving up.
    if (!found && frameUrl) chrome.devtools.inspectedWindow.eval(expression);
  });
}

// Reveal the ad unit's slot element (id === code) in the Elements panel.
function revealAdUnit(code: string): void {
  chrome.devtools.inspectedWindow.eval(`(${inspectById.toString()})(${JSON.stringify(code)})`);
}

function inspectById(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  // Prefer the first iframe inside the slot: the container <div> can have a
  // different stacking context, so the Elements overlay may show nothing on it.
  const target: Element = el.querySelector('iframe') || el;
  target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  inspect(target);
  return true;
}

// Stringified and run in the inspected page (NOT in this panel's scope). Finds
// the ad's <iframe> element and reveals it via the command-line `inspect()`.
// Tries several strategies because the iframe's `src` attribute, the frame's
// committed URL, and "friendly" (srcdoc / about:blank) iframes that have no
// usable src all need handling.
function findAndInspect(targetUrl: string): boolean {
  const norm = (u: string | null): string | null => {
    if (!u) return null;
    try {
      return new URL(u, document.baseURI).href;
    } catch {
      return null;
    }
  };
  const target = norm(targetUrl);
  const iframes = Array.prototype.slice.call(
    document.querySelectorAll('iframe')
  ) as HTMLIFrameElement[];

  const hasOnetagScript = (frame: HTMLIFrameElement): boolean => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return false;
      return Array.prototype.some.call(
        doc.querySelectorAll('script[src]'),
        (s: HTMLScriptElement) => /onetag-sys\.com|onetag\.net/i.test(s.getAttribute('src') || '')
      );
    } catch {
      return false; // cross-origin
    }
  };
  const liveLocation = (frame: HTMLIFrameElement): string | null => {
    try {
      return frame.contentWindow ? frame.contentWindow.location.href : null;
    } catch {
      return null; // cross-origin
    }
  };

  let match: HTMLIFrameElement | undefined;

  // 1) Match by the iframe's src URL (covers real onetag-hosted iframes).
  if (target) {
    match = iframes.find((f) => {
      const r = norm(f.getAttribute('src'));
      return !!r && (r === target || r.indexOf(target) === 0 || target.indexOf(r) === 0);
    });
  }
  // 2) Match by the frame's live (same-origin) location.
  if (!match && target) match = iframes.find((f) => liveLocation(f) === target);
  // 3) Friendly iframe (srcdoc / about:blank): its same-origin document holds an
  //    onetag script. This is the case that pure URL matching can't catch.
  if (!match) match = iframes.find(hasOnetagScript);
  // 3b) Sandboxed srcdoc iframe (opaque origin, no allow-same-origin): its
  //     document is unreadable, but the onetag URL is visible in the srcdoc
  //     markup, which lives in this (parent) document.
  if (!match) {
    match = iframes.find((f) => {
      const sd = f.getAttribute('srcdoc');
      return !!sd && /onetag-sys\.com|onetag\.net/i.test(sd);
    });
  }
  // 4) Unique iframe sharing the target's origin.
  if (!match && target) {
    let origin = '';
    try {
      origin = new URL(target).origin;
    } catch {
      /* ignore */
    }
    const sameOrigin = iframes.filter((f) => {
      const r = norm(f.getAttribute('src'));
      try {
        return !!r && new URL(r).origin === origin;
      } catch {
        return false;
      }
    });
    if (sameOrigin.length === 1) match = sameOrigin[0];
  }

  if (!match) return false;
  try {
    match.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  } catch {
    /* ignore */
  }
  inspect(match);
  return true;
}

// URLs can be very long; show a compact middle-truncated form in the list
// and keep the full URL available on hover (title attribute).
function trimUrl(url: string, max = 72): string {
  if (url.length <= max) return url;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${url.slice(0, head)}…${url.slice(url.length - tail)}`;
}

function renderRow(ad: AdRecordWire): HTMLLIElement {
  const li = document.createElement('li');

  const url = document.createElement('div');
  url.className = 'url';
  if (ad.hiddenReasons.length && !ad.closed) {
    const warn = document.createElement('span');
    warn.className = 'warn-icon';
    warn.textContent = '⚠';
    warn.title =
      'This ad (or an ancestor) is hidden / zero-sized:\n• ' + ad.hiddenReasons.join('\n• ');
    url.appendChild(warn);
  }
  url.appendChild(document.createTextNode(trimUrl(ad.url)));
  url.title = ad.url;
  li.appendChild(url);

  const meta = document.createElement('div');
  meta.className = 'meta';
  for (const reason of ad.reasons) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = REASON_LABELS[reason] ?? reason;
    meta.appendChild(badge);
  }
  const frameInfo = document.createElement('span');
  frameInfo.textContent = `frame #${ad.frameId}`;
  meta.appendChild(frameInfo);
  li.appendChild(meta);

  if (ad.closed) {
    li.className = 'closed';
    li.title = 'This ad was removed from the page';
  } else {
    li.className = 'ad';
    li.title = 'Click to reveal this ad’s iframe in the Elements panel';
    li.addEventListener('click', () => send({ type: 'inspect', key: ad.key }));
  }

  return li;
}

function sectionHeading(label: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'section';
  li.textContent = label;
  return li;
}

// Manual expand override for the OneTag ads section (null = follow the default,
// which is: expanded only when at least one ad is detected).
let adsOverride: boolean | null = null;

function setAdsExpanded(expanded: boolean): void {
  adsBodyEl.style.display = expanded ? 'block' : 'none';
  adsTwEl.textContent = expanded ? '▾' : '▸';
}

adsHeadEl.addEventListener('click', () => {
  adsOverride = adsBodyEl.style.display === 'none';
  setAdsExpanded(adsOverride);
});

function render(ads: AdRecordWire[]): void {
  listEl.textContent = '';
  const active = ads.filter((a) => !a.closed);
  const closed = ads.filter((a) => a.closed);

  countEl.textContent = active.length ? String(active.length) : '';
  emptyEl.style.display = active.length || closed.length ? 'none' : 'block';

  for (const ad of active) listEl.appendChild(renderRow(ad));

  if (closed.length) {
    listEl.appendChild(sectionHeading(`Closed (${closed.length})`));
    for (const ad of closed) listEl.appendChild(renderRow(ad));
  }

  // Expanded only when an ad is detected, unless the user toggled it manually.
  setAdsExpanded(adsOverride ?? active.length > 0);
}

// ---- Integration (Prebid) detection ------------------------------------

interface PrebidBid {
  bidder: string;
  cpm: number | null;
  currency: string | null;
  size: string | null;
  status: 'won' | 'bid' | 'no-bid';
  statusMessage: string | null;
  floor: number | null;
  timeToRespond: number | null;
}
interface PrebidAdUnit {
  code: string;
  floor: number | null;
  bids: PrebidBid[];
  // whether an element with id === code currently exists in the page (the ad
  // slot is "alive" and can be revealed in the Elements panel).
  alive: boolean;
}
interface PrebidInfo {
  version: string;
  bidderTimeout: number | null;
  currency: string | null;
  floorsModule: boolean;
  auctionCount: number;
  timeoutCount: number;
  rejectedCount: number;
  winningCount: number;
  adUnits: PrebidAdUnit[];
}
interface GptSlot {
  elementId: string | null;
  adUnitPath: string;
  sizes: string | null;
  hbBidder: string | null; // Prebid winner handed to GAM (hb_bidder targeting)
  hbPb: string | null; // Prebid price bucket (hb_pb)
  onetag: boolean; // OneTag is the hb_bidder for this slot
  rendered: boolean;
  isEmpty: boolean | null;
  renderedSize: string | null;
  advertiserId: number | null;
  lineItemId: number | null;
  creativeId: number | null;
  campaignId: number | null;
  alive: boolean;
}
interface GptInfo {
  version: string;
  slotCount: number;
  slots: GptSlot[];
}
interface OverviewInfo {
  domain: string;
  origin: string;
  adsTxt: string;
  https: boolean;
  iframes: number;
  consent: { tcf: boolean; usp: boolean; gpp: boolean };
  dcl: number | null;
  load: number | null;
}
interface IntegrationInfo {
  host: string;
  href: string;
  loadId: number; // performance.timeOrigin — changes per document
  navKind: NavKind;
  overview: OverviewInfo;
  local: boolean;
  prebid: PrebidInfo | null;
  gpt: GptInfo | null;
}

const MAX_HISTORY = 10;
const MAX_INTERVALS = 12;
// Auction snapshots (ad units) frozen just before each auto-refresh of the same
// page, oldest first. Survives page reloads because the DevTools panel does.
const auctionHistory: PrebidAdUnit[][] = [];
const gptHistory: GptSlot[][] = [];
let lastLoadId: number | null = null;
let lastPrebid: PrebidInfo | null = null;
let lastGpt: GptInfo | null = null;
// Auto-refresh stats (reset on navigation or a manual/user refresh).
let refreshCount = 0;
const refreshIntervals: number[] = []; // ms between consecutive auto-refresh documents
let prevDocLoadId: number | null = null;
// Authoritative classification from the background (webNavigation transition);
// it can tell the reload button apart from an automatic refresh, which the
// page-side gesture heuristic (info.navKind) cannot. Consumed on doc change.
let bgNavKind: NavKind | null = null;

// React to a new document using the inject script's classification (navKind):
// only AUTOMATIC refreshes accumulate history + rate; a real navigation or a
// user-initiated reload resets everything.
function detectPageChange(info: IntegrationInfo): void {
  const newDoc = info.loadId !== lastLoadId;
  if (newDoc && lastLoadId !== null) {
    // Background classification (authoritative for navigate vs reload/redirect),
    // with the page-side gesture heuristic as fallback. A reload is downgraded
    // to "user" only when a gesture (F5 / Ctrl-R) preceded it — so a timed
    // location.reload() still counts, at the cost of counting the manual reload
    // button too (an accepted false positive).
    let kind: NavKind = bgNavKind ?? info.navKind;
    if (kind === 'auto-refresh' && info.navKind === 'user-refresh') kind = 'user-refresh';
    if (kind === 'auto-refresh') {
      // History keeps only the units/slots that actually took part (had a bid /
      // a render), not every configured one.
      const auctioned = lastPrebid?.adUnits.filter((u) => u.bids.length > 0) ?? [];
      if (auctioned.length) {
        auctionHistory.push(auctioned);
        while (auctionHistory.length > MAX_HISTORY) auctionHistory.shift();
      }
      const rendered = lastGpt?.slots.filter(gptParticipated) ?? [];
      if (rendered.length) {
        gptHistory.push(rendered);
        while (gptHistory.length > MAX_HISTORY) gptHistory.shift();
      }
      refreshCount++;
      if (prevDocLoadId !== null) {
        const interval = info.loadId - prevDocLoadId;
        if (interval > 0) {
          refreshIntervals.push(interval);
          while (refreshIntervals.length > MAX_INTERVALS) refreshIntervals.shift();
        }
      }
    } else {
      // navigate or user-refresh => fresh snapshot.
      auctionHistory.length = 0;
      gptHistory.length = 0;
      refreshIntervals.length = 0;
      refreshCount = 0;
    }
  }
  if (newDoc) {
    prevDocLoadId = info.loadId;
    bgNavKind = null; // consumed
  }
  lastLoadId = info.loadId;
  lastPrebid = info.prebid;
  lastGpt = info.gpt;
}

function avgRefreshIntervalMs(): number | null {
  if (!refreshIntervals.length) return null;
  return refreshIntervals.reduce((a, b) => a + b, 0) / refreshIntervals.length;
}

function refreshIntegration(): void {
  const expression = `(${collectIntegration.toString()})()`;
  chrome.devtools.inspectedWindow.eval(expression, (result: unknown) => {
    const info = result ? (result as IntegrationInfo) : null;
    lastInfo = info;
    if (info) detectPageChange(info);
    renderOverview(info);
    renderIntegration(info);
  });
}

// --- ads.txt (fetched once per domain) cross-referenced with OneTag's
// --- sellers.json (fetched once, globally).
interface AdsTxtEntry {
  adSystem: string;
  publisherId: string;
  relationship: string; // DIRECT | RESELLER | …
}
interface AdsTxt {
  status: 'loading' | 'done' | 'error';
  entries: AdsTxtEntry[];
}
interface Seller {
  name?: string;
  domain?: string;
  type?: string; // PUBLISHER | INTERMEDIARY | BOTH
  confidential: boolean;
}

type SellersData = { status: 'loading' | 'done' | 'error'; map: Map<string, Seller> };

const adsTxtCache = new Map<string, AdsTxt>();
const ONETAG_SELLERS_URL = 'https://www.onetag.net/sellers.json';
let sellers: SellersData | null = null;

function ensureAdsTxt(domain: string, url: string): AdsTxt {
  const cached = adsTxtCache.get(domain);
  if (cached) return cached;
  const entry: AdsTxt = { status: 'loading', entries: [] };
  adsTxtCache.set(domain, entry);
  fetch(url, { credentials: 'omit' })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((text) => {
      entry.status = 'done';
      entry.entries = parseOnetagAdsTxt(text);
    })
    .catch(() => {
      entry.status = 'error';
    });
  return entry;
}

function parseOnetagAdsTxt(text: string): AdsTxtEntry[] {
  const out: AdsTxtEntry[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line || line.includes('=')) continue; // skip blanks / variable records
    const parts = line.split(',').map((s) => s.trim());
    if (parts[0] && /onetag/i.test(parts[0])) {
      out.push({
        adSystem: parts[0],
        publisherId: parts[1] ?? '',
        relationship: (parts[2] ?? '').toUpperCase(),
      });
    }
  }
  return out;
}

function ensureSellers(): NonNullable<typeof sellers> {
  if (sellers) return sellers;
  sellers = { status: 'loading', map: new Map() };
  const current = sellers;
  fetch(ONETAG_SELLERS_URL, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: any) => {
      for (const s of data?.sellers ?? []) {
        if (s && s.seller_id != null) {
          current.map.set(String(s.seller_id), {
            name: s.name,
            domain: s.domain,
            type: s.seller_type,
            confidential: s.is_confidential === 1 || s.is_confidential === true,
          });
        }
      }
      current.status = 'done';
    })
    .catch(() => {
      current.status = 'error';
    });
  return current;
}

function trimId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 14)}…` : id;
}

function note(text: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'note';
  d.style.paddingLeft = '10px';
  d.textContent = text;
  return d;
}

function pill(text: string, kind?: 'ok' | 'warn'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = kind ? `pill ${kind}` : 'pill';
  s.textContent = text;
  return s;
}

function card(
  label: string,
  value: Node | string,
  opts: { wide?: boolean; sub?: string; labelExtra?: Node } = {}
): HTMLDivElement {
  const c = document.createElement('div');
  c.className = opts.wide ? 'card wide' : 'card';
  const l = document.createElement('div');
  l.className = 'card-label';
  l.appendChild(document.createTextNode(label));
  if (opts.labelExtra) l.appendChild(opts.labelExtra);
  c.appendChild(l);
  const v = document.createElement('div');
  v.className = 'card-value';
  if (typeof value === 'string') v.textContent = value;
  else v.appendChild(value);
  c.appendChild(v);
  if (opts.sub) {
    const s = document.createElement('div');
    s.className = 'card-sub';
    s.textContent = opts.sub;
    c.appendChild(s);
  }
  return c;
}

// Render one OneTag ads.txt account, enriched with sellers.json when available.
function renderSellerEntry(entry: AdsTxtEntry, sj: SellersData | null): HTMLDivElement {
  const seller = sj?.status === 'done' ? sj.map.get(entry.publisherId) : undefined;

  const block = document.createElement('div');
  block.className = 'seller';

  const head = document.createElement('div');
  head.className = 'seller-head';
  const rel = document.createElement('span');
  rel.className = entry.relationship === 'DIRECT' ? 'rel direct' : 'rel';
  rel.textContent = entry.relationship || '—';
  head.appendChild(rel);

  const name = document.createElement('span');
  name.className = 'seller-name';
  if (sj?.status === 'loading') name.textContent = 'looking up…';
  else if (seller) {
    name.textContent = seller.confidential
      ? 'Confidential seller'
      : seller.name || seller.domain || 'Unnamed seller';
  } else if (sj?.status === 'done') name.textContent = 'Not listed in sellers.json';
  else name.textContent = 'OneTag account';
  head.appendChild(name);
  block.appendChild(head);

  const meta = document.createElement('div');
  meta.className = 'seller-meta';
  const bits: string[] = [];
  if (seller && !seller.confidential && seller.domain) bits.push(seller.domain);
  if (seller?.type) bits.push(seller.type.toLowerCase());
  bits.push(`id ${trimId(entry.publisherId)}`);
  if (sj?.status === 'error') bits.push('sellers.json unavailable');
  meta.textContent = bits.join(' · ');
  meta.title = entry.publisherId;
  block.appendChild(meta);

  return block;
}

function autoRefreshText(loadId: number): string {
  const avg = avgRefreshIntervalMs();
  const ageS = Math.max(0, Math.round((Date.now() - loadId) / 1000));
  const parts = [`${refreshCount}×`];
  if (avg != null) parts.push(`every ~${formatDuration(avg)}`);
  parts.push(`last ${ageS}s ago`);
  return parts.join(' · ');
}

// The overview is rebuilt only when its data changes; otherwise just the live
// "last … ago" is updated in place — so hovering the ? actually shows its
// native tooltip (a per-second rebuild would destroy it before the tooltip's
// delay elapsed).
let overviewSig = '';
let arValueEl: HTMLElement | null = null;
// "OneTag in ads.txt" is collapsed by default and fetched lazily on first open.
let adsTxtExpanded = false;
let lastInfo: IntegrationInfo | null = null;

function renderOverview(info: IntegrationInfo | null): void {
  if (!info) {
    overviewEl.style.display = 'none';
    overviewEl.textContent = '';
    overviewSig = '';
    arValueEl = null;
    return;
  }
  const o = info.overview;
  // Lazy: only fetch ads.txt once the section is expanded; otherwise just peek
  // at the cache (so a count can show if it was fetched before).
  const ads = adsTxtExpanded ? ensureAdsTxt(o.domain, o.adsTxt) : adsTxtCache.get(o.domain) ?? null;
  const sj =
    adsTxtExpanded && ads?.status === 'done' && ads.entries.length ? ensureSellers() : null;

  const sig = JSON.stringify([
    o.domain,
    o.https,
    o.consent,
    o.iframes,
    o.dcl,
    o.load,
    refreshCount > 0,
    adsTxtExpanded,
    ads?.status ?? null,
    ads?.entries ?? null,
    sj?.status ?? null,
  ]);
  if (sig === overviewSig) {
    if (arValueEl) arValueEl.textContent = autoRefreshText(info.loadId);
    return;
  }
  overviewSig = sig;
  overviewEl.style.display = 'block';
  overviewEl.textContent = '';
  arValueEl = null;

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Overview';
  overviewEl.appendChild(label);

  const cards = document.createElement('div');
  cards.className = 'cards';
  overviewEl.appendChild(cards);

  // Domain (with the transport pill on the right).
  const domainRow = document.createElement('div');
  domainRow.className = 'domain-row';
  const dn = document.createElement('span');
  dn.className = 'domain-name';
  dn.textContent = o.domain;
  domainRow.appendChild(dn);
  domainRow.appendChild(pill(o.https ? 'https' : 'http', o.https ? 'ok' : 'warn'));
  cards.appendChild(card('domain', domainRow, { wide: true }));

  // Consent APIs.
  const consentVal = document.createElement('div');
  consentVal.className = 'pills';
  const apis: Array<[boolean, string]> = [
    [o.consent.tcf, 'TCF v2'],
    [o.consent.usp, 'US Privacy'],
    [o.consent.gpp, 'GPP'],
  ];
  let anyConsent = false;
  for (const [on, name] of apis)
    if (on) {
      consentVal.appendChild(pill(name));
      anyConsent = true;
    }
  if (!anyConsent) consentVal.appendChild(document.createTextNode('none'));
  cards.appendChild(card('consent', consentVal));

  // iframes.
  cards.appendChild(card('iframes', String(o.iframes)));

  // Page timing.
  if (o.dcl != null || o.load != null) {
    cards.appendChild(
      card('DOMContentLoaded', o.dcl != null ? `${o.dcl} ms` : '—', {
        sub: o.load != null ? `load ${o.load} ms` : undefined,
      })
    );
  }

  // Auto-refresh (live; ? explains how it's counted).
  if (refreshCount > 0) {
    const help = document.createElement('span');
    help.className = 'help';
    help.textContent = '?';
    help.title =
      'Counts automatic full-page reloads (a "hard refresh") that publishers use ' +
      'to reload ads — meta refresh, location.href/replace, or location.reload(). ' +
      'Manual reloads via F5 / Ctrl-R are excluded (a key press is detected just ' +
      "before them); the browser's reload button can't be told apart from " +
      'location.reload() and so is counted too. Resets when you navigate to ' +
      'another page.';
    const value = document.createElement('span');
    value.textContent = autoRefreshText(info.loadId);
    arValueEl = value;
    cards.appendChild(card('auto-refresh', value, { labelExtra: help }));
  }

  // OneTag accounts declared in the site's ads.txt, cross-referenced with
  // OneTag's sellers.json. Collapsed by default, fetched lazily on first open.
  const adsCard = document.createElement('div');
  adsCard.className = 'card wide';
  const head = document.createElement('div');
  head.className = 'card-toggle';
  const tw = document.createElement('span');
  tw.className = 'tw';
  tw.textContent = adsTxtExpanded ? '▾' : '▸';
  head.appendChild(tw);
  const ttl = document.createElement('span');
  ttl.className = 'card-toggle-label';
  ttl.textContent = `OneTag in ads.txt${ads?.status === 'done' ? ` (${ads.entries.length})` : ''}`;
  head.appendChild(ttl);
  const link = document.createElement('a');
  link.className = 'ads-link';
  link.href = o.adsTxt;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = 'ads.txt ↗';
  link.addEventListener('click', (e) => e.stopPropagation());
  head.appendChild(link);
  head.addEventListener('click', () => {
    adsTxtExpanded = !adsTxtExpanded;
    renderOverview(lastInfo);
  });
  adsCard.appendChild(head);

  if (adsTxtExpanded) {
    const body = document.createElement('div');
    body.className = 'card-body';
    if (!ads || ads.status === 'loading') body.appendChild(note('checking…'));
    else if (ads.status === 'error') body.appendChild(note('ads.txt unavailable'));
    else if (ads.entries.length === 0) body.appendChild(note('no OneTag entry'));
    else for (const entry of ads.entries) body.appendChild(renderSellerEntry(entry, sj));
    adsCard.appendChild(body);
  }
  cards.appendChild(adsCard);
}

function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 90) return `${Math.round(s)}s`;
  return `${Math.round(s / 60)}m`;
}

// Stringified and run in the inspected page's main frame. Reads page-level
// Prebid state (window.pbjs / window._pbjsGlobals) and returns a plain,
// JSON-serializable debug summary.
function collectIntegration(): unknown {
  const w = window as any;
  const host = location.hostname;
  // href + loadId let the panel tell an auto-refresh (same page, new document)
  // apart from a real navigation. performance.timeOrigin changes per document.
  const href = location.href;
  const loadId = performance.timeOrigin;

  let dcl: number | null = null;
  let load: number | null = null;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as any;
    if (nav) {
      dcl = nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null;
      load = nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null;
    }
  } catch {
    /* ignore */
  }
  const overview = {
    domain: host,
    origin: location.origin,
    adsTxt: `${location.origin}/ads.txt`,
    https: location.protocol === 'https:',
    iframes: document.querySelectorAll('iframe').length,
    consent: {
      tcf: typeof w.__tcfapi === 'function',
      usp: typeof w.__uspapi === 'function',
      gpp: typeof w.__gpp === 'function',
    },
    dcl,
    load,
  };

  const navKind = w.__otNavKind || 'navigate';

  if (host === 'local.onetag.net') {
    return { host, href, loadId, navKind, overview, local: true, prebid: null, gpt: null };
  }

  const safe = (fn: () => any, dflt: any): any => {
    try {
      const v = fn();
      return v == null ? dflt : v;
    } catch {
      return dflt;
    }
  };

  // ---- Prebid -----------------------------------------------------------
  let prebid: any = null;
  {
    const names: string[] = w._pbjsGlobals || (w.pbjs ? ['pbjs'] : []);
    let pbjs: any = null;
    for (const name of names) {
      const g = w[name];
      if (g && typeof g.getEvents === 'function') {
        pbjs = g;
        break;
      }
    }
    if (pbjs) {
      const events: any[] = safe(() => pbjs.getEvents(), []);
      const responses: any = safe(() => pbjs.getBidResponses(), {});
      const winning: any[] = safe(() => pbjs.getAllWinningBids(), []);
      const noBids: any = safe(() => (pbjs.getNoBids ? pbjs.getNoBids() : {}), {});
      const adUnitsCfg: any[] = safe(() => pbjs.adUnits || [], []);
      const cfg: any = safe(() => (pbjs.getConfig ? pbjs.getConfig() : {}), {});

      const wonAdIds: Record<string, boolean> = {};
      winning.forEach((b) => {
        if (b && b.adId) wonAdIds[b.adId] = true;
      });
      const countEvents = (type: string): number =>
        events.filter((e) => e && e.eventType === type).length;

      const units: Record<string, PrebidAdUnit> = {};
      const unit = (code: string): PrebidAdUnit =>
        (units[code] = units[code] || {
          code,
          floor: null,
          bids: [],
          alive: !!document.getElementById(code),
        });

      adUnitsCfg.forEach((u) => {
        if (u && u.code) unit(u.code);
      });

      Object.keys(responses).forEach((code) => {
        const bids: any[] = (responses[code] && responses[code].bids) || [];
        bids.forEach((b) => {
          const floor =
            b && b.floorData && b.floorData.floorValue != null ? b.floorData.floorValue : null;
          const u = unit(code);
          if (floor != null && u.floor == null) u.floor = floor;
          u.bids.push({
            bidder: b.bidderCode || b.bidder || '?',
            cpm: typeof b.cpm === 'number' ? b.cpm : null,
            currency: b.currency || null,
            size: b.width && b.height ? b.width + 'x' + b.height : null,
            status: b.adId && wonAdIds[b.adId] ? 'won' : b.cpm > 0 ? 'bid' : 'no-bid',
            statusMessage: b.statusMessage || null,
            floor,
            timeToRespond: typeof b.timeToRespond === 'number' ? b.timeToRespond : null,
          });
        });
      });

      Object.keys(noBids).forEach((code) => {
        const arr: any[] =
          (noBids[code] && noBids[code].bids) || (Array.isArray(noBids[code]) ? noBids[code] : []);
        arr.forEach((b) => {
          unit(code).bids.push({
            bidder: b.bidder || b.bidderCode || '?',
            cpm: null,
            currency: null,
            size: null,
            status: 'no-bid',
            statusMessage: b.statusMessage || 'No bid',
            floor: null,
            timeToRespond: null,
          });
        });
      });

      // A new auction's getBidResponses() only returns the ad units that took
      // part, so accumulate per code across auctions (in the page, reset on
      // reload) to keep the last-known state of units not in the latest auction
      // instead of dropping them. Don't overwrite real bids with an empty
      // configured-only snapshot.
      const store: Record<string, PrebidAdUnit> = (w.__otPbUnits = w.__otPbUnits || {});
      for (const code of Object.keys(units)) {
        const cur = units[code];
        if (cur.bids.length > 0 || !store[code]) store[code] = cur;
        else store[code].alive = cur.alive;
      }

      prebid = {
        version: pbjs.version || '?',
        bidderTimeout: cfg.bidderTimeout != null ? cfg.bidderTimeout : null,
        currency: (cfg.currency && cfg.currency.adServerCurrency) || null,
        floorsModule: !!cfg.floors,
        auctionCount: countEvents('auctionEnd'),
        timeoutCount: countEvents('bidTimeout'),
        rejectedCount: countEvents('bidRejected'),
        winningCount: winning.length,
        adUnits: Object.keys(store).map((k) => store[k]),
      };
    }
  }

  // ---- Google Publisher Tag --------------------------------------------
  let gpt: any = null;
  {
    const gt = w.googletag;
    if (gt && typeof gt.pubads === 'function' && gt.apiReady) {
      // slotRenderEnded results are recorded by the MAIN-world inject script.
      const log: any = w.__otGptLog || {};
      const slots: any[] = safe(() => gt.pubads().getSlots(), []);
      const gslots = slots.map((s) => {
        const id = safe(() => s.getSlotElementId(), null);
        const tget = (k: string): string | null => {
          try {
            const v = s.getTargeting(k);
            return v && v.length ? v[0] : null;
          } catch {
            return null;
          }
        };
        const resp = safe(() => s.getResponseInformation(), null);
        const ev = id && log[id] ? log[id] : null;
        const hbBidder = tget('hb_bidder');
        const onetag =
          (!!hbBidder && hbBidder.toLowerCase() === 'onetag') || tget('hb_bidder_onetag') != null;
        const sizes: any[] = safe(() => s.getSizes(), []);
        const sizeStr = sizes
          .map((z: any) => {
            if (typeof z === 'string') return z;
            try {
              return `${z.getWidth()}x${z.getHeight()}`;
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .join(', ');
        return {
          elementId: id,
          adUnitPath: safe(() => s.getAdUnitPath(), '?'),
          sizes: sizeStr || null,
          hbBidder,
          hbPb: tget('hb_pb'),
          onetag,
          rendered: !!(resp || (ev && !ev.isEmpty)),
          isEmpty: ev ? ev.isEmpty : null,
          renderedSize: ev ? ev.size : null,
          advertiserId: resp ? resp.advertiserId : ev ? ev.advertiserId : null,
          lineItemId: resp ? resp.lineItemId : ev ? ev.lineItemId : null,
          creativeId: resp ? resp.creativeId : ev ? ev.creativeId : null,
          campaignId: resp ? resp.campaignId : ev ? ev.campaignId : null,
          alive: id ? !!document.getElementById(id) : false,
        };
      });
      gpt = { version: safe(() => gt.getVersion(), '?'), slotCount: gslots.length, slots: gslots };
    }
  }

  return { host, href, loadId, navKind, overview, local: false, prebid, gpt };
}

function chip(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'chip';
  el.textContent = text;
  return el;
}

const ONETAG_RE = /onetag/i;
// The OneTag Prebid bidder code is exactly "onetag" — match it precisely so
// bidders that merely contain the substring aren't mistaken for it.
const isOnetagBidder = (bidder: string): boolean => bidder.trim().toLowerCase() === 'onetag';

// Preserved across the 1s refresh.
let integrationExpanded = false;
let highlightOnetag = true; // highlighting of onetag rows is on by default
// Per-ad-unit manual expand overrides (keyed by ad unit code). When a code is
// absent, the default applies: expanded iff OneTag won that auction.
const unitOverride = new Map<string, boolean>();

function renderIntegration(info: IntegrationInfo | null): void {
  integrationEl.textContent = '';
  if (!info) {
    integrationEl.style.display = 'none';
    return;
  }
  integrationEl.style.display = 'block';
  integrationEl.classList.toggle('hl', highlightOnetag);

  // Header: disclosure triangle + label + a summary that's useful while collapsed.
  const head = document.createElement('div');
  head.className = 'ihead';

  const triangle = document.createElement('span');
  triangle.className = 'tw';
  triangle.textContent = integrationExpanded ? '▾' : '▸';
  head.appendChild(triangle);

  const label = document.createElement('span');
  label.className = 'ilabel';
  label.textContent = 'Integration method';
  head.appendChild(label);

  const summary = document.createElement('span');
  summary.className = 'isum';
  if (refreshCount) {
    const refreshes = document.createElement('span');
    refreshes.className = 'refresh-count';
    refreshes.title = `${refreshCount} automatic page refresh(es)`;
    refreshes.textContent = `↻${refreshCount}`;
    summary.appendChild(refreshes);
  }
  const addIcon = (svg: string): void => {
    const icon = document.createElement('span');
    icon.innerHTML = svg;
    summary.appendChild(icon);
  };
  if (info.local) {
    summary.appendChild(document.createTextNode('Local dev'));
  } else if (info.prebid && info.gpt) {
    addIcon(GPT_ICON);
    addIcon(PREBID_ICON);
    summary.appendChild(document.createTextNode('GPT + Prebid'));
  } else if (info.prebid) {
    addIcon(PREBID_ICON);
    summary.appendChild(document.createTextNode(`Prebid.js v${info.prebid.version}`));
  } else if (info.gpt) {
    addIcon(GPT_ICON);
    summary.appendChild(document.createTextNode(`GPT v${info.gpt.version}`));
  } else {
    summary.appendChild(document.createTextNode('None detected'));
  }
  head.appendChild(summary);

  // If OneTag is present (a Prebid bidder, or the hb_bidder served via GPT),
  // show a toggle left of the method summary that controls onetag highlighting.
  const onetagInPrebid = !!info.prebid?.adUnits.some((u) =>
    u.bids.some((b) => isOnetagBidder(b.bidder))
  );
  const onetagInGpt = !!info.gpt?.slots.some((s) => s.onetag);
  if (onetagInPrebid || onetagInGpt) {
    const toggle = document.createElement('span');
    toggle.className = highlightOnetag ? 'ot-toggle' : 'ot-toggle off';
    toggle.title = 'OneTag detected — click to toggle row highlighting';
    toggle.addEventListener('click', (event) => {
      event.stopPropagation(); // don't collapse/expand the section
      highlightOnetag = !highlightOnetag;
      integrationEl.classList.toggle('hl', highlightOnetag);
      toggle.classList.toggle('off', !highlightOnetag);
    });
    summary.insertBefore(toggle, summary.firstChild);
  }

  integrationEl.appendChild(head);

  // Body: shown only when expanded.
  const body = document.createElement('div');
  body.className = 'ibody';
  body.style.display = integrationExpanded ? 'block' : 'none';
  buildIntegrationBody(body, info);
  integrationEl.appendChild(body);

  head.addEventListener('click', () => {
    integrationExpanded = !integrationExpanded;
    triangle.textContent = integrationExpanded ? '▾' : '▸';
    body.style.display = integrationExpanded ? 'block' : 'none';
  });
}

function refreshSeparator(): HTMLDivElement {
  const sep = document.createElement('div');
  sep.className = 'refresh-sep';
  sep.textContent = '↻ page refreshed';
  return sep;
}

function buildIntegrationBody(body: HTMLElement, info: IntegrationInfo): void {
  if (info.local) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = 'Local development environment (local.onetag.net) — no integration method.';
    body.appendChild(note);
    return;
  }
  if (!info.prebid && !info.gpt) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = 'No integration method detected in the main window.';
    body.appendChild(note);
    return;
  }

  if (info.prebid) buildPrebidSection(body, info.prebid, !!info.gpt);
  if (info.gpt) buildGptSection(body, info.gpt, !!info.prebid);
}

function buildPrebidSection(body: HTMLElement, p: PrebidInfo, dual: boolean): void {
  if (dual) body.appendChild(subHeading('Prebid', PREBID_ICON));

  // Auctions: stats + the auctions captured across page auto-refreshes.
  body.appendChild(subLabel('Auctions'));
  const chips = document.createElement('div');
  chips.className = 'chips';
  chips.appendChild(chip(`auctions ${p.auctionCount}`));
  chips.appendChild(chip(`wins ${p.winningCount}`));
  if (p.timeoutCount) chips.appendChild(chip(`timeouts ${p.timeoutCount}`));
  if (p.rejectedCount) chips.appendChild(chip(`rejected ${p.rejectedCount}`));
  chips.appendChild(chip(`floors ${p.floorsModule ? 'on' : 'off'}`));
  if (p.currency) chips.appendChild(chip(p.currency));
  if (p.bidderTimeout != null) chips.appendChild(chip(`${p.bidderTimeout}ms`));
  body.appendChild(chips);
  auctionHistory.forEach((adUnits, segment) => {
    for (const u of adUnits) {
      body.appendChild(renderAuction(u, { frozen: true, keyPrefix: `ph${segment}:` }));
    }
    body.appendChild(refreshSeparator());
  });

  // AdUnits: current per-ad-unit breakdown.
  body.appendChild(subLabel('AdUnits'));
  for (const u of p.adUnits) body.appendChild(renderAuction(u));
}

function buildGptSection(body: HTMLElement, g: GptInfo, dual: boolean): void {
  if (dual) body.appendChild(subHeading('GPT', GPT_ICON));

  // Renders: stats + the slot renders captured across page auto-refreshes.
  body.appendChild(subLabel('Renders'));
  const renderedCount = g.slots.filter((s) => s.rendered).length;
  const onetagCount = g.slots.filter((s) => s.onetag).length;
  const chips = document.createElement('div');
  chips.className = 'chips';
  chips.appendChild(chip(`slots ${g.slotCount}`));
  chips.appendChild(chip(`rendered ${renderedCount}`));
  if (onetagCount) chips.appendChild(chip(`onetag ${onetagCount}`));
  chips.appendChild(chip(`v${g.version}`));
  body.appendChild(chips);
  gptHistory.forEach((slots, segment) => {
    for (const s of slots) {
      body.appendChild(renderGptSlot(s, { frozen: true, keyPrefix: `gh${segment}:` }));
    }
    body.appendChild(refreshSeparator());
  });

  // Slots: current slots.
  body.appendChild(subLabel('Slots'));
  for (const s of g.slots) body.appendChild(renderGptSlot(s));
}

function gptParticipated(s: GptSlot): boolean {
  return s.rendered || s.isEmpty === true || !!s.hbBidder;
}

function subLabel(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'section-sublabel';
  el.textContent = text;
  return el;
}

function subHeading(text: string, iconSvg: string | null): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'subhead';
  if (iconSvg) {
    const icon = document.createElement('span');
    icon.innerHTML = iconSvg;
    el.appendChild(icon);
  }
  el.appendChild(document.createTextNode(text));
  return el;
}

function renderGptSlot(
  s: GptSlot,
  opts: { frozen?: boolean; keyPrefix?: string } = {}
): HTMLDivElement {
  const frozen = !!opts.frozen;
  const key = `${opts.keyPrefix ?? 'gpt:'}${s.elementId || s.adUnitPath}`;
  // OneTag served via GPT (hb_bidder=onetag and a creative rendered) => "won".
  // OneTag was the winner handed to GAM but nothing rendered => "lost".
  const onetagWon = s.onetag && s.rendered;
  const onetagLost = s.onetag && !s.rendered;
  const expanded = unitOverride.has(key) ? !!unitOverride.get(key) : onetagWon && !frozen;

  const block = document.createElement('div');
  block.className = 'unit';
  if (frozen) block.classList.add('frozen');
  if (onetagWon) block.classList.add('ot-won');
  else if (onetagLost) block.classList.add('ot-lost');

  const head = document.createElement('div');
  head.className = 'uhead';

  const triangle = document.createElement('span');
  triangle.className = 'tw';
  triangle.textContent = expanded ? '▾' : '▸';
  head.appendChild(triangle);

  const code = document.createElement('span');
  code.className = 'code';
  code.textContent = s.elementId || s.adUnitPath;
  head.appendChild(code);

  // Render state (what GAM actually delivered) shown separately from the Prebid
  // hb_bidder targeting, so "rubicon" isn't mistaken for "served by rubicon".
  const status = document.createElement('span');
  status.className = 'slot-state';
  const state = document.createElement('span');
  if (s.rendered) {
    state.style.color = '#2ea043';
    state.textContent = 'rendered';
  } else if (s.isEmpty) {
    state.style.color = '#ed1c24';
    state.textContent = 'empty';
  } else {
    state.textContent = 'pending';
  }
  status.appendChild(state);
  if (s.hbBidder) {
    const hb = document.createElement('span');
    hb.className = 'hb';
    hb.textContent = ` · hb_bidder ${s.hbBidder}`;
    status.appendChild(hb);
  }
  head.appendChild(status);

  if (s.alive && s.elementId && !frozen) {
    const go = document.createElement('button');
    go.className = 'go';
    go.textContent = '↗';
    go.title = 'Reveal and scroll to this slot’s element in the Elements panel';
    go.addEventListener('click', (event) => {
      event.stopPropagation();
      revealAdUnit(s.elementId as string);
    });
    head.appendChild(go);
  }

  const list = document.createElement('div');
  list.className = 'ubody';
  list.style.display = expanded ? 'block' : 'none';
  list.appendChild(kv('ad unit path', s.adUnitPath));
  if (s.elementId) list.appendChild(kv('element', `#${s.elementId}${s.alive ? '' : ' (removed)'}`));
  if (s.sizes) list.appendChild(kv('sizes', s.sizes));
  if (s.hbBidder) {
    const row = kv('hb_bidder', s.hbPb ? `${s.hbBidder} (hb_pb ${s.hbPb})` : s.hbBidder);
    if (s.onetag) row.classList.add('has-onetag');
    list.appendChild(row);
  }
  list.appendChild(kv('render', s.rendered ? `rendered ${s.renderedSize || ''}`.trim() : s.isEmpty ? 'empty' : 'pending'));
  if (s.lineItemId != null) list.appendChild(kv('line item', String(s.lineItemId)));
  if (s.creativeId != null) list.appendChild(kv('creative', String(s.creativeId)));
  if (s.advertiserId != null) list.appendChild(kv('advertiser', String(s.advertiserId)));

  head.addEventListener('click', () => {
    const open = list.style.display === 'none';
    unitOverride.set(key, open);
    list.style.display = open ? 'block' : 'none';
    triangle.textContent = open ? '▾' : '▸';
  });

  block.appendChild(head);
  block.appendChild(list);
  return block;
}

function kv(label: string, value: string): HTMLDivElement {
  const v = document.createElement('span');
  v.textContent = value;
  return kvNode(label, v);
}

function kvNode(label: string, value: Node): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'kv';
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = label;
  const v = document.createElement('span');
  v.className = 'v';
  v.appendChild(value);
  row.appendChild(k);
  row.appendChild(v);
  return row;
}

function renderAuction(u: PrebidAdUnit, opts: { frozen?: boolean; keyPrefix?: string } = {}): HTMLDivElement {
  const frozen = !!opts.frozen;
  const key = `${opts.keyPrefix ?? ''}${u.code}`;
  const onetagWon = u.bids.some((b) => isOnetagBidder(b.bidder) && b.status === 'won');
  const onetagBid = u.bids.some((b) => isOnetagBidder(b.bidder));
  const winner = u.bids.find((b) => b.status === 'won') || null;
  // Default: expanded only when OneTag won (and not a frozen history segment);
  // otherwise collapsed. A "lost" OneTag auction is collapsed but emphasised. A
  // manual toggle overrides the default.
  const expanded = unitOverride.has(key) ? !!unitOverride.get(key) : onetagWon && !frozen;

  const block = document.createElement('div');
  block.className = 'unit';
  if (frozen) block.classList.add('frozen');
  if (onetagWon) block.classList.add('ot-won');
  else if (onetagBid) block.classList.add('ot-lost');

  const head = document.createElement('div');
  head.className = 'uhead';
  if (ONETAG_RE.test(u.code)) head.classList.add('has-onetag');

  const triangle = document.createElement('span');
  triangle.className = 'tw';
  triangle.textContent = expanded ? '▾' : '▸';
  head.appendChild(triangle);

  const code = document.createElement('span');
  code.className = 'code';
  code.textContent = u.code;
  head.appendChild(code);

  if (u.floor != null) {
    const floor = document.createElement('span');
    floor.className = 'floor';
    floor.textContent = `floor ${u.floor}`;
    head.appendChild(floor);
  }

  if (winner) {
    const win = document.createElement('span');
    win.className = 'winner';
    const cpm = winner.cpm != null ? ` ${winner.cpm.toFixed(2)}${winner.currency ? ` ${winner.currency}` : ''}` : '';
    win.textContent = `win ${winner.bidder}${cpm}`;
    head.appendChild(win);

    // Arrow to reveal the ad unit element in Elements — only while the slot is
    // alive in the DOM (a frozen history segment's slot no longer exists).
    if (u.alive && !frozen) {
      const go = document.createElement('button');
      go.className = 'go';
      go.textContent = '↗';
      go.title = 'Reveal this ad unit’s element in the Elements panel';
      go.addEventListener('click', (event) => {
        event.stopPropagation();
        revealAdUnit(u.code);
      });
      head.appendChild(go);
    }
  }

  const list = document.createElement('div');
  list.className = 'ubody';
  list.style.display = expanded ? 'block' : 'none';
  for (const b of u.bids) list.appendChild(renderBidRow(b));

  head.addEventListener('click', () => {
    const open = list.style.display === 'none';
    unitOverride.set(key, open);
    list.style.display = open ? 'block' : 'none';
    triangle.textContent = open ? '▾' : '▸';
  });

  block.appendChild(head);
  block.appendChild(list);
  return block;
}

function renderBidRow(b: PrebidBid): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'bid';
  if (isOnetagBidder(b.bidder) || (b.statusMessage && ONETAG_RE.test(b.statusMessage))) {
    row.classList.add('has-onetag');
  }

  const bidder = document.createElement('span');
  bidder.className = 'bidder';
  bidder.textContent = b.bidder;
  row.appendChild(bidder);

  const cpm = document.createElement('span');
  cpm.className = 'cpm';
  cpm.textContent = b.cpm != null ? `${b.cpm.toFixed(2)}${b.currency ? ` ${b.currency}` : ''}` : '—';
  row.appendChild(cpm);

  const st = document.createElement('span');
  st.className = `st ${b.status}`;
  st.textContent = b.status;
  row.appendChild(st);

  if (b.status !== 'won' && b.statusMessage) {
    const reason = document.createElement('span');
    reason.className = 'reason';
    reason.textContent = b.statusMessage;
    row.appendChild(reason);
  }
  return row;
}
