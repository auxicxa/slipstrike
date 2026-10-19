import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProfane, sanitizeName, makeRoomCode } from '../shared/util/profanity.js';

test('blocks obvious and leetspeak profanity', () => {
  for (const n of ['fuck', 'FuCk99', 'sh1t', 'b1tch', 'f u c k', 'Big Dick', 'BigDick', 'xX_ass_Xx', 'shiiiit', 'grapeRape']) {
    assert.ok(isProfane(n), n);
  }
});

test('allows normal names (no Scunthorpe problem on common words)', () => {
  for (const n of ['Grape', 'Classic', 'Assassin', 'Torpedo', 'Janus', 'Peacock', 'Sniper_Wolf', 'Cucumber', 'Dickens', 'Sussex', 'Diego', 'Kai', 'Bass Drum']) {
    assert.ok(!isProfane(n), n);
  }
});

test('sanitizeName trims, limits to 16 chars and replaces bad names', () => {
  assert.equal(sanitizeName('  Hello   World  '), 'Hello World');
  assert.equal(sanitizeName('abcdefghijklmnopqrstuvwxyz').length, 16);
  assert.match(sanitizeName('fuckface'), /^Player\d{4}$/);
  assert.match(sanitizeName(''), /^Player\d{4}$/);
  assert.match(sanitizeName('<script>'), /^script$/);
  assert.match(sanitizeName(null), /^Player\d{4}$/);
});

test('room codes are 4 consonants and unique', () => {
  const taken = new Set();
  for (let i = 0; i < 500; i++) {
    const c = makeRoomCode(taken);
    assert.match(c, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    assert.ok(!taken.has(c));
    taken.add(c);
  }
});
