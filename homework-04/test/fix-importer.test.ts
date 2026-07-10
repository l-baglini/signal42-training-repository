import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression tests for importer resilience: a single failing SSP (network
// error or a non-2xx response served as HTML) must not abort the whole import,
// and the connection must always be closed.
const h = vi.hoisted(() => {
  const countDocuments = vi.fn(async () => 0);
  const findOne = vi.fn(async () => null as unknown);
  const insertOne = vi.fn(async () => ({}));
  const collection = vi.fn(() => ({ countDocuments, findOne, insertOne }));
  const connect = vi.fn(async () => ({ collection }));
  const close = vi.fn(async () => undefined);
  return { countDocuments, findOne, insertOne, collection, connect, close };
});

vi.mock('../src/db', () => ({ connect: h.connect, close: h.close }));
vi.mock('../src/ssp-list', () => ({
  ssps: [
    { domain: 'broken.com', numericSellerId: true },
    { domain: 'good.com', numericSellerId: true },
  ],
}));

describe('importSellers resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findOne.mockResolvedValue(null);
    h.countDocuments.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('continues to the next SSP when one fetch rejects, and still closes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('broken.com')) throw new Error('network down');
        return { ok: true, json: async () => ({ sellers: [{ seller_id: '1', name: 'ok' }] }) };
      }),
    );
    const { importSellers } = await import('../src/import/import-sellers');

    await expect(importSellers()).resolves.toBeUndefined();
    expect(h.insertOne).toHaveBeenCalledTimes(1);
    expect(h.insertOne.mock.calls[0][0]).toMatchObject({ sspDomain: 'good.com' });
    expect(h.close).toHaveBeenCalledOnce();
  });

  it('skips non-2xx responses instead of parsing an error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('broken.com')) {
          return {
            ok: false,
            status: 404,
            json: async () => {
              throw new Error('not JSON');
            },
          };
        }
        return { ok: true, json: async () => ({ sellers: [{ seller_id: '2', name: 'ok' }] }) };
      }),
    );
    const { importSellers } = await import('../src/import/import-sellers');

    await expect(importSellers()).resolves.toBeUndefined();
    expect(h.insertOne).toHaveBeenCalledTimes(1);
    expect(h.insertOne.mock.calls[0][0]).toMatchObject({ sspDomain: 'good.com' });
  });
});
