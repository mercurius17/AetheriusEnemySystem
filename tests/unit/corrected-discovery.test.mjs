import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFormIdToStableIdentity, definingPluginFromFormId, DungeonScanner, classifyReference, resolveXpCategory } from '../../src/index.mjs';

test('houseCARL canonical FormID becomes a load-order-independent identity', () => {
  assert.equal(canonicalFormIdToStableIdentity('00ABCD:Bandit War.esp'), 'Bandit War.esp|00ABCD');
  assert.equal(definingPluginFromFormId('00ABCD:Bandit War.esp'), 'Bandit War.esp');
  assert.equal(canonicalFormIdToStableIdentity('FE012ABC'), null);
});

test('Hammet cells are grouped by resolved location and exterior-only groups are excluded', () => {
  const records = [
    { type: 'CELL', identity: 'HammetDungeon01.esm|000001', plugin: 'HammetDungeon01.esm', localFormId: 1, locationIdentity: 'HammetDungeon01.esm|000100', isInterior: true },
    { type: 'CELL', identity: 'HammetDungeon01.esm|000002', plugin: 'HammetDungeon01.esm', localFormId: 2, locationIdentity: 'HammetDungeon01.esm|000100', isInterior: true },
    { type: 'CELL', identity: 'HammetDungeon01.esm|000003', plugin: 'HammetDungeon01.esm', localFormId: 3, locationIdentity: 'HammetDungeon01.esm|000200', isInterior: false }
  ];
  const registry = new DungeonScanner().scan(records, { requireInterior: true });
  assert.equal(registry.profiles.length, 1);
  assert.deepEqual(registry.profiles[0].cells, ['HammetDungeon01.esm|000001', 'HammetDungeon01.esm|000002']);
});

test('a unique non-boss reference is quest-critical, not a generic boss', () => {
  assert.equal(classifyReference({ unique: true }).role, 'QUEST_CRITICAL');
  assert.equal(classifyReference({ unique: true, boss: true }).role, 'BOSS_UNIQUE');
  assert.equal(classifyReference({ unique: true }, { serverHasQuests: false }).role, 'BOSS_UNIQUE');
});

test('generic DWEMER has no invented centurion XP fallback', () => {
  assert.equal(resolveXpCategory('DWEMER'), null);
  assert.equal(resolveXpCategory('DWARVEN_CENTURION'), 'dwarven_centurion');
});
