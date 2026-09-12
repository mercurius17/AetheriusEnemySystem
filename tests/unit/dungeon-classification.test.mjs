import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyManagedDungeon } from '../../src/index.mjs';

test('Dragon Priest always makes a dungeon VERY_HARD', () => {
  assert.equal(classifyManagedDungeon({ families: ['DRAUGR', 'DRAGON_PRIEST'], levels: [20, 50] }).tier, 'VERY_HARD');
});

test('Dwemer is HARD and predominant vampires are VERY_HARD', () => {
  assert.equal(classifyManagedDungeon({ families: ['DWARVEN_SPHERE'], levels: [20] }).tier, 'HARD');
  assert.equal(classifyManagedDungeon({ families: ['VAMPIRE', 'VAMPIRE', 'SKELETON'], levels: [20, 30, 10] }).tier, 'VERY_HARD');
  assert.equal(classifyManagedDungeon({ families: ['VAMPIRE', 'BANDIT', 'BANDIT'], levels: [20, 10, 10] }).tier, 'HARD');
});

test('bandit, crypt, and animal rules use the authorized progression', () => {
  assert.equal(classifyManagedDungeon({ families: ['BANDIT'], levels: [5, 10] }).tier, 'EASY');
  assert.equal(classifyManagedDungeon({ families: ['BANDIT'], levels: [10, 20] }).tier, 'MEDIUM');
  assert.equal(classifyManagedDungeon({ families: ['DRAUGR'], levels: [20, 40] }).tier, 'HARD');
  assert.equal(classifyManagedDungeon({ families: ['BEAR'], levels: [10] }).tier, 'MEDIUM');
  assert.equal(classifyManagedDungeon({ families: ['WOLF', 'MUDCRAB'], levels: [5] }).tier, 'EASY');
});

test('ambiguous managed content receives the authorized neutral fallback', () => {
  const result = classifyManagedDungeon({ families: ['UNRESOLVED'], levels: [] });
  assert.equal(result.tier, 'MEDIUM');
  assert.equal(result.targetEnemyLevel, 22);
  assert.equal(result.recommendedClassMin, 10);
  assert.equal(result.recommendedClassMax, 20);
});
