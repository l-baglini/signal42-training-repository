import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseAdsTxt } from '../src/server/adstxt';
import type { SellerRecord } from '../src/types';

function fakeSellers(records: SellerRecord[]) {
  return {
    find: (query: any) => ({
      toArray: async () =>
        records.filter(
          (r) => r.sspDomain === query.sspDomain && query.sellerId.$in.includes(r.sellerId),
        ),
    }),
  } as any;
}

function stubFetchText(text: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, text: async () => text })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseAdsTxt', () => {
  it('annotates a matching seller and flags Open Bidding integrations', async () => {
    stubFetchText('pubmatic.com, 12345, DIRECT, cert123 # note here\n');
    const records: SellerRecord[] = [
      {
        sspDomain: 'pubmatic.com',
        sellerId: 12345,
        sellerPosition: 0,
        wasInsertedOnFirstImport: false,
        sellerName: 'Acme via OB',
        sellerDomain: 'acme.com',
        sellerType: 'PUBLISHER',
        importDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    ];

    const out = await parseAdsTxt(fakeSellers(records), 'example.com');

    expect(out).toContain('pubmatic.com');
    expect(out).toContain('12345');
    expect(out).toContain('Open Bidding');
    expect(out).toContain('acme.com');
    expect(out).toContain('added');
  });

  it('marks first-import sellers with N/A age and classifies non-OB as Other', async () => {
    stubFetchText('pubmatic.com, 777, DIRECT\n');
    const records: SellerRecord[] = [
      {
        sspDomain: 'pubmatic.com',
        sellerId: 777,
        sellerPosition: 0,
        wasInsertedOnFirstImport: true,
        sellerName: 'Plain Seller',
        sellerDomain: 'plain.com',
        importDate: new Date(),
      },
    ];

    const out = await parseAdsTxt(fakeSellers(records), 'example.com');
    expect(out).toContain('Other');
    expect(out).toContain('N/A');
  });

  it('drops lines with fewer than three fields', async () => {
    stubFetchText('pubmatic.com, 12345\nnot-a-real-line\n');
    const out = await parseAdsTxt(fakeSellers([]), 'example.com');
    expect(out).toBe('');
  });

  it('keeps unmatched entries and preserves inline comments', async () => {
    stubFetchText('unknown.com, 999, RESELLER, cert # keepme\n');
    const out = await parseAdsTxt(fakeSellers([]), 'example.com');
    expect(out).toContain('unknown.com');
    expect(out).toContain('999');
    expect(out).toContain('keepme');
  });

  it('handles string-id SSPs (non-numeric) without coercing ids', async () => {
    stubFetchText('media.net, ABC-1, DIRECT\n');
    const records: SellerRecord[] = [
      {
        sspDomain: 'media.net',
        sellerId: 'ABC-1',
        sellerPosition: 0,
        wasInsertedOnFirstImport: false,
        sellerName: 'String Seller',
        sellerDomain: 'string.com',
        importDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ];
    const out = await parseAdsTxt(fakeSellers(records), 'example.com');
    expect(out).toContain('media.net');
    expect(out).toContain('String Seller');
  });
});
