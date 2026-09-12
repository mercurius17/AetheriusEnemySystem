import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemyRegistry, EventHub, DeathBridge, InMemorySpawnStateStore, ManagedLootController, ServerAuthoritativeSpawnResolver, SkyMpIntegrationAdapter, unassignedProgressionContext, validateResolvedSpawn } from '../../src/index.mjs';

function enemy(id, level = 41) {
  return { stableEnemyIdentity: id, sourcePlugin: 'Fixture.esp', winningOverridePlugin: 'Fixture.esp', sourceRecordIdentity: id, enemyFamily: 'BANDIT', classificationStatus: 'RESOLVED', archetype: 'melee', spawnRole: 'GENERIC', sourceLevel: level, combatLevel: level, sourceWeight: 1, xpEligible: true, xpCategory: 'bandit', unique: false, quest: false, scripted: false, summonOnly: false, excluded: false };
}

test('server spawn is deterministic, persistent, and rerolls only on a new generation', () => {
  const store = new InMemorySpawnStateStore('unused');
  const resolver = new ServerAuthoritativeSpawnResolver({ registry: new EnemyRegistry([enemy('a', 41), enemy('b', 100)]), stateStore: store, serverSeed: 'server-seed' });
  const profile = { minEnemyLevel: 1, maxEnemyLevel: 100, allowedEnemyFamilies: ['BANDIT'] };
  const first = resolver.resolve({ spawnStableIdentity: 'HammetDungeon01.esm|000111|Cell', generation: 0, profile });
  const reconnect = resolver.resolve({ spawnStableIdentity: 'HammetDungeon01.esm|000111|Cell', generation: 0, profile });
  assert.equal(first.resolvedNpcStableIdentity, reconnect.resolvedNpcStableIdentity);
  assert.equal(reconnect.reused, true);
  const next = resolver.resolve({ spawnStableIdentity: 'HammetDungeon01.esm|000111|Cell', generation: resolver.beginRespawn('HammetDungeon01.esm|000111|Cell').respawnGeneration, profile });
  assert.equal(next.status, 'RESOLVED');
  assert.deepEqual(validateResolvedSpawn(first), []);
});

test('spawn fails closed when a candidate has no source-derived weight', () => {
  const unweighted = { ...enemy('unweighted'), sourceWeight: null };
  const resolver = new ServerAuthoritativeSpawnResolver({ registry: new EnemyRegistry([unweighted]), serverSeed: 'server-seed' });
  const result = resolver.resolve({ spawnStableIdentity: 'spawn', generation: 0, families: ['BANDIT'] });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.reason, 'POOL_WEIGHTING_UNASSIGNED');
});

test('death event is idempotent, preserves killer zero, and carries context without XP', () => {
  const hub = new EventHub();
  const events = [];
  hub.on('aetherius.enemy.killed.v1', (event) => events.push(event));
  const bridge = new DeathBridge({ eventHub: hub });
  const context = { ...unassignedProgressionContext('DUNGEON', 'fixture:dungeon'), provenance: 'fixture' };
  const payload = { victimId: 10, killerId: 0, enemy: { contractVersion: 1, managed: true, stableEnemyIdentity: 'Fixture.esp|000001', enemyFamily: 'BANDIT', archetype: null, spawnRole: 'GENERIC', sourceLevel: 41, combatLevel: 41, xpEligible: true, xpCategory: 'bandit', sourcePlugin: 'Fixture.esp', winningOverridePlugin: 'Fixture.esp', sourceRecordIdentity: 'Fixture.esp|000001' }, progressionContext: context, respawnGeneration: 0, deathGeneration: 0, occurredAt: 1 };
  assert.equal(bridge.publish(payload).event.killerId, 0);
  assert.equal(bridge.publish(payload).duplicate, true);
  assert.equal(events.length, 1);
  assert.equal('finalXp' in events[0], false);
});

test('different live actors sharing one NPC base produce different death event IDs', () => {
  const bridge = new DeathBridge();
  const context = unassignedProgressionContext('DUNGEON', 'fixture:dungeon');
  const enemyDescriptor = { contractVersion: 1, managed: true, stableEnemyIdentity: 'Fixture.esp|000001', enemyFamily: 'BANDIT', archetype: null, spawnRole: 'GENERIC', sourceLevel: 41, combatLevel: 41, xpEligible: true, xpCategory: 'bandit', sourcePlugin: 'Fixture.esp', winningOverridePlugin: 'Fixture.esp', sourceRecordIdentity: 'Fixture.esp|000001' };
  const first = bridge.publish({ victimId: 10, enemy: enemyDescriptor, progressionContext: context, occurredAt: 1 });
  const second = bridge.publish({ victimId: 11, enemy: enemyDescriptor, progressionContext: context, occurredAt: 1 });
  assert.notEqual(first.event.eventId, second.event.eventId);
});

test('external loot is empty without Loot System and quest loot is preserved', () => {
  const controller = new ManagedLootController({ lootSystemPresent: false });
  assert.equal(controller.plan({ sourceId: 'container', lootAuthority: 'EXTERNAL', role: 'SECONDARY' }).action, 'KEEP_EMPTY');
  assert.equal(controller.plan({ sourceId: 'quest-container', lootAuthority: 'EXTERNAL', questCritical: true }).action, 'PRESERVE');
});

test('canonical host resolution does not persist a load-order index', () => {
  const calls = [];
  const adapter = new SkyMpIntegrationAdapter({ resolveCanonicalRecord: (identity) => { calls.push(identity); return { status: 'RESOLVED', runtimeFormId: 0x1234 }; } });
  assert.equal(adapter.resolveRecord('Example Mod.esp|00ABCD').status, 'RESOLVED');
  assert.deepEqual(calls, [{ plugin: 'Example Mod.esp', localFormId: 0xABCD }]);
});

test('dungeon generation restores source loot until the future Loot System is bound', () => {
  const loot = new ManagedLootController({ lootSystemPresent: false });
  const adapter = new SkyMpIntegrationAdapter({ loot });
  const generated = adapter.beginDungeonGeneration({ dungeonId: 'Skyrim.esm|000001', generation: 2 });
  assert.equal(generated.lootResult.action, 'RESTORE_SOURCE_COMPOSITION');
  assert.equal(generated.lootResult.restoreWithinSameGeneration, false);
  const reset = adapter.resetDungeon({ dungeonId: 'Skyrim.esm|000001', generation: 3 });
  assert.equal(reset.lootResult.reason, 'DUNGEON_RESET');
});
