import { describe, it, expect } from 'vitest';
import { ssps } from '../src/ssp-list';

describe('ssp-list', () => {
  it('contains SSP entries', () => {
    expect(ssps.length).toBeGreaterThan(0);
  });

  it('is sorted alphabetically by domain', () => {
    const domains = ssps.map((s) => s.domain);
    const sorted = [...domains].sort((a, b) => a.localeCompare(b));
    expect(domains).toEqual(sorted);
  });

  it('has a well-formed shape for every entry', () => {
    for (const ssp of ssps) {
      expect(typeof ssp.domain).toBe('string');
      expect(ssp.domain.length).toBeGreaterThan(0);
      expect(typeof ssp.numericSellerId).toBe('boolean');
    }
  });
});
