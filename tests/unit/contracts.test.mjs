import test from 'node:test';
import assert from 'node:assert/strict';
import { createXpCategoryContract, validateProgressionContext, unassignedProgressionContext, validateEnemyDescriptor, validateEvent } from '../../src/index.mjs';

test('progression ranges are independent and assigned only inside 1..40', () => {
  const context = unassignedProgressionContext('DUNGEON', 'fixture:dungeon');
  assert.deepEqual(validateProgressionContext(context), []);
  assert.equal(context.recommendedClassMin, null);
  assert.equal(context.valid, false);
  assert.ok(validateProgressionContext({ ...context, recommendedClassMin: 41, recommendedClassMax: 41, status: 'ASSIGNED', valid: true }).length);
  assert.ok(validateProgressionContext({ ...context, recommendedClassMin: 20, recommendedClassMax: 10, status: 'ASSIGNED', valid: true }).length);
});

test('enemy descriptor accepts exact configurable categories and rejects malformed/reward data', () => {
  const enemy = { contractVersion: 1, managed: true, stableEnemyIdentity: 'Fixture.esp|000001', enemyFamily: 'BANDIT', spawnRole: 'GENERIC', sourceLevel: null, combatLevel: 41, xpEligible: true, xpCategory: 'bandit', sourcePlugin: 'Fixture.esp', winningOverridePlugin: 'Fixture.esp', sourceRecordIdentity: 'Fixture.esp|000001' };
  assert.deepEqual(validateEnemyDescriptor(enemy), []);
  assert.deepEqual(validateEnemyDescriptor({ ...enemy, xpCategory: 'modded_enemy_category' }), []);
  assert.ok(validateEnemyDescriptor({ ...enemy, xpCategory: 'Modded Enemy Category' }).length);
  const context = { ...unassignedProgressionContext('WORLD_ENCOUNTER', 'fixture:encounter'), recommendedClassMin: 1, recommendedClassMax: 5, status: 'ASSIGNED', valid: true, provenance: 'fixture' };
  const event = { contractVersion: 1, eventId: 'event', occurredAt: 1, victimId: 10, killerId: 0, enemy, progressionContext: context };
  assert.deepEqual(validateEvent(event), []);
  assert.ok(validateEvent({ ...event, finalXp: 10 }).length);
  assert.ok(validateEvent({ ...event, ContentRelevanceModifier: 1 }).length);
  assert.ok(validateEvent({ ...event, partyModifier: 1 }).length);
  assert.ok(validateEvent({ ...event, EnemyLevelFactor: 1 }).length);
});

test('XP category contracts cannot map a family outside the Leveling catalog', () => {
  const contract = createXpCategoryContract({ categories: ['bandit', 'modded_enemy'], familyMappings: { BANDIT: 'bandit', MODDED_ENEMY: 'modded_enemy' } });
  assert.equal(contract.familyMappings.MODDED_ENEMY, 'modded_enemy');
  assert.throws(() => createXpCategoryContract({ categories: ['bandit'], familyMappings: { MODDED_ENEMY: 'missing' } }));
  assert.throws(() => createXpCategoryContract({ contractVersion: 2, categories: ['bandit'] }));
});
