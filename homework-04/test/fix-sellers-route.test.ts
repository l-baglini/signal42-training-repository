import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import type { SellerRecord } from '../src/types';

// Regression tests for the /sellers route hardening:
//  1. Express 4 does not catch rejected async handlers -> a DB error must be
//     turned into a 500 instead of leaving the request hanging.
//  2. `page` / `page-size` come straight from the query string; non-numeric or
//     negative values must never reach Mongo as NaN/negative $limit/$skip.

function throwingDb() {
  return {
    collection: () => ({
      countDocuments: async () => 0,
      aggregate: () => {
        throw new Error('boom');
      },
      find: () => ({ toArray: async () => [] }),
    }),
  } as any;
}

function capturingDb(captured: any[]) {
  return {
    collection: () => ({
      countDocuments: async () => 0,
      aggregate: (pipeline: any[]) => {
        captured.push(pipeline);
        return { toArray: async () => [] };
      },
      find: () => ({ toArray: async () => [] }),
    }),
  } as any;
}

describe('/sellers hardening', () => {
  it('returns 500 (does not hang) when the database throws', async () => {
    const app = createApp(throwingDb());
    const res = await request(app).get('/sellers').query({ ssp_ids: '0' });
    expect(res.status).toBe(500);
  });

  it('sanitises non-numeric page-size and negative page before querying Mongo', async () => {
    const captured: any[] = [];
    const app = createApp(capturingDb(captured));
    const res = await request(app)
      .get('/sellers')
      .query({ ssp_ids: '0', page: '-5', 'page-size': 'abc' });

    expect(res.status).toBe(200);
    expect(captured.length).toBeGreaterThan(0);
    for (const pipeline of captured) {
      const limit = pipeline.find((s: any) => '$limit' in s)?.$limit;
      const skip = pipeline.find((s: any) => '$skip' in s)?.$skip;
      expect(Number.isFinite(limit)).toBe(true);
      expect(limit).toBeGreaterThan(0);
      expect(Number.isFinite(skip)).toBe(true);
      expect(skip).toBeGreaterThanOrEqual(0);
    }
  });
});
