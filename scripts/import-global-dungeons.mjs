import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSingleEpoch,
  cellFromHousecarlRow,
  locationFromHousecarlRow,
  readHousecarlArtifact
} from '../src/discovery/housecarl-snapshot.mjs';
import { createDiscoveredDungeon, DungeonRegistry } from '../src/dungeons/registry.mjs';
import {
  classifyManagedDungeon,
  inferFamiliesFromLocationKeywords,
  inferFamilyFromVerifiedLabel,
  progressionContextForTier
} from '../src/dungeons/classification.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotRoot = path.join(root, 'config', 'generated', 'housecarl');
const cellsArtifact = readHousecarlArtifact(path.join(snapshotRoot, 'all-interior-cells-winners.jsonl'));
const locationsArtifact = readHousecarlArtifact(path.join(snapshotRoot, 'all-locations-winners.jsonl'));
const discoveryOverrides = JSON.parse(fs.readFileSync(path.join(root, 'config', 'dungeon-discovery-overrides.json'), 'utf8'));
const verifiedDungeonPlugins = new Set(discoveryOverrides.includeDefiningPlugins ?? []);
const epoch = assertSingleEpoch([cellsArtifact, locationsArtifact]);
const cells = cellsArtifact.rows.map(cellFromHousecarlRow);
const locations = locationsArtifact.rows.map(locationFromHousecarlRow);
const cellsByLocation = new Map();
for (const cell of cells) {
  if (!cell.locationId) continue;
  const group = cellsByLocation.get(cell.locationId) ?? [];
  group.push(cell);
  cellsByLocation.set(cell.locationId, group);
}

const hostileLocationKeywords = new Set([
  'LocTypeDungeon', 'LocTypeDragonPriestLair', 'LocTypeVampireLair', 'LocSetDwarvenRuin',
  'LocTypeDwarvenAutomatons', 'LocTypeBanditCamp', 'LocTypeDraugrCrypt', 'LocTypeWarlockLair',
  'LocTypeFalmerHive', 'LocTypeAnimalDen', 'LocTypeHagravenNest', 'LocTypeGiantCamp',
  'LocTypeDragonLair', 'LocTypeForswornCamp', 'LocTypeWerewolfLair', 'LocTypeWerebearLair',
  'LocTypeSprigganGrove', 'DLC2LocTypeAshSpawn', 'DLC2LocTypeRieklingCamp'
]);

function qualifies(location, groupCells) {
  const keywords = new Set(location.keywords.map((keyword) => keyword.editorid).filter(Boolean));
  if (keywords.has('LocTypeDungeon')) return 'LOC_TYPE_DUNGEON';
  if (groupCells.some((cell) => verifiedDungeonPlugins.has(cell.sourcePlugin))) return 'VERIFIED_DUNGEON_MOD_OVERRIDE';
  if ([...keywords].some((keyword) => hostileLocationKeywords.has(keyword))) return 'HOSTILE_ARCHETYPE_LOCATION';
  if (keywords.has('LocTypeClearable') && groupCells.some((cell) => cell.encounterZoneId)) return 'CLEARABLE_INTERIOR_ENCOUNTER';
  const inferred = inferFamilyFromVerifiedLabel(location.editorId, location.name, ...groupCells.flatMap((cell) => [cell.editorId, cell.name]));
  if (groupCells.some((cell) => cell.encounterZoneId) && inferred !== 'UNRESOLVED') return 'ENCOUNTER_ZONE_ARCHETYPE_HEURISTIC';
  return null;
}

const profiles = [];
for (const location of locations) {
  const groupCells = cellsByLocation.get(location.canonicalFormId) ?? [];
  const discoveryRule = qualifies(location, groupCells);
  if (!discoveryRule) continue;
  const keywordNames = location.keywords.map((keyword) => keyword.editorid).filter(Boolean);
  const families = inferFamiliesFromLocationKeywords(keywordNames);
  const labelFamily = inferFamilyFromVerifiedLabel(location.editorId, location.name, ...groupCells.flatMap((cell) => [cell.editorId, cell.name]));
  if (labelFamily !== 'UNRESOLVED') families.push(labelFamily);
  const classification = classifyManagedDungeon({ families, levels: [] });
  const localFormId = Number.parseInt(location.canonicalFormId.slice(0, 6), 16);
  const profile = createDiscoveredDungeon({
    plugin: location.sourcePlugin,
    localFormId,
    dungeonId: location.identity,
    editorId: location.editorId,
    name: location.name,
    cells: groupCells.map((cell) => cell.identity),
    locations: [location.identity],
    sourceMetadata: { encounterZones: [...new Set(groupCells.map((cell) => cell.encounterZoneId).filter(Boolean))] }
  });
  const provenance = `global-load-order-discovery|houseCARL:${epoch}|${discoveryRule}|${classification.reason}`;
  Object.assign(profile, {
    managed: true,
    managementScope: 'ALL_ACTIVE_LOAD_ORDER_DUNGEONS',
    classification: classification.tier,
    minEnemyLevel: classification.minEnemyLevel,
    targetEnemyLevel: classification.targetEnemyLevel,
    maxEnemyLevel: classification.maxEnemyLevel,
    progressionContext: progressionContextForTier(profile.dungeonId, classification.tier, provenance),
    respawnPolicy: { mode: 'SERVER_GENERATION', rerollOnlyOnNewGeneration: true },
    lootPolicy: {
      authority: 'FUTURE_AETHERIUS_LOOT_SYSTEM',
      initialComposition: 'SOURCE_DEFINED',
      restoreTrigger: 'NEW_DUNGEON_GENERATION_OR_RESET',
      restoreWithinSameGeneration: false
    },
    discoveryStatus: 'MANAGED_GLOBAL',
    contentEvidence: {
      discoveryRule,
      locationKeywords: keywordNames,
      locationOnlyOrExterior: groupCells.length === 0,
      ...classification
    },
    segments: [{
      schemaVersion: 1,
      segmentId: `${profile.dungeonId}|main`,
      cells: groupCells.map((cell) => cell.identity),
      spawnRefs: [],
      allowedEnemyFamilies: [...new Set(families.filter((family) => family !== 'UNRESOLVED'))],
      minEnemyLevel: classification.minEnemyLevel,
      targetEnemyLevel: classification.targetEnemyLevel,
      maxEnemyLevel: classification.maxEnemyLevel,
      allowedSpawnRoles: ['GENERIC', 'BOSS_UNIQUE'],
      bossPolicy: 'BOSS_ANY',
      progressionContext: progressionContextForTier(profile.dungeonId, classification.tier, provenance),
      provenance
    }]
  });
  profiles.push(profile);
}

// Some dungeon mods ship valid interior encounter cells without an LCTN. Keep
// those as cell-scoped profiles when the mod is explicitly verified, or when
// both an encounter zone and a hostile archetype label prove the intent.
const claimedCells = new Set(profiles.flatMap((profile) => profile.cells));
for (const cell of cells.filter((candidate) => !claimedCells.has(candidate.identity))) {
  const family = inferFamilyFromVerifiedLabel(cell.editorId, cell.name, cell.encounterZoneEditorId);
  const verifiedSource = verifiedDungeonPlugins.has(cell.sourcePlugin);
  if (!verifiedSource && !(cell.encounterZoneId && family !== 'UNRESOLVED')) continue;
  const families = family === 'UNRESOLVED' ? [] : [family];
  const classification = classifyManagedDungeon({ families, levels: [] });
  const localFormId = Number.parseInt(cell.canonicalFormId.slice(0, 6), 16);
  const profile = createDiscoveredDungeon({
    plugin: cell.sourcePlugin,
    localFormId,
    dungeonId: cell.identity,
    editorId: cell.editorId,
    name: cell.name,
    cells: [cell.identity],
    locations: [],
    sourceMetadata: { encounterZones: [cell.encounterZoneId].filter(Boolean) }
  });
  const discoveryRule = verifiedSource ? 'VERIFIED_DUNGEON_MOD_LOCATIONLESS_CELL' : 'LOCATIONLESS_ENCOUNTER_ARCHETYPE';
  const provenance = `global-load-order-discovery|houseCARL:${epoch}|${discoveryRule}|${classification.reason}`;
  Object.assign(profile, {
    managed: true,
    managementScope: 'ALL_ACTIVE_LOAD_ORDER_DUNGEONS',
    classification: classification.tier,
    minEnemyLevel: classification.minEnemyLevel,
    targetEnemyLevel: classification.targetEnemyLevel,
    maxEnemyLevel: classification.maxEnemyLevel,
    progressionContext: progressionContextForTier(profile.dungeonId, classification.tier, provenance),
    respawnPolicy: { mode: 'SERVER_GENERATION', rerollOnlyOnNewGeneration: true },
    lootPolicy: { authority: 'FUTURE_AETHERIUS_LOOT_SYSTEM', initialComposition: 'SOURCE_DEFINED', restoreTrigger: 'NEW_DUNGEON_GENERATION_OR_RESET', restoreWithinSameGeneration: false },
    discoveryStatus: 'MANAGED_GLOBAL',
    contentEvidence: { discoveryRule, locationKeywords: [], locationOnlyOrExterior: false, ...classification },
    segments: [{
      schemaVersion: 1,
      segmentId: `${profile.dungeonId}|main`,
      cells: [cell.identity],
      spawnRefs: [],
      allowedEnemyFamilies: families,
      minEnemyLevel: classification.minEnemyLevel,
      targetEnemyLevel: classification.targetEnemyLevel,
      maxEnemyLevel: classification.maxEnemyLevel,
      allowedSpawnRoles: ['GENERIC', 'BOSS_UNIQUE'],
      bossPolicy: 'BOSS_ANY',
      progressionContext: progressionContextForTier(profile.dungeonId, classification.tier, provenance),
      provenance
    }]
  });
  profiles.push(profile);
}

const registry = new DungeonRegistry(profiles.toSorted((a, b) => a.dungeonId.localeCompare(b.dungeonId)));
const validation = registry.validate();
if (validation.length) throw new Error(`invalid global dungeon profiles: ${JSON.stringify(validation.slice(0, 20))}`);
if (registry.profiles.some((profile) => !profile.managed || profile.classification === 'UNASSIGNED')) throw new Error('global dungeon coverage contains unmanaged or unassigned profiles');
const taggedDungeonCount = locations.filter((location) => location.keywords.some((keyword) => keyword.editorid === 'LocTypeDungeon')).length;
const result = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: 'all active-load-order LCTN winners plus interior CELL winners from houseCARL',
  housecarlEpoch: epoch,
  discoveryPolicy: 'LocTypeDungeon plus hostile archetype and clearable interior encounter evidence',
  dungeons: registry.profiles,
  summary: {
    taggedDungeonLocations: taggedDungeonCount,
    managedLocations: registry.profiles.length,
    managedWithInteriorCells: registry.profiles.filter((profile) => profile.cells.length > 0).length,
    managedLocationOnlyOrExterior: registry.profiles.filter((profile) => profile.cells.length === 0).length,
    unassignedClassification: 0,
    tierCounts: Object.fromEntries(['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'].map((tier) => [tier, registry.profiles.filter((profile) => profile.classification === tier).length]))
  }
};
fs.writeFileSync(path.join(root, 'config', 'generated', 'dungeons.generated.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ epoch, ...result.summary }, null, 2));
