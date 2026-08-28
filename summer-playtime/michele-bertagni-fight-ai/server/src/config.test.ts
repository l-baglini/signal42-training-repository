import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_DAYS_BACK, isDayOffset, parseSubreddits, startOfDayBack } from './config.js';

test('only today through four days back are accepted', () => {
  assert.equal(MAX_DAYS_BACK, 4);
  for (const ok of [0, 1, 2, 3, 4]) assert.equal(isDayOffset(ok), true);
  for (const bad of [-1, 5, 30, 1.5, Number.NaN]) assert.equal(isDayOffset(bad), false);
});

test('TODAY starts at local midnight this morning', () => {
  const now = new Date(2026, 7, 28, 14, 37, 5);
  const start = new Date(startOfDayBack(0, now));
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 7);
  assert.equal(start.getDate(), 28);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
});

test('each step back moves the window one whole day earlier', () => {
  const now = new Date(2026, 7, 28, 14, 37, 5);
  const day = 24 * 60 * 60 * 1000;
  for (const offset of [1, 2, 3, 4] as const) {
    assert.equal(startOfDayBack(0, now) - startOfDayBack(offset, now), offset * day);
  }
});

test('stepping back across a month boundary works', () => {
  const now = new Date(2026, 8, 2, 9, 0, 0); // 2 September
  const start = new Date(startOfDayBack(4, now));
  assert.equal(start.getMonth(), 7); // August
  assert.equal(start.getDate(), 29);
});

test('subreddit names are parsed leniently but validated strictly', () => {
  assert.deepEqual(parseSubreddits('singularity,artificial'), ['singularity', 'artificial']);
  assert.deepEqual(parseSubreddits(' r/Singularity , /r/artificial '), ['Singularity', 'artificial']);
  assert.deepEqual(parseSubreddits('singularity,singularity'), ['singularity']);
});

test('anything that is not a plain subreddit name is dropped', () => {
  assert.deepEqual(parseSubreddits('good,../../etc/passwd'), ['good']);
  assert.deepEqual(parseSubreddits('good,evil?limit=999'), ['good']);
  assert.deepEqual(parseSubreddits('good,a b c'), ['good']);
  assert.deepEqual(parseSubreddits('x'), []);
});

test('at most five subreddits are honoured', () => {
  assert.equal(parseSubreddits('aa,bb,cc,dd,ee,ff,gg').length, 5);
});
