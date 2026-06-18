// Runs in EVERY frame of EVERY page (all_frames + <all_urls>).
//
// Detects whether THIS frame is an Onetag ad and reports it to the background
// service worker (which keys the report by sender.frameId, so one frame is one
// entry no matter how many reasons it matches):
//   - "iframe-src": this frame's own document URL is on a OneTag host, which is
//     exactly the case where an <iframe src="...onetag..."> loaded.
//   - "script": this frame's document contains a <script src="...onetag...">.
//
// Detection is purely self-reported per frame: an onetag-hosted iframe and an
// iframe running an onetag script both execute this content script, so the
// frame reports itself. Revealing an ad in the page is handled entirely by the
// DevTools panel (inspect()); this script only does detection.

import { isOnetagUrl, resolveUrl } from './common.js';
import type { DetectionMessage, FrameCommand, Reason } from './messages.js';

let lastSignature = '';

// The top document is not an iframe, so a publisher page that merely embeds the
// OneTag library script in its <head> must NOT count as an ad. Detection only
// applies inside sub-frames.
const isSubframe = window.top !== window.self;

function detectSelf(): Reason[] {
  const reasons: Reason[] = [];
  if (isOnetagUrl(location.href)) {
    reasons.push('iframe-src');
  }
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
    if (isOnetagUrl(script.getAttribute('src'), location.href)) {
      reasons.push('script');
      break;
    }
  }
  return reasons;
}

function report(): void {
  const reasons = isSubframe ? detectSelf() : [];

  // Avoid spamming the background with identical reports on every mutation.
  const signature = reasons.join(',');
  if (signature === lastSignature) return;
  lastSignature = signature;

  if (reasons.length > 0) {
    send({ type: 'onetag-detected', url: location.href, reasons });
  }
}

function send(message: DetectionMessage): void {
  try {
    void chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // Extension context can be invalidated on reload; ignore.
  }
}

// ---- Visibility check ---------------------------------------------------
// Find the <iframe> in this document that loaded the given child frame URL.
function findIframeByUrl(targetUrl: string): HTMLIFrameElement | null {
  const iframes = [...document.querySelectorAll<HTMLIFrameElement>('iframe')];
  for (const frame of iframes) {
    const resolved = resolveUrl(frame.getAttribute('src'), location.href);
    if (resolved && (resolved === targetUrl || resolved.startsWith(targetUrl) || targetUrl.startsWith(resolved))) {
      return frame;
    }
  }
  for (const frame of iframes) {
    try {
      if (frame.contentWindow && frame.contentWindow.location.href === targetUrl) return frame;
    } catch {
      // cross-origin
    }
  }
  return null;
}

function describe(el: Element): string {
  let s = el.tagName.toLowerCase();
  if (el.id) s += `#${el.id}`;
  else if (el.classList[0]) s += `.${el.classList[0]}`;
  return s;
}

// Reasons (if any) this element hides its descendants. Skips size when the
// element is display:none (the 0×0 of its descendants is just a consequence).
function elementIssues(el: Element): string[] {
  const issues: string[] = [];
  const cs = getComputedStyle(el);
  const tag = describe(el);
  if (cs.display === 'none') {
    issues.push(`${tag} display:none`);
    return issues;
  }
  if (cs.visibility === 'hidden' || cs.visibility === 'collapse') {
    issues.push(`${tag} visibility:${cs.visibility}`);
  }
  if (parseFloat(cs.opacity) === 0) issues.push(`${tag} opacity:0`);
  const he = el as HTMLElement;
  if (he.offsetWidth === 0 || he.offsetHeight === 0) {
    issues.push(`${tag} ${he.offsetWidth}×${he.offsetHeight}`);
  }
  if (he.hidden) issues.push(`${tag} [hidden]`);
  return issues;
}

// Walk from the matched iframe up to the document root, collecting issues for
// the iframe element itself and each of its ancestors in THIS document.
function checkVisibility(url: string): string[] {
  const start = findIframeByUrl(url);
  if (!start) return [];
  const issues: string[] = [];
  let node: Element | null = start;
  while (node) {
    issues.push(...elementIssues(node));
    if (node === document.documentElement) break;
    node = node.parentElement;
  }
  return issues;
}

chrome.runtime.onMessage.addListener((message: FrameCommand, _sender, sendResponse) => {
  if (message.type === 'rescan') {
    // The background asks for a fresh report (e.g. after a service-worker
    // restart wiped its in-memory state).
    lastSignature = '';
    report();
    return;
  }
  if (message.type === 'check-visibility') {
    sendResponse({ issues: checkVisibility(message.url) });
    return true;
  }
  return;
});

// ---- Wiring -------------------------------------------------------------

report();

const observer = new MutationObserver(() => {
  // report() itself dedupes via the signature check.
  report();
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['src'],
});

// Catch frames that navigate / finish loading after document_idle.
window.addEventListener('load', report);
