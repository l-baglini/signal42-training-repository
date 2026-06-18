// Shared message contracts exchanged between the content scripts, the
// background service worker, and the DevTools panel.

export type Reason = 'iframe-src' | 'script';

/** An ad frame as serialized over the wire to the panel. */
export interface AdRecordWire {
  key: string;
  frameId: number;
  url: string;
  reasons: Reason[];
  // true once the ad's frame no longer exists: it was removed from the page
  // while the panel was observing it. Such entries are kept (non-clickable).
  closed: boolean;
  // Visibility problems found on the ad iframe or any of its ancestors
  // (display:none, 0×0, visibility:hidden, …). Empty when the ad is visible.
  hiddenReasons: string[];
}

/** content script -> background */
export type DetectionMessage = { type: 'onetag-detected'; url: string; reasons: Reason[] };

/** background -> content script (targeted at a specific frame) */
export type FrameCommand = { type: 'rescan' } | { type: 'check-visibility'; url: string };

/** content script -> background, response to check-visibility */
export interface VisibilityResponse {
  issues: string[];
}

/** panel -> background (over the long-lived port) */
export type PanelMessage =
  | { type: 'init'; tabId: number }
  | { type: 'inspect'; key: string }
  // Periodic nudge while the panel is open, so the background can notice frames
  // that were removed from the page (there is no DOM event for that).
  | { type: 'poll' };

export type NavKind = 'navigate' | 'auto-refresh' | 'user-refresh';

/** background -> panel (over the long-lived port) */
export type BackgroundToPanel =
  | { type: 'state'; ads: AdRecordWire[] }
  // Tells the DevTools panel which iframe to reveal in the Elements panel:
  // `adUrl` is the iframe's URL; `frameUrl` is the URL of the frame that
  // contains the iframe element (null when that is the top frame).
  | { type: 'inspect-target'; adUrl: string; frameUrl: string | null }
  // Top-frame navigation classified via webNavigation transition info.
  | { type: 'nav'; kind: NavKind };
