// Runs in the page's MAIN world at document_start — before GPT/Prebid load.
//
// Two jobs:
//  1. Classify this load (navigate / auto-refresh / user-refresh) for the
//     panel's auto-refresh tracking, using a user-gesture heuristic persisted
//     across reloads in sessionStorage.
//  2. Record GPT slotRenderEnded results into window.__otGptLog for the panel.

(() => {
  const w = window as any;
  const ssGet = (k: string): string | null => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const ssSet = (k: string, v: string): void => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  };

  w.__otGptLog = w.__otGptLog || {};

  // ---- Classify this load: navigate / auto-refresh / user-refresh -------
  // Record user gestures (persisted across reloads): F5/Ctrl-R fire a keydown,
  // a click/tap a pointerdown — a timed auto-refresh fires neither. So a reload
  // shortly after a gesture is user-initiated; otherwise it's automatic. (The
  // browser's own reload button isn't a page event, so it reads as automatic.)
  const stampGesture = (): void => ssSet('__otLastGesture', String(Date.now()));
  window.addEventListener('keydown', stampGesture, { capture: true, passive: true });
  window.addEventListener('pointerdown', stampGesture, { capture: true, passive: true });

  let navType = '';
  try {
    const entry = performance.getEntriesByType('navigation')[0] as any;
    if (entry && entry.type) navType = entry.type;
  } catch {
    /* ignore */
  }
  if (!navType) {
    const legacy = (performance as any).navigation;
    if (legacy) navType = legacy.type === 1 ? 'reload' : legacy.type === 2 ? 'back_forward' : 'navigate';
  }
  const pageKey = location.origin + location.pathname;
  const prevPageKey = ssGet('__otPageKey');
  ssSet('__otPageKey', pageKey);
  const gestureRecent = Date.now() - (Number(ssGet('__otLastGesture')) || 0) < 3000;
  if (prevPageKey == null || prevPageKey !== pageKey) {
    w.__otNavKind = 'navigate';
  } else if (navType === 'reload') {
    w.__otNavKind = gestureRecent ? 'user-refresh' : 'auto-refresh';
  } else {
    w.__otNavKind = 'navigate';
  }

  // ---- GPT slotRenderEnded log (read by the panel) ---------------------
  w.googletag = w.googletag || { cmd: [] };
  w.googletag.cmd.push(() => {
    try {
      w.googletag.pubads().addEventListener('slotRenderEnded', (e: any) => {
        const id = e.slot.getSlotElementId();
        w.__otGptLog[id] = {
          isEmpty: !!e.isEmpty,
          size: e.size ? (Array.isArray(e.size) ? e.size.join('x') : String(e.size)) : null,
          advertiserId: e.advertiserId != null ? e.advertiserId : null,
          lineItemId: e.lineItemId != null ? e.lineItemId : null,
          creativeId: e.creativeId != null ? e.creativeId : null,
          campaignId: e.campaignId != null ? e.campaignId : null,
        };
      });
    } catch {
      /* ignore */
    }
  });
})();
