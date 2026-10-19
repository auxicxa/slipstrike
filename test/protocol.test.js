import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage, C, BTN_ALL } from '../shared/net/protocol.js';

test('valid messages parse into clean objects', () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'in', s: 5, b: 3, y: 1.5, p: -0.2, w: 0, v: 100.5, extra: 'x' })), { t: 'in', s: 5, b: 3, y: 1.5, p: -0.2, w: 0, v: 100.5 });
  assert.deepEqual(parseClientMessage('{"t":"join","code":"abcd"}'), { t: 'join', code: 'ABCD' });
  assert.equal(parseClientMessage('{"t":"ready","ready":"yes"}').ready, false);
});

test('malformed and hostile messages are rejected (never throw)', () => {
  const bad = [
    undefined, null, 42, '', 'not json', '[]', 'null', '"str"', '{}', '{"t":5}', '{"t":"nope"}', '{"t":"__proto__"}',
    '{"t":"constructor"}', '{"t":"toString"}',
    JSON.stringify({ t: 'in', s: -1, b: 0, y: 0, p: 0, w: 0, v: 0 }),
    JSON.stringify({ t: 'in', s: 1.5, b: 0, y: 0, p: 0, w: 0, v: 0 }),
    JSON.stringify({ t: 'in', s: 1, b: BTN_ALL + 1, y: 0, p: 0, w: 0, v: 0 }),
    JSON.stringify({ t: 'in', s: 1, b: 0, y: 'x', p: 0, w: 0, v: 0 }),
    JSON.stringify({ t: 'in', s: 1, b: 0, y: 0, p: 9, w: 0, v: 0 }),
    JSON.stringify({ t: 'in', s: 1, b: 0, y: 0, p: 0, w: 7, v: 0 }),
    JSON.stringify({ t: 'in', s: 1, b: 0, y: 0, p: 0, w: 0 }),
    '{"t":"in","s":1,"b":0,"y":1e999,"p":0,"w":0,"v":0}',
    JSON.stringify({ t: 'hello', name: 5 }), JSON.stringify({ t: 'hello', name: 'x'.repeat(100) }),
    JSON.stringify({ t: 'join', code: 'TOOLONGCODE' }), JSON.stringify({ t: 'mode', mode: { a: 1 } }),
    JSON.stringify({ t: 'qc', i: 8 }), JSON.stringify({ t: 'loadout', p: 1, s: 2 }), 'x'.repeat(5000),
  ];
  for (const m of bad) assert.equal(parseClientMessage(m), null, String(m).slice(0, 60));
});

test('random fuzzing never throws', () => {
  const keys = ['t', 's', 'b', 'y', 'p', 'w', 'v', 'name', 'code', 'mode', 'i', 'ready', 'c'];
  const vals = [0, -1, 1e308, NaN, null, true, 'x', [], {}, 'in', 'hello', 'join', 'ping', 'qc', 1.5, '🙂'];
  for (let i = 0; i < 5000; i++) {
    const o = {};
    for (let k = 0; k < 1 + (i % 6); k++) o[keys[(i * 7 + k * 13) % keys.length]] = vals[(i * 11 + k * 3) % vals.length];
    if (i % 3 === 0) o.t = Object.values(C)[i % Object.values(C).length];
    assert.doesNotThrow(() => parseClientMessage(JSON.stringify(o)));
  }
});
