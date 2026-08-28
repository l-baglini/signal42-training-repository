/**
 * Returns true if `host` is a syntactically valid IPv4 address whose
 * octets fall inside a loopback / private / link-local / unspecified range.
 */
function isDisallowedIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) {
    return false;
  }

  const octets = match.slice(1, 5).map((o) => Number(o));
  if (octets.some((o) => o < 0 || o > 255)) {
    // Not a valid IPv4 (octet out of range); treated as non-IP here.
    return false;
  }

  const [a, b] = octets;

  // 0.0.0.0/8       - "this" network / unspecified
  // 127.0.0.0/8     - loopback
  // 10.0.0.0/8      - private
  // 169.254.0.0/16  - link-local
  // 192.168.0.0/16  - private
  // 172.16.0.0/12   - private
  return (
    a === 0 ||
    a === 127 ||
    a === 10 ||
    (a === 169 && b === 254) ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}

/** Guards against SSRF: throws unless `domain` is a syntactically valid,
 *  public hostname (no IPs in private/loopback/link-local ranges, no
 *  URL-injection characters, no localhost). */
export function assertPublicDomain(domain: string): void {
  const reject = (): never => {
    throw new Error(`Refusing to fetch from disallowed host: ${domain}`);
  };

  if (typeof domain !== 'string' || domain.length === 0) {
    reject();
  }

  // Only letters, digits, dots and hyphens are allowed. This rejects
  // URL-injection characters such as '/', '@', ':' and whitespace, so inputs
  // like 'example.com/../@evil.com' and 'example.com:22' are refused here.
  if (!/^[a-z0-9.-]+$/i.test(domain)) {
    reject();
  }

  // A hostname must not begin or end with a '.' or '-'.
  if (/^[.-]/.test(domain) || /[.-]$/.test(domain)) {
    reject();
  }

  // Reject the loopback name outright (case-insensitive).
  if (domain.toLowerCase() === 'localhost') {
    reject();
  }

  // Reject IPv4 addresses in loopback / private / link-local / unspecified ranges.
  if (isDisallowedIpv4(domain)) {
    reject();
  }
}
