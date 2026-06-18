// Shared helpers for detecting Onetag URLs.

// An iframe / script belongs to Onetag when its URL is https on a OneTag host
// (one of these base domains OR any subdomain of them — production ads are
// served from subdomains like serv-eu-1.onetag-sys.com) — EXCEPT a few paths
// that are separate APIs, related to the ad system but distinct from it:
//   - /usync                       -> user-sync API
//   - /match, /server_match        -> cookie-matching endpoints
//   - /static/topicsapi.html       -> Topics API
//   - /static/creative-sandbox.html -> creative sandbox
//   - /invocation                  -> invocation endpoint
const ONETAG_HOSTS = ['onetag-sys.com', 'local.onetag.net'];
const EXCLUDED_PATHS = [
  '/usync',
  '/match',
  '/server_match',
  '/static/topicsapi.html',
  '/static/creative-sandbox.html',
  '/invocation',
];

// Matches a base host or any of its subdomains. The leading dot anchors the
// match at a label boundary, so "evil-onetag-sys.com" / "onetag-sys.com.evil"
// don't match.
function isOnetagHost(hostname: string): boolean {
  return ONETAG_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isOnetagUrl(url: string | null | undefined, base?: string): boolean {
  const resolved = resolveUrl(url, base);
  if (!resolved) return false;

  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch {
    return false;
  }

  // Use hostname (not host) so a non-default port like :9000 doesn't break the
  // comparison — e.g. https://local.onetag.net:9000/... must still match.
  if (parsed.protocol !== 'https:' || !isOnetagHost(parsed.hostname)) return false;

  // Ignore separate, non-ad API paths.
  if (isExcludedPath(parsed.pathname)) return false;

  return true;
}

// Resolve a possibly-relative URL against a base, returning null on failure.
export function resolveUrl(url: string | null | undefined, base?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}
