import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { ssps } from '../src/ssp-list';
import type { SellerRecord } from '../src/types';

// Regression test for stored XSS: seller data comes from third-party
// sellers.json files and is emitted into an inline <script> via
// `<%- JSON.stringify(ssps) %>`. JSON.stringify does NOT neutralise the
// `</script>` sequence, so a malicious seller name can break out of the
// script element and inject markup.
const PAYLOAD = '</script><script>alert(document.cookie)</script>';

function fakeDb(sellers: SellerRecord[]) {
  return {
    collection: () => ({
      countDocuments: async () => sellers.length,
      aggregate: () => ({ toArray: async () => sellers }),
      find: () => ({ toArray: async () => [] }),
    }),
  } as any;
}

describe('stored XSS in /sellers inline script', () => {
  it('does not emit a raw </script> break-out from seller data', async () => {
    const seller: SellerRecord = {
      sspDomain: ssps[0].domain,
      sellerId: 1,
      sellerPosition: 0,
      wasInsertedOnFirstImport: false,
      sellerName: PAYLOAD,
      sellerDomain: 'evil.com',
      importDate: new Date(),
    };
    const app = createApp(fakeDb([seller]));

    const res = await request(app).get('/sellers').query({ ssp_ids: '0' });

    expect(res.status).toBe(200);
    // The injected closing tag + new script must never appear verbatim.
    expect(res.text).not.toContain('</script><script>alert');
  });
});
