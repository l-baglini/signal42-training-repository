import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir, hostname } from 'node:os';

import { redact } from './redact.js';

test('filesystem paths are replaced', () => {
  assert.equal(
    redact(`Error: ENOENT open '${homedir()}/repo/fight-ai/.env'`),
    "Error: ENOENT open '<path>'",
  );
  assert.equal(redact('spawn /usr/local/bin/claude ENOENT'), 'spawn <path> ENOENT');
});

test('the hostname is replaced', () => {
  assert.ok(!redact(`failed on ${hostname()}`).includes(hostname()));
});

test('Reddit permalinks survive untouched - they are payload, not machine detail', () => {
  const url = 'https://www.reddit.com/r/singularity/comments/1vyu46c/ox_alpha_is_glm/';
  assert.equal(redact(url, Number.POSITIVE_INFINITY), url);
  const frame = JSON.stringify({ t: 'hit', permalink: url, title: 'AI is winning' });
  assert.equal(redact(frame, Number.POSITIVE_INFINITY), frame);
});

test('a redacted frame is still valid JSON', () => {
  const frame = JSON.stringify({ permalink: 'https://www.reddit.com/r/x/', title: 'a'.repeat(300) });
  assert.doesNotThrow(() => JSON.parse(redact(frame, Number.POSITIVE_INFINITY)));
});
