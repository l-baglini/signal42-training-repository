import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import type { SellerRecord } from '../src/types';

function fakeDb(sellers: SellerRecord[]) {
  return {
    collection: () => ({
      countDocuments: async () => sellers.length,
      aggregate: () => ({ toArray: async () => sellers }),
      find: () => ({ toArray: async () => [] }),
    }),
  } as any;
}

const sampleSeller: SellerRecord = {
  sspDomain: 'adform.com',
  sellerId: 1,
  sellerPosition: 0,
  wasInsertedOnFirstImport: false,
  sellerName: 'Sample Seller',
  sellerDomain: 'sample.com',
  importDate: new Date(),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /sellers', () => {
  it('renders the sellers page with data', async () => {
    const app = createApp(fakeDb([sampleSeller]));
    const res = await request(app).get('/sellers').query({ 'ssp_ids': '0', page: '0', 'page-size': '5' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sellers Inspector');
  });

  it('applies date filters without error', async () => {
    const app = createApp(fakeDb([sampleSeller]));
    const res = await request(app)
      .get('/sellers')
      .query({ 'ssp_ids': '0', 'from-date': '2024-01-01', 'to-date': '2024-12-31' });
    expect(res.status).toBe(200);
  });
});

describe('GET /ads-txt', () => {
  it('renders the ads.txt inspector form', async () => {
    const app = createApp(fakeDb([]));
    const res = await request(app).get('/ads-txt');
    expect(res.status).toBe(200);
    expect(res.text).toContain('ads.txt inspector');
  });
});

describe('POST /ads-txt', () => {
  it('returns 400 when the body is invalid', async () => {
    const app = createApp(fakeDb([]));
    const res = await request(app).post('/ads-txt').send({});
    expect(res.status).toBe(400);
  });

  it('returns annotated contents for a valid domain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => 'pubmatic.com, 1, DIRECT\n' })),
    );
    const app = createApp(fakeDb([]));
    const res = await request(app).post('/ads-txt').send({ domain: 'example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('contents');
  });

  it('returns 500 when the upstream fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const app = createApp(fakeDb([]));
    const res = await request(app).post('/ads-txt').send({ domain: 'example.com' });
    expect(res.status).toBe(500);
  });
});
