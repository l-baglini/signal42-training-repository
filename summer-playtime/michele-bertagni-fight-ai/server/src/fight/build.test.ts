import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FightState, type Classified } from './build.js';

const item = (sentiment: Classified['sentiment']): Classified => ({
  clean: 'title', permalink: 'https://example.invalid', sentiment,
  flagged: false, flagReasons: [], source: 'model',
});

test('positive sentiment makes the AI hit the human', () => {
  const fight = new FightState();
  const [event] = fight.apply(item('positive'));
  assert.equal(event?.t, 'hit');
  if (event?.t === 'hit') {
    assert.equal(event.attacker, 'AI');
    assert.deepEqual(event.hp, { human: 9, ai: 10 });
  }
});

test('negative sentiment makes the human hit the AI', () => {
  const fight = new FightState();
  const [event] = fight.apply(item('negative'));
  if (event?.t === 'hit') assert.equal(event.attacker, 'HUMAN');
});

test('neutral sentiment is a clinch and costs nobody health', () => {
  const fight = new FightState();
  const [event] = fight.apply(item('neutral'));
  assert.equal(event?.t, 'clinch');
  assert.deepEqual(fight.health, { human: 10, ai: 10 });
});

test('ten hits knock the loser down and end the fight', () => {
  const fight = new FightState();
  let last;
  for (let i = 0; i < 10; i++) last = fight.apply(item('positive'));
  assert.equal(last?.at(-1)?.t, 'ko');
  assert.equal(fight.isOver, true);
  assert.deepEqual(fight.health, { human: 0, ai: 10 });
  assert.deepEqual(fight.apply(item('positive')), []); // nothing after the KO
});

test('moves alternate between punch and kick', () => {
  const fight = new FightState();
  const first = fight.apply(item('positive'))[0];
  const second = fight.apply(item('positive'))[0];
  if (first?.t === 'hit' && second?.t === 'hit') assert.notEqual(first.move, second.move);
});
