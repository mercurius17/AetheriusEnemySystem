import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReachability, resolveListDeterministic } from '../../src/index.mjs';

test('simple and nested LVLN reachability resolves terminal NPCs', () => {
  const report = analyzeReachability({
    roots: ['root'],
    lists: new Map([
      ['root', { entries: [{ formId: 'nested', level: 1, count: 1 }] }],
      ['nested', { entries: [{ formId: 'npc', level: 1, count: 1 }] }]
    ]),
    npcs: new Map([['npc', { id: 'npc' }]])
  });
  assert.deepEqual(report.reachableNpcs, ['npc']);
  assert.equal(report.missing.length, 0);
  assert.equal(report.cycles.length, 0);
});

test('cycles and missing records are reported, not swallowed', () => {
  const cycle = analyzeReachability({ roots: ['a'], lists: new Map([['a', { entries: [{ formId: 'b' }] }], ['b', { entries: [{ formId: 'a' }] }]]) });
  assert.equal(cycle.cycles.length, 1);
  const missing = analyzeReachability({ roots: ['a'], lists: new Map([['a', { entries: [{ formId: 'missing' }] }]]) });
  assert.equal(missing.missing.length, 1);
});

test('threshold, UseAll, count, and chance-none are represented deterministically', () => {
  const lists = new Map([
    ['root', { useAll: true, entries: [{ formId: 'npcA', level: 1, count: 2 }, { formId: 'npcB', level: 5, count: 1 }] }],
    ['none', { chanceNone: 100, entries: [{ formId: 'npcA' }] }]
  ]);
  const all = resolveListDeterministic('root', lists, 'seed', { level: 1 });
  assert.deepEqual(all.formIds, ['npcA', 'npcA']);
  assert.equal(resolveListDeterministic('none', lists, 'seed').status, 'EMPTY');
});

test('partial chance-none is deterministic for the same seed', () => {
  const lists = new Map([['root', { chanceNone: 50, entries: [{ formId: 'npcA' }] }]]);
  assert.deepEqual(resolveListDeterministic('root', lists, 'same-seed'), resolveListDeterministic('root', lists, 'same-seed'));
});

test('CalculateForEach resolves a nested list independently for every count', () => {
  const lists = new Map([
    ['root', { entries: [{ formId: 'nested', count: 3 }] }],
    ['nested', { calculateForEach: true, entries: [{ formId: 'npcA' }, { formId: 'npcB' }] }]
  ]);
  const result = resolveListDeterministic('root', lists, 'seed');
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.formIds.length, 3);
  assert.ok(result.formIds.every((id) => ['npcA', 'npcB'].includes(id)));
});
