import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const generatedPath = path.join(root, 'config', 'generated', 'dungeons.generated.json');
const hasGeneratedCatalogue = fs.existsSync(generatedPath);
const generated = hasGeneratedCatalogue
  ? JSON.parse(fs.readFileSync(generatedPath, 'utf8'))
  : { dungeons: [], summary: {} };

const generatedCatalogueTest = (name, fn) => test(name, { skip: !hasGeneratedCatalogue }, fn);

const tierContracts = {
  EASY: { min: 1, target: 8, max: 15, classMin: 1, classMax: 10 },
  MEDIUM: { min: 15, target: 22, max: 30, classMin: 10, classMax: 20 },
  HARD: { min: 25, target: 37, max: 50, classMin: 20, classMax: 30 },
  VERY_HARD: { min: 40, target: 70, max: 100, classMin: 30, classMax: 40 }
};

generatedCatalogueTest('the global load-order catalogue manages every discovered dungeon with complete progression contracts', () => {
  assert.ok(generated.summary.taggedDungeonLocations >= 292);
  assert.equal(generated.dungeons.length, generated.summary.managedLocations);
  assert.equal(generated.summary.unassignedClassification, 0);
  for (const dungeon of generated.dungeons) {
    assert.equal(dungeon.managed, true, dungeon.name);
    assert.notEqual(dungeon.discoveryStatus, 'UNASSIGNED', dungeon.name);
    const contract = tierContracts[dungeon.classification];
    assert.ok(contract, `${dungeon.name}: invalid tier`);
    assert.equal(dungeon.minEnemyLevel, contract.min, dungeon.name);
    assert.equal(dungeon.targetEnemyLevel, contract.target, dungeon.name);
    assert.equal(dungeon.maxEnemyLevel, contract.max, dungeon.name);
    assert.equal(dungeon.progressionContext.recommendedClassMin, contract.classMin, dungeon.name);
    assert.equal(dungeon.progressionContext.recommendedClassMax, contract.classMax, dungeon.name);
    assert.equal(dungeon.progressionContext.valid, true, dungeon.name);
  }
});

generatedCatalogueTest('the original 49 Hammet dungeons remain covered inside the global catalogue', () => {
  const hammet = generated.dungeons.filter((dungeon) => dungeon.cells.some((cell) => cell.startsWith('HammetDungeon01.esm|') || cell.startsWith('HammetDungeon02.esm|')));
  assert.equal(hammet.length, 49);
  assert.ok(hammet.every((dungeon) => dungeon.managementScope === 'ALL_ACTIVE_LOAD_ORDER_DUNGEONS'));
});

generatedCatalogueTest('placed Dragon Priests and Dwemer enforce the authorized tiers', () => {
  for (const dungeon of generated.dungeons) {
    const families = new Set([...(dungeon.spawnRefs ?? []).map((actor) => actor.enemyFamily), ...(dungeon.segments?.[0]?.allowedEnemyFamilies ?? [])]);
    if (families.has('DRAGON_PRIEST')) assert.equal(dungeon.classification, 'VERY_HARD', dungeon.name);
    else if ([...families].some((family) => family.startsWith('DWARVEN'))) assert.equal(dungeon.classification, 'HARD', dungeon.name);
  }
});

generatedCatalogueTest('every unique dungeon reference is represented as a unique boss', () => {
  for (const dungeon of generated.dungeons) {
    for (const actor of dungeon.uniqueReferences) assert.equal(actor.spawnRole, 'BOSS_UNIQUE', `${dungeon.name}: ${actor.identity}`);
    assert.deepEqual(dungeon.bossReferences, dungeon.uniqueReferences, dungeon.name);
  }
});

generatedCatalogueTest('loot is restored only for a new dungeon generation or reset', () => {
  for (const dungeon of generated.dungeons) {
    assert.equal(dungeon.lootPolicy.restoreTrigger, 'NEW_DUNGEON_GENERATION_OR_RESET');
    assert.equal(dungeon.lootPolicy.restoreWithinSameGeneration, false);
  }
});
