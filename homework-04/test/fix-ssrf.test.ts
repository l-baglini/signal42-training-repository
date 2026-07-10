import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseAdsTxt } from '../src/server/adstxt';

// Regression test for SSRF: the domain is user-supplied (POST /ads-txt body)
// and interpolated into `fetch('https://${domain}/ads.txt')`. Without a guard
// a caller can reach loopback, private ranges or the cloud metadata endpoint.
const BLOCKED = [
  'localhost',
  '127.0.0.1',
  '169.254.169.254',
  '10.0.0.1',
  '192.168.1.1',
  '172.16.0.1',
  'example.com/../@evil.com',
  'example.com:22',
];

function fakeSellers() {
  return { find: () => ({ toArray: async () => [] }) } as any;
}

describe('parseAdsTxt SSRF guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(BLOCKED)('rejects %s without performing any fetch', async (domain) => {
    const fetchSpy = vi.fn(async () => ({ ok: true, text: async () => '' }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(parseAdsTxt(fakeSellers(), domain)).rejects.toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still allows a normal public domain', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, text: async () => '' }));
    vi.stubGlobal('fetch', fetchSpy);

    await parseAdsTxt(fakeSellers(), 'example.com');
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String((fetchSpy.mock.calls[0] as any[])[0])).toBe('https://example.com/ads.txt');
  });
});
