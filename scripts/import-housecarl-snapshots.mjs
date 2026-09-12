import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSingleEpoch,
  cellFromHousecarlRow,
  leveledListFromHousecarlRow,
  npcFromHousecarlRow,
  placedNpcFromHousecarlRow,
  readHousecarlArtifact
} from '../src/discovery/housecarl-snapshot.mjs';
import { DungeonScanner } from '../src/dungeons/registry.mjs';
import { classifyManagedDungeon, inferFamilyFromVerifiedLabel, progressionContextForTier } from '../src/dungeons/classification.mjs';
import { resolveXpCategory } from '../src/enemies/registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = path.join(root, 'config', 'generated');
const snapshotRoot = path.join(generated, 'housecarl');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

const npcSpecs = [
  ['srceo-npc-winners.jsonl', 'SKYRIM_REVAMPED', 'Skyrim Revamped - Complete Enemy Overhaul.esp', 'REQUIRED_AUTHORITY'],
  ['lawless-npc-winners.jsonl', 'LAWLESS', 'Bandit War.esp', 'REQUIRED_AUTHORITY'],
  ['better-vampire-npcs-npc-winners.jsonl', 'BETTER_VAMPIRE_NPCS', 'Better Vampire NPCs.esp', 'REQUIRED_AUTHORITY'],
  ['restless-dead-npc-winners.jsonl', 'THE_RESTLESS_DEAD', 'The Restless Dead.esp', 'REQUIRED_AUTHORITY']
];
const listSpecs = [
  ['srceo-lvln-winners.jsonl', 'SKYRIM_REVAMPED'],
  ['lawless-lvln-winners.jsonl', 'LAWLESS'],
  ['better-vampire-npcs-lvln-winners.jsonl', 'BETTER_VAMPIRE_NPCS'],
  ['restless-dead-lvln-winners.jsonl', 'THE_RESTLESS_DEAD'],
  ['hammet-lvln-winners.jsonl', 'HAMMET_CONTENT']
];
const cellFiles = ['hammet1-cells-winners.jsonl', 'hammet2-cells-winners.jsonl', 'hammet-patch-cells-winners.jsonl'];

const npcArtifacts = npcSpecs.map(([file]) => readHousecarlArtifact(path.join(snapshotRoot, file)));
const listArtifacts = listSpecs.map(([file]) => readHousecarlArtifact(path.join(snapshotRoot, file)));
const cellArtifacts = cellFiles.map((file) => readHousecarlArtifact(path.join(snapshotRoot, file)));
const placedArtifact = readHousecarlArtifact(path.join(snapshotRoot, 'hammet-placed-npcs-winners.jsonl'));
const placedBaseClosureArtifact = readHousecarlArtifact(path.join(snapshotRoot, 'hammet-placed-base-closure-winners.jsonl'));
const artifacts = [...npcArtifacts, ...listArtifacts, ...cellArtifacts, placedArtifact, placedBaseClosureArtifact];
const epoch = assertSingleEpoch(artifacts);
const semanticEvidence = readJson('config/semantic-record-evidence.json');
const dungeonPolicy = readJson('config/dungeon-classification-policy.json');

const lists = new Map();
const rootsByAuthority = new Map();
for (let index = 0; index < listArtifacts.length; index += 1) {
  const authorityId = listSpecs[index][1];
  if (!authorityId) throw new Error(`LVLN snapshot ${listSpecs[index][0]} has no authority assignment`);
  const roots = rootsByAuthority.get(authorityId) ?? new Set();
  for (const row of listArtifacts[index].rows) {
    const list = leveledListFromHousecarlRow(row);
    lists.set(list.id, list);
    roots.add(list.id);
  }
  rootsByAuthority.set(authorityId, roots);
}

const pathsByNpc = new Map();
const directWeights = new Map();
const missing = [];
const cycles = new Set();
function addPath(npcId, value) {
  const paths = pathsByNpc.get(npcId) ?? [];
  if (paths.length < 20) paths.push(value);
  pathsByNpc.set(npcId, paths);
}
function walkList(id, authorityId, pathSoFar, stack) {
  if (stack.has(id)) {
    cycles.add([...pathSoFar, id].join(' -> '));
    return;
  }
  const list = lists.get(id);
  if (!list) {
    missing.push({ authorityId, formId: id, path: pathSoFar });
    return;
  }
  const nextStack = new Set(stack).add(id);
  for (const entry of list.entries) {
    if (!entry.formId || entry.resolved !== true) {
      missing.push({ authorityId, formId: entry.formId, path: [...pathSoFar, id] });
      continue;
    }
    if (entry.targetType === 'LeveledNpc') walkList(entry.formId, authorityId, [...pathSoFar, id], nextStack);
    else if (entry.targetType === 'Npc') {
      addPath(entry.formId, { authorityId, path: [...pathSoFar, id, entry.formId], entryLevel: entry.level, count: entry.count });
      directWeights.set(entry.formId, (directWeights.get(entry.formId) ?? 0) + Math.max(1, entry.count ?? 1));
    }
  }
}
for (const [authorityId, roots] of rootsByAuthority) for (const rootId of roots) walkList(rootId, authorityId, [], new Set());

function familyEvidence(npc) {
  const raceFamily = semanticEvidence.raceEditorIds[npc.raceEditorId];
  if (raceFamily) return { family: raceFamily, evidence: [`race:${npc.raceEditorId}`] };
  const factionFamilies = [...new Set(npc.factions.map((faction) => semanticEvidence.factionEditorIds[faction.editorid]).filter(Boolean))];
  if (factionFamilies.length === 1) return { family: factionFamilies[0], evidence: npc.factions.filter((faction) => semanticEvidence.factionEditorIds[faction.editorid]).map((faction) => `faction:${faction.editorid}`) };
  const paths = pathsByNpc.get(npc.canonicalFormId) ?? [];
  if (npc.authorityId === 'LAWLESS' && paths.some((entry) => entry.authorityId === 'LAWLESS')) {
    return { family: 'BANDIT', evidence: ['required-authority:LAWLESS', 'reachable-from:LAWLESS_LVLN'] };
  }
  const inferred = inferFamilyFromVerifiedLabel(npc.editorId, npc.raceEditorId);
  if (inferred !== 'UNRESOLVED') return { family: inferred, evidence: ['user-authorized verified-label classification'] };
  return { family: 'UNRESOLVED', evidence: [] };
}

const npcById = new Map();
for (let index = 0; index < npcArtifacts.length; index += 1) {
  const [, authorityId, authorityPlugin, authorityStatus] = npcSpecs[index];
  for (const row of npcArtifacts[index].rows) {
    const npc = npcFromHousecarlRow(row, { authorityId, authorityPlugin });
    npc.provenance.epoch = epoch;
    const existing = npcById.get(npc.canonicalFormId);
    if (existing) {
      existing.authorityScopes = [...new Set([...existing.authorityScopes, authorityId].filter(Boolean))];
      existing.touchedByPlugins = [...new Set([...existing.touchedByPlugins, npc.touchedByPlugin].filter(Boolean))];
      continue;
    }
    npc.authorityStatus = authorityStatus;
    npc.authorityScopes = authorityId ? [authorityId] : [];
    npc.touchedByPlugins = [npc.touchedByPlugin].filter(Boolean);
    npcById.set(npc.canonicalFormId, npc);
  }
}

for (const row of placedBaseClosureArtifact.rows.filter((candidate) => candidate.type === 'Npc')) {
  const npc = npcFromHousecarlRow(row, { authorityId: null, authorityPlugin: 'HAMMET_CONTENT' });
  npc.provenance.epoch = epoch;
  const existing = npcById.get(npc.canonicalFormId);
  if (existing) {
    existing.touchedByPlugins = [...new Set([...existing.touchedByPlugins, 'HAMMET_CONTENT'])];
    continue;
  }
  npc.authorityStatus = 'MANAGED_DUNGEON_CONTENT';
  npc.authorityScopes = [];
  npc.touchedByPlugins = ['HAMMET_CONTENT'];
  npcById.set(npc.canonicalFormId, npc);
}

const placedActors = placedArtifact.rows.map(placedNpcFromHousecarlRow);
const placedBaseIds = new Set(placedActors.map((actor) => actor.baseId).filter(Boolean));

const enemies = [...npcById.values()].map((npc) => {
  const classification = familyEvidence(npc);
  const sourceLvlnPaths = pathsByNpc.get(npc.canonicalFormId) ?? [];
  const dragonPriest = classification.family === 'DRAGON_PRIEST';
  const directlyPlaced = placedBaseIds.has(npc.canonicalFormId);
  const uniqueDungeonBoss = directlyPlaced && npc.unique;
  const provenGenericArchetype = classification.family !== 'UNRESOLVED' && !npc.unique && !npc.scripted;
  const spawnRole = uniqueDungeonBoss || dragonPriest
    ? 'BOSS_UNIQUE'
    : (sourceLvlnPaths.length > 0 || directlyPlaced || provenGenericArchetype ? 'GENERIC' : 'UNRESOLVED');
  const combatLevel = classification.family === 'DRAGON_PRIEST' ? 100 : (npc.levelSemantics === 'FIXED' && Number.isInteger(npc.sourceLevel) && npc.sourceLevel >= 1 && npc.sourceLevel <= 100 ? npc.sourceLevel : null);
  const xpCategory = resolveXpCategory(classification.family);
  const xpEligible = classification.family !== 'UNRESOLVED'
    && combatLevel !== null
    && xpCategory !== null
    && spawnRole !== 'UNRESOLVED'
    && (!npc.scripted || spawnRole === 'BOSS_UNIQUE');
  return {
    stableEnemyIdentity: npc.identity,
    canonicalFormId: npc.canonicalFormId,
    runtimeFormId: npc.runtimeFormId,
    sourcePlugin: npc.sourcePlugin,
    winningOverridePlugin: npc.winningOverridePlugin,
    touchedByPlugins: npc.touchedByPlugins,
    authorityScopes: npc.authorityScopes,
    authorityStatus: npc.authorityStatus,
    editorId: npc.editorId,
    race: npc.race,
    raceEditorId: npc.raceEditorId,
    factions: npc.factions,
    template: npc.template,
    templateType: npc.templateType,
    levelSemantics: npc.levelSemantics,
    sourceLevel: npc.sourceLevel,
    combatLevel,
    enemyFamily: classification.family,
    classificationStatus: classification.family === 'UNRESOLVED' ? 'UNRESOLVED' : 'RESOLVED',
    classificationEvidence: classification.evidence,
    spawnRole,
    sourceLvlnPaths,
    sourceWeight: directWeights.get(npc.canonicalFormId) ?? null,
    unique: npc.unique,
    scripted: npc.scripted,
    questSafetyStatus: 'SERVER_HAS_NO_QUESTS_USER_ASSERTED',
    xpCategory,
    xpEligible,
    xpEligibilityReason: xpEligible ? 'resolved classification/level plus user assertion that server has no quests' : 'classification, level, category, role, or generic-script safety unresolved',
    capabilities: { perks: npc.perks, spells: npc.spells, combatStyle: npc.combatStyle },
    provenance: npc.provenance
  };
}).toSorted((a, b) => a.stableEnemyIdentity.localeCompare(b.stableEnemyIdentity));

const requiredAuthorityPluginNames = new Set([
  'Skyrim Revamped - Complete Enemy Overhaul.esp',
  'Bandit War.esp',
  'The Restless Dead.esp',
  'Better Vampire NPCs.esp'
]);
const standaloneGenericEnemies = enemies.filter((enemy) =>
  requiredAuthorityPluginNames.has(enemy.sourcePlugin)
  && enemy.spawnRole === 'GENERIC'
  && enemy.sourceLvlnPaths.length === 0
).map((enemy) => enemy.canonicalFormId);
// A resolved generic archetype is a valid managed actor even when it is directly
// placed or belongs to content outside the captured LVLN roots. It is not offered
// to a procedural weighted pool until a source-derived weight/path exists.
const orphanEnemies = enemies.filter((enemy) =>
  requiredAuthorityPluginNames.has(enemy.sourcePlugin)
  && enemy.spawnRole === 'UNRESOLVED'
  && enemy.sourceLvlnPaths.length === 0
).map((enemy) => enemy.canonicalFormId);
const enemyResult = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'houseCARL canonical winner snapshots',
  housecarlEpoch: epoch,
  enemies,
  summary: {
    total: enemies.length,
    classified: enemies.filter((enemy) => enemy.classificationStatus === 'RESOLVED').length,
    unresolvedClassification: enemies.filter((enemy) => enemy.classificationStatus !== 'RESOLVED').length,
    unresolvedCombatLevel: enemies.filter((enemy) => enemy.combatLevel === null).length,
    unresolvedWinningOverride: enemies.filter((enemy) => !enemy.winningOverridePlugin).length,
    questSafetyUnverified: enemies.filter((enemy) => enemy.questSafetyStatus.startsWith('UNVERIFIED')).length,
    xpEligible: enemies.filter((enemy) => enemy.xpEligible).length
  }
};

const lvlnResult = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'houseCARL canonical winner snapshots',
  housecarlEpoch: epoch,
  status: missing.length || cycles.size ? 'INCOMPLETE' : 'RESOLVED_WITHIN_EXPORTED_SCOPE',
  hasCriticalFailure: missing.length > 0 || cycles.size > 0,
  lists: [...lists.values()],
  orphanEnemies,
  standaloneGenericEnemies,
  missing,
  cycles: [...cycles],
  summary: {
    lists: lists.size,
    entries: [...lists.values()].reduce((sum, list) => sum + list.entries.length, 0),
    resolvedNpcTargets: pathsByNpc.size,
    unresolvedReferences: missing.length,
    cycles: cycles.size,
    orphanEnemies: orphanEnemies.length,
    standaloneGenericEnemies: standaloneGenericEnemies.length
  }
};

const cells = cellArtifacts.flatMap((artifact) => artifact.rows.map(cellFromHousecarlRow)).map((cell) => ({
  ...cell,
  plugin: cell.sourcePlugin,
  localFormId: Number.parseInt(cell.identity.split('|').at(-1), 16)
}));
const dungeonRegistry = new DungeonScanner().scan(cells, { onlyPlugins: ['HammetDungeon01.esm', 'HammetDungeon02.esm', "Hammet's Dungeon Pack + North Keep Patch.esp"], requireInterior: true });
const enemyByCanonicalId = new Map(enemies.map((enemy) => [enemy.canonicalFormId, enemy]));
for (const dungeon of dungeonRegistry.profiles) {
  const cellSet = new Set(dungeon.cells);
  const actors = placedActors.filter((actor) => cellSet.has(actor.cellIdentity));
  const actorEvidence = actors.map((actor) => {
    const enemy = enemyByCanonicalId.get(actor.baseId);
    const family = enemy?.enemyFamily && enemy.enemyFamily !== 'UNRESOLVED'
      ? enemy.enemyFamily
      : inferFamilyFromVerifiedLabel(actor.baseEditorId, actor.baseName, actor.cellEditorId, actor.cellName, actor.locationEditorId, actor.locationName);
    const role = enemy?.unique || family === 'DRAGON_PRIEST' ? 'BOSS_UNIQUE' : 'GENERIC';
    return { ...actor, enemyFamily: family, combatLevel: enemy?.combatLevel ?? null, spawnRole: role, unique: enemy?.unique ?? false };
  });
  const fallbackFamily = inferFamilyFromVerifiedLabel(dungeon.editorId, dungeon.name);
  const families = actorEvidence.map((actor) => actor.enemyFamily);
  if (!families.some((family) => family !== 'UNRESOLVED')) families.push(fallbackFamily);
  const classification = classifyManagedDungeon({ families, levels: actorEvidence.map((actor) => actor.combatLevel).filter(Number.isInteger) });
  const provenance = `user-authorized content classification|houseCARL:${epoch}|${classification.reason}`;
  dungeon.managed = true;
  dungeon.classification = classification.tier;
  dungeon.minEnemyLevel = classification.minEnemyLevel;
  dungeon.targetEnemyLevel = classification.targetEnemyLevel;
  dungeon.maxEnemyLevel = classification.maxEnemyLevel;
  dungeon.progressionContext = progressionContextForTier(dungeon.dungeonId, classification.tier, provenance);
  dungeon.spawnRefs = actorEvidence.map((actor) => ({ identity: actor.identity, type: 'ACHR', baseIdentity: actor.baseIdentity, enemyFamily: actor.enemyFamily, combatLevel: actor.combatLevel, spawnRole: actor.spawnRole }));
  dungeon.directNpcs = [...new Set(actorEvidence.map((actor) => actor.baseIdentity).filter(Boolean))];
  dungeon.uniqueReferences = dungeon.spawnRefs.filter((actor) => actor.spawnRole === 'BOSS_UNIQUE');
  dungeon.bossReferences = [...dungeon.uniqueReferences];
  dungeon.questReferences = [];
  dungeon.questSensitive = false;
  dungeon.radiantSensitive = false;
  dungeon.respawnPolicy = { mode: 'SERVER_GENERATION', rerollOnlyOnNewGeneration: true };
  dungeon.discoveryStatus = 'MANAGED_AUTHORIZED';
  dungeon.contentEvidence = { ...classification, actorCount: actorEvidence.length, unresolvedActorFamilies: actorEvidence.filter((actor) => actor.enemyFamily === 'UNRESOLVED').length };
  dungeon.segments = [{
    schemaVersion: 1,
    segmentId: `${dungeon.dungeonId}|main`,
    cells: [...dungeon.cells],
    spawnRefs: dungeon.spawnRefs.map((actor) => actor.identity),
    allowedEnemyFamilies: [...new Set(actorEvidence.map((actor) => actor.enemyFamily).filter((family) => family !== 'UNRESOLVED'))],
    minEnemyLevel: dungeon.minEnemyLevel,
    targetEnemyLevel: dungeon.targetEnemyLevel,
    maxEnemyLevel: dungeon.maxEnemyLevel,
    allowedSpawnRoles: ['GENERIC', 'BOSS_UNIQUE'],
    bossPolicy: dungeon.bossReferences.length ? 'BOSS_ANY' : 'GENERIC_ONLY',
    progressionContext: { ...dungeon.progressionContext },
    provenance
  }];
  dungeon.bossProfile = dungeon.bossReferences.length ? { policy: 'BOSS_ANY', references: dungeon.bossReferences.map((actor) => actor.identity) } : null;
}
if (dungeonPolicy.manageAllDiscoveredHammetDungeons && dungeonRegistry.profiles.length !== dungeonPolicy.expectedManagedDungeonCount) {
  throw new Error(`expected ${dungeonPolicy.expectedManagedDungeonCount} managed Hammet dungeons, discovered ${dungeonRegistry.profiles.length}`);
}
const dungeonValidation = dungeonRegistry.validate();
if (dungeonValidation.length) throw new Error(`invalid managed dungeon profiles: ${JSON.stringify(dungeonValidation.slice(0, 20))}`);
if (dungeonRegistry.profiles.some((profile) => profile.classification === 'UNASSIGNED' || !profile.progressionContext?.valid)) {
  throw new Error('user policy requires every Hammet dungeon to be managed and assigned');
}
const dungeonResult = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'houseCARL CELL winners grouped by resolved LCTN; placement/reference export still pending',
  housecarlEpoch: epoch,
  dungeons: dungeonRegistry.profiles,
  summary: {
    cells: cells.length,
    discovered: dungeonRegistry.profiles.length,
    locationGrouped: dungeonRegistry.profiles.filter((profile) => profile.locations.length).length,
    unassignedClassification: dungeonRegistry.profiles.filter((profile) => profile.classification === 'UNASSIGNED').length,
    authoritativeProfiles: dungeonRegistry.profiles.filter((profile) => profile.progressionContext?.valid).length,
    tierCounts: Object.fromEntries(['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'].map((tier) => [tier, dungeonRegistry.profiles.filter((profile) => profile.classification === tier).length]))
  }
};

const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  housecarl: { epoch, artifacts: artifacts.map(({ manifest, filePath }) => ({ file: path.relative(root, filePath).replaceAll('\\', '/'), rows: manifest.row_count, query: manifest.query })) },
  authorityResolution: {
    SKYRIM_REVAMPED: 'Skyrim Revamped - Complete Enemy Overhaul.esp',
    LAWLESS: 'Bandit War.esp',
    THE_RESTLESS_DEAD: 'The Restless Dead.esp',
    BETTER_VAMPIRE_NPCS: 'Better Vampire NPCs.esp'
  },
  userDecisions: {
    authorityPrecedence: ['SKYRIM_REVAMPED', 'THE_RESTLESS_DEAD', 'LAWLESS', 'BETTER_VAMPIRE_NPCS'],
    manageAllHammetDungeons: true,
    serverHasQuests: false,
    uniqueNpcRole: 'BOSS_UNIQUE',
    spawnWeightAuthority: 'original LVLN entry counts and paths'
  },
  enemySummary: enemyResult.summary,
  lvlnSummary: lvlnResult.summary,
  dungeonSummary: dungeonResult.summary
};

fs.writeFileSync(path.join(generated, 'enemies.generated.json'), `${JSON.stringify(enemyResult, null, 2)}\n`);
fs.writeFileSync(path.join(generated, 'lvln-reachability.generated.json'), `${JSON.stringify(lvlnResult, null, 2)}\n`);
fs.writeFileSync(path.join(generated, 'dungeons.generated.json'), `${JSON.stringify(dungeonResult, null, 2)}\n`);
fs.writeFileSync(path.join(generated, 'housecarl-evidence.generated.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ epoch, enemies: enemyResult.summary, lvln: lvlnResult.summary, dungeons: dungeonResult.summary }, null, 2));
