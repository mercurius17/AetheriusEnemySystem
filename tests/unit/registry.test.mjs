import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemyScanner, WinningOverrideResolver } from '../../src/index.mjs';

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
