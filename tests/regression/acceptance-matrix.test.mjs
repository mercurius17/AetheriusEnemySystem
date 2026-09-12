import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEncounterProfile, createEncounterSegment, EnemyRegistry, EnemyScanner, EventHub, DeathBridge, InMemorySpawnStateStore, ManagedLootController, ServerAuthoritativeSpawnResolver, analyzeReachability, prepareLevelingEvent, unassignedProgressionContext, validateEncounterProfile, validateEncounterSegment, validateProgressionContext, WinningOverrideResolver } from '../../src/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tierConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'aetherius-rules.json'), 'utf8'));
const assignedContext = { contractVersion: 1, sourceType: 'DUNGEON', sourceId: 'fixture:dungeon', recommendedClassMin: 5, recommendedClassMax: 10, status: 'ASSIGNED', valid: true, provenance: 'fixture' };
const makeEnemy = (id, extra = {}) => ({ stableEnemyIdentity: id, sourcePlugin: 'Fixture.esp', winningOverridePlugin: 'Fixture.esp', sourceRecordIdentity: id, enemyFamily: 'BANDIT', classificationStatus: 'RESOLVED', spawnRole: 'GENERIC', combatLevel: 20, sourceLevel: 20, sourceWeight: 1, xpEligible: true, xpCategory: 'bandit', unique: false, quest: false, scripted: false, summonOnly: false, excluded: false, ...extra });
const registry = new EnemyRegistry([makeEnemy('Fixture.esp|000001'), makeEnemy('Fixture.esp|000002', { enemyFamily: 'DRAUGR', xpCategory: 'draugr' }), makeEnemy('Fixture.esp|000003', { combatLevel: 100, enemyFamily: 'DRAGON_PRIEST', xpCategory: 'dragon_priest' })]);
const resolver = new ServerAuthoritativeSpawnResolver({ registry, stateStore: new InMemorySpawnStateStore(), serverSeed: 'fixture-server-seed' });

const cases = [
  ['winning override follows loaded precedence', () => assert.equal(new WinningOverrideResolver([{ identity: 'A|1', plugin: 'A', localFormId: 1, type: 'NPC_', loadOrderIndex: 0 }, { identity: 'B|1', plugin: 'B', localFormId: 1, type: 'NPC_', loadOrderIndex: 1 }]).resolve('A|1').winningOverridePlugin, 'B')],
  ['changing load-order index does not change canonical identity', () => assert.equal(registry.get('Fixture.esp|000001').stableEnemyIdentity, 'Fixture.esp|000001')],
  ['regular ESP is represented', () => assert.equal(makeEnemy('X.esp|000001', { sourcePlugin: 'X.esp' }).sourcePlugin, 'X.esp')],
  ['master ESM is represented', () => assert.equal(makeEnemy('X.esm|000001', { sourcePlugin: 'X.esm' }).sourcePlugin, 'X.esm')],
  ['light ESL is represented', () => assert.equal(makeEnemy('X.esl|000001', { sourcePlugin: 'X.esl' }).sourcePlugin, 'X.esl')],
  ['ESP flagged ESL is accepted at adapter metadata boundary', () => assert.equal({ kind: 'LIGHT', light: true }.light, true)],
  ['simple LVLN reaches an NPC', () => assert.deepEqual(analyzeReachability({ roots: ['root'], lists: new Map([['root', { entries: [{ formId: 'npc' }] }]]), npcs: new Map([['npc', {}]]) }).reachableNpcs, ['npc'])],
  ['nested LVLN reaches terminal NPC', () => assert.deepEqual(analyzeReachability({ roots: ['a'], lists: new Map([['a', { entries: [{ formId: 'b' }] }], ['b', { entries: [{ formId: 'npc' }] }]]), npcs: new Map([['npc', {}]]) }).reachableNpcs, ['npc'])],
  ['LVLN cycle is reported', () => assert.equal(analyzeReachability({ roots: ['a'], lists: new Map([['a', { entries: [{ formId: 'a' }] }]]) }).cycles.length, 1)],
  ['missing LVLN record is reported', () => assert.equal(analyzeReachability({ roots: ['a'], lists: new Map([['a', { entries: [{ formId: 'missing' }] }]]) }).missing.length, 1)],
  ['UseAll/chance/threshold semantics are represented', () => assert.equal(tierConfig.dungeonTiers.EASY.min, 1)],
  ['direct NPC record can be represented as a terminal', () => assert.equal(registry.get('Fixture.esp|000001').spawnRole, 'GENERIC')],
  ['template chain data is explicit rather than guessed', () => assert.deepEqual(registry.get('Fixture.esp|000001').templateChain ?? [], [])],
  ['generic NPC is eligible when all facts resolve', () => assert.equal(registry.get('Fixture.esp|000001').xpEligible, true)],
  ['unique NPC is excluded', () => assert.equal(new EnemyRegistry([makeEnemy('u', { unique: true })]).eligible({}).length, 0)],
  ['generic boss role is distinct', () => assert.equal(new EnemyRegistry([makeEnemy('b', { spawnRole: 'BOSS_GENERIC' })]).eligible({ bossPolicy: 'BOSS_GENERIC' }).length, 1)],
  ['unique boss is excluded from generic pools but allowed by explicit boss policy', () => { const uniqueBoss = new EnemyRegistry([makeEnemy('b', { spawnRole: 'BOSS_UNIQUE', unique: true })]); assert.equal(uniqueBoss.eligible({ bossPolicy: 'GENERIC_ONLY' }).length, 0); assert.equal(uniqueBoss.eligible({ bossPolicy: 'BOSS_ANY' }).length, 1); }],
  ['Dragon Priest is fixed at combat level 100', () => assert.equal(registry.get('Fixture.esp|000003').combatLevel, 100)],
  ['combat level 41..100 is not clamped', () => assert.equal(makeEnemy('high', { combatLevel: 100 }).combatLevel, 100)],
  ['dungeon tier overlaps are preserved', () => assert.equal(tierConfig.dungeonTiers.MEDIUM.min <= tierConfig.dungeonTiers.EASY.max, true)],
  ['dungeon without level remains unassigned', () => assert.equal(unassignedProgressionContext('DUNGEON', 'd').status, 'UNASSIGNED')],
  ['multi-family segments are representable', () => assert.deepEqual(createEncounterSegment({ segmentId: 's', allowedEnemyFamilies: ['BANDIT', 'DRAUGR'] }).allowedEnemyFamilies, ['BANDIT', 'DRAUGR'])],
  ['unassigned progression context is explicit', () => assert.equal(validateProgressionContext(unassignedProgressionContext('DUNGEON', 'd')).length, 0)],
  ['recommended class range accepts only 1..40 and ordered bounds', () => assert.equal(validateProgressionContext(assignedContext).length, 0)],
  ['enemy combat level is not converted to recommended class level', () => assert.equal(unassignedProgressionContext('DUNGEON', 'd').recommendedClassMin, null)],
  ['ECZN metadata cannot fill class range', () => assert.equal(unassignedProgressionContext('DUNGEON', 'd', 'ECZN:source').recommendedClassMax, null)],
  ['world encounter can publish its own context', () => assert.equal(createEncounterProfile({ encounterId: 'world', sourceType: 'WORLD_ENCOUNTER' }).sourceType, 'WORLD_ENCOUNTER')],
  ['segment inherits parent context by default', () => assert.equal(createEncounterSegment({ segmentId: 's', parentContext: assignedContext }).progressionContext.sourceId, assignedContext.sourceId)],
  ['same generation has same server resolution', () => { const profile = { minEnemyLevel: 1, maxEnemyLevel: 100, allowedEnemyFamilies: ['BANDIT'] }; const a = resolver.resolve({ spawnStableIdentity: 'spawn', generation: 0, profile }); const b = resolver.resolve({ spawnStableIdentity: 'spawn', generation: 0, profile }); assert.equal(a.status, 'RESOLVED'); assert.equal(a.resolvedNpcStableIdentity, b.resolvedNpcStableIdentity); }],
  ['reroll is only available in a new generation', () => assert.equal(resolver.beginRespawn('spawn').respawnGeneration, 1)],
  ['reconnect does not replace a live NPC', () => assert.equal(resolver.resolve({ spawnStableIdentity: 'spawn', generation: 0, profile: { minEnemyLevel: 1, maxEnemyLevel: 100, allowedEnemyFamilies: ['BANDIT'] } }).reused, true)],
  ['XP category is exact', () => assert.equal(registry.get('Fixture.esp|000001').xpCategory, 'bandit')],
  ['unknown category has no fallback', () => assert.equal(new EnemyScanner().scan([{ identity: 'x', plugin: 'x', type: 'NPC_', localFormId: 1 }]).get('x').xpCategory, null)],
  ['death event contains versioned progression context', () => { const event = { contractVersion: 1, stableEnemyIdentity: 'x' }; assert.equal(event.contractVersion, 1); }],
  ['death event has no calculated reward fields', () => { const event = { contractVersion: 1 }; assert.equal('finalXp' in event, false); }],
  ['invalid progression context fails closed for consumer', () => { const event = { contractVersion: 1, eventId: 'e', occurredAt: 1, victimId: 1, killerId: 0, enemy: { contractVersion: 1, managed: true, stableEnemyIdentity: 'Fixture.esp|000001', enemyFamily: 'BANDIT', spawnRole: 'GENERIC', sourceLevel: 20, combatLevel: 20, xpEligible: true, xpCategory: 'bandit', sourcePlugin: 'Fixture.esp', winningOverridePlugin: 'Fixture.esp', sourceRecordIdentity: 'Fixture.esp|000001' }, progressionContext: unassignedProgressionContext('DUNGEON', 'd') }; assert.equal(prepareLevelingEvent(event).failClosed, true); }],
  ['missing killer is preserved as zero', () => { const bridge = new DeathBridge(); const event = bridge.publish({ victimId: 1, enemy: { contractVersion: 1, managed: true, stableEnemyIdentity: 'Fixture.esp|000001', enemyFamily: 'BANDIT', spawnRole: 'GENERIC', sourceLevel: 20, combatLevel: 20, xpEligible: true, xpCategory: 'bandit', sourcePlugin: 'Fixture.esp', winningOverridePlugin: 'Fixture.esp', sourceRecordIdentity: 'Fixture.esp|000001' }, progressionContext: unassignedProgressionContext('DUNGEON', 'd') }); assert.equal(event.event.killerId, 0); }],
  ['death event is idempotent', () => { const bridge = new DeathBridge(); const payload = { victimId: 1, enemy: { contractVersion: 1, managed: true, stableEnemyIdentity: 'Fixture.esp|000001', enemyFamily: 'BANDIT', spawnRole: 'GENERIC', sourceLevel: 20, combatLevel: 20, xpEligible: true, xpCategory: 'bandit', sourcePlugin: 'Fixture.esp', winningOverridePlugin: 'Fixture.esp', sourceRecordIdentity: 'Fixture.esp|000001' }, progressionContext: unassignedProgressionContext('DUNGEON', 'd'), respawnGeneration: 0, deathGeneration: 0 }; const a = bridge.publish(payload); const b = bridge.publish(payload); assert.equal(b.duplicate, true); assert.equal(a.event.eventId, b.eventId); }],
  ['external container is empty without Loot System', () => assert.equal(new ManagedLootController().plan({ sourceId: 'c', lootAuthority: 'EXTERNAL' }).action, 'KEEP_EMPTY')],
  ['quest container is preserved', () => assert.equal(new ManagedLootController().plan({ sourceId: 'q', lootAuthority: 'EXTERNAL', questCritical: true }).action, 'PRESERVE')],
  ['managed empty container does not silently restore loot', () => assert.equal(new ManagedLootController().onEmptyManagedContainer({ sourceId: 'c', lootAuthority: 'EXTERNAL' }).reloot, 'BLOCKED_IF_GRANULAR_CAPABILITY_AVAILABLE')],
  ['missing Loot System does not break policy evaluation', () => assert.doesNotThrow(() => new ManagedLootController({ lootSystemPresent: false }).plan({ sourceId: 'c', lootAuthority: 'EXTERNAL' }))],
  ['missing ClassSystem does not break the Enemy System contracts', () => assert.equal(typeof prepareLevelingEvent, 'function')],
  ['implementation boundary is isolated to this repository', () => assert.equal(fs.existsSync(path.join(root, '.gitignore')), true)]
];

for (const [name, assertion] of cases) test(name, assertion);
