import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    { domain: 'numeric.com', numericSellerId: true },
    { domain: 'string.com', numericSellerId: false },
  ],
}));

function stubSellersJson(sellers: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ sellers }) })),
  );
}

describe('importSellers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findOne.mockResolvedValue(null);
    h.countDocuments.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('inserts new sellers, coercing numeric ids and flagging first import', async () => {
    stubSellersJson([{ seller_id: '42', name: 'Seller', domain: 's.com', seller_type: 'PUBLISHER' }]);
    const { importSellers } = await import('../src/import/import-sellers');

    await importSellers();

    // Two SSPs, one seller each => two inserts.
    expect(h.insertOne).toHaveBeenCalledTimes(2);
    const numericInsert = h.insertOne.mock.calls.find((c: any[]) => c[0].sspDomain === 'numeric.com')?.[0];
    const stringInsert = h.insertOne.mock.calls.find((c: any[]) => c[0].sspDomain === 'string.com')?.[0];
    expect(numericInsert.sellerId).toBe(42);
    expect(stringInsert.sellerId).toBe('42');
    expect(numericInsert.wasInsertedOnFirstImport).toBe(true);
    expect(h.close).toHaveBeenCalledOnce();
  });

  it('skips sellers that already exist', async () => {
    stubSellersJson([{ seller_id: '42', name: 'Seller' }]);
    h.findOne.mockResolvedValue({ _id: 'x' });
    const { importSellers } = await import('../src/import/import-sellers');

    await importSellers();

    expect(h.insertOne).not.toHaveBeenCalled();
  });
});
