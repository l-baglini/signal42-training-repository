import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekStartUTC } from '../src/lib/week.js';

test('weekStartUTC returns Monday 00:00 UTC', () => {
  // Friday 2026-06-12 -> Monday 2026-06-08
  const ws = weekStartUTC(new Date(Date.UTC(2026, 5, 12, 15, 30)));
  assert.equal(ws.toISOString(), '2026-06-08T00:00:00.000Z');
});

test('weekStartUTC is idempotent on a Monday midnight', () => {
  const monday = new Date(Date.UTC(2026, 5, 8, 0, 0));
  assert.equal(weekStartUTC(monday).toISOString(), monday.toISOString());
});

test('Sunday belongs to the preceding Monday week', () => {
  const ws = weekStartUTC(new Date(Date.UTC(2026, 5, 14, 23, 59)));
  assert.equal(ws.toISOString(), '2026-06-08T00:00:00.000Z');
});
