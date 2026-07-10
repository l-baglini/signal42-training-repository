import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';

function fakeDb() {
  return {
    collection: () => ({
      countDocuments: async () => 0,
      aggregate: () => ({ toArray: async () => [] }),
    }),
  } as any;
}

describe('createApp', () => {
  const app = createApp(fakeDb());

  it('serves the health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('redirects / to /sellers', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/sellers');
  });

  it('disables the x-powered-by header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
