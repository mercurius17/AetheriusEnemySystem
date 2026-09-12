import test from 'node:test';
import assert from 'node:assert/strict';
import { BESTIARY_XP_CATEGORIES, EnemyScanner, WinningOverrideResolver, createXpCategoryContract } from '../../src/index.mjs';

function scan(records, options = {}) {
  return new EnemyScanner({ winningOverrideResolver: new WinningOverrideResolver(records), ...options }).scan(records);
}

test('generic, quest, unique, boss, and Dragon Priest semantics are explicit', () => {
  const records = [
    { identity: 'Lawless.esp|000001', plugin: 'Lawless.esp', type: 'NPC_', localFormId: 1, levelSemantics: 'FIXED', sourceLevel: 41, semanticTags: ['BANDIT'] },
    { identity: 'Lawless.esp|000002', plugin: 'Lawless.esp', type: 'NPC_', localFormId: 2, levelSemantics: 'FIXED', sourceLevel: 20, unique: true, semanticTags: ['BANDIT'] },
    { identity: 'The Restless Dead.esp|000003', plugin: 'The Restless Dead.esp', type: 'NPC_', localFormId: 3, levelSemantics: 'FIXED', sourceLevel: 20, spawnRole: 'BOSS_GENERIC', semanticTags: ['DRAUGR'] },
    { identity: 'The Restless Dead.esp|000004', plugin: 'The Restless Dead.esp', type: 'NPC_', localFormId: 4, levelSemantics: 'FIXED', sourceLevel: 20, dragonPriest: true },
    { identity: 'Unknown.esp|000005', plugin: 'Unknown.esp', type: 'NPC_', localFormId: 5, levelSemantics: 'PC_LEVEL_MULT' }
  ];
  const registry = scan(records, { authorityByPlugin: new Map([['Lawless.esp', { families: ['BANDIT'] }], ['The Restless Dead.esp', { families: ['DRAUGR', 'SKELETON'] }]]) });
  const generic = registry.get('Lawless.esp|000001');
  assert.equal(generic.enemyFamily, 'BANDIT');
  assert.equal(generic.combatLevel, 41);
  assert.equal(generic.xpEligible, true);
  assert.equal(registry.get('Lawless.esp|000002').xpEligible, false);
  assert.equal(registry.get('The Restless Dead.esp|000003').spawnRole, 'BOSS_GENERIC');
  assert.equal(registry.get('The Restless Dead.esp|000004').combatLevel, 100);
  assert.equal(registry.get('Unknown.esp|000005').xpCategory, null);
  assert.equal(registry.get('Unknown.esp|000005').xpEligible, false);
});

test('an authority plugin scope alone never classifies every touched NPC', () => {
  const records = [{ identity: 'Better Vampire NPCs.esp|000001', plugin: 'Better Vampire NPCs.esp', type: 'NPC_', localFormId: 1, levelSemantics: 'FIXED', sourceLevel: 20 }];
  const registry = scan(records, { authorityByPlugin: new Map([['Better Vampire NPCs.esp', { families: ['VAMPIRE'] }]]) });
  assert.equal(registry.get(records[0].identity).enemyFamily, 'UNRESOLVED');
  assert.equal(registry.get(records[0].identity).xpEligible, false);
});

test('approved Leveling families including Ice Wraith and Thalmor are emitted', () => {
  const records = [
    { identity: 'Dragonborn.esm|000001', plugin: 'Dragonborn.esm', type: 'NPC_', levelSemantics: 'FIXED', sourceLevel: 20, semanticTags: ['CULTIST'] },
    { identity: 'Dawnguard.esm|000002', plugin: 'Dawnguard.esm', type: 'NPC_', levelSemantics: 'FIXED', sourceLevel: 20, semanticTags: ['WRATHMAN'] },
    { identity: 'Skyrim.esm|000003', plugin: 'Skyrim.esm', type: 'NPC_', levelSemantics: 'FIXED', sourceLevel: 20, semanticTags: ['THALMOR'] },
    { identity: 'Skyrim.esm|000004', plugin: 'Skyrim.esm', type: 'NPC_', levelSemantics: 'FIXED', sourceLevel: 20, semanticTags: ['ICE_WRAITH'] }
  ];
  const registry = scan(records);
  assert.ok(BESTIARY_XP_CATEGORIES.includes('cultist'));
  assert.ok(BESTIARY_XP_CATEGORIES.includes('wrathman'));
  assert.equal(registry.get(records[0].identity).xpCategory, 'cultist');
  assert.equal(registry.get(records[1].identity).xpCategory, 'wrathman');
  assert.equal(registry.get(records[2].identity).enemyFamily, 'THALMOR');
  assert.equal(registry.get(records[2].identity).xpCategory, 'thalmor');
  assert.equal(registry.get(records[3].identity).xpCategory, 'ice_wraith');
});

test('a mod-added family is discovered through an injected Leveling category contract', () => {
  const records = [{ identity: 'NewCreatures.esp|000001', plugin: 'NewCreatures.esp', type: 'NPC_', levelSemantics: 'FIXED', sourceLevel: 30, semanticTags: ['CLOCKWORK_GOLEM'] }];
  const xpCategoryContract = createXpCategoryContract({ categories: ['clockwork_golem'] });
  const registry = scan(records, { xpCategoryContract });
  const enemy = registry.get(records[0].identity);
  assert.equal(enemy.enemyFamily, 'CLOCKWORK_GOLEM');
  assert.equal(enemy.xpCategory, 'clockwork_golem');
  assert.equal(enemy.xpEligible, true);
});
