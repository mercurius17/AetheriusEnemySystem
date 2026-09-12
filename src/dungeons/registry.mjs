import { unassignedProgressionContext, validateDungeonProfile } from '../contracts/types.mjs';
import { stableRecordIdentity } from '../records/identity.mjs';

export function inheritProgressionContext(parent, segmentId) {
  if (!parent) return unassignedProgressionContext('DUNGEON', segmentId, 'missing parent context');
  return { ...parent, sourceId: parent.sourceId, provenance: `${parent.provenance ?? parent.sourceId}|segment:${segmentId}` };
}

export function createDiscoveredDungeon({ plugin, localFormId, dungeonId: suppliedDungeonId = null, editorId = null, name = null, cells = [], locations = [], references = [], containers = [], sourceMetadata = {} }) {
  const dungeonId = suppliedDungeonId ?? stableRecordIdentity(plugin, localFormId);
  return {
    schemaVersion: 1,
    dungeonId,
    stableIdentity: dungeonId,
    provenance: { plugin, localFormId, source: 'generated discovery' },
    editorId,
    name,
    worldspace: sourceMetadata.worldspace ?? null,
    locations,
    cells,
    connections: sourceMetadata.connections ?? [],
    encounterZones: sourceMetadata.encounterZones ?? [],
    spawnRefs: references.filter((ref) => ref.type === 'ACHR' || ref.type === 'REFR'),
    directNpcs: references.filter((ref) => ref.baseType === 'NPC_'),
    associatedLvln: references.filter((ref) => ref.baseType === 'LVLN'),
    containers,
    uniqueReferences: references.filter((ref) => ref.unique === true),
    questReferences: references.filter((ref) => ref.quest || ref.questAlias || ref.scripted),
    bossReferences: references.filter((ref) => ['BOSS_GENERIC', 'BOSS_UNIQUE'].includes(ref.spawnRole)),
    respawnMetadata: sourceMetadata.respawnMetadata ?? null,
    classification: 'UNASSIGNED',
    minEnemyLevel: null,
    targetEnemyLevel: null,
    maxEnemyLevel: null,
    progressionContext: unassignedProgressionContext('DUNGEON', dungeonId, `generated:${plugin}|${localFormId}`),
    segments: [],
    bossProfile: null,
    questSensitive: references.some((ref) => ref.quest || ref.questAlias),
    radiantSensitive: references.some((ref) => ref.radiant),
    respawnPolicy: null,
    lootPolicy: null,
    discoveryStatus: 'CANDIDATE'
  };
}

export class DungeonRegistry {
  constructor(profiles = []) {
    this.profiles = [...profiles];
    this.byId = new Map(this.profiles.map((profile) => [profile.dungeonId, profile]));
  }

  applyManualOverrides(overrides = []) {
    for (const override of overrides) {
      const current = this.byId.get(override.dungeonId);
      if (!current) {
        this.byId.set(override.dungeonId, override);
        continue;
      }
      this.byId.set(override.dungeonId, mergeAuthoritativeOverride(current, override));
    }
    this.profiles = [...this.byId.values()];
    return this;
  }

  validate() {
    return this.profiles.flatMap((profile) => validateDungeonProfile(profile).map((message) => ({ dungeonId: profile.dungeonId, message })));
  }
}

export function mergeAuthoritativeOverride(discovered, override) {
  const merged = {
    ...discovered,
    ...override,
    provenance: override.provenance ?? discovered.provenance,
    cells: override.cells ?? discovered.cells,
    spawnRefs: override.spawnRefs ?? discovered.spawnRefs,
    segments: override.segments ?? discovered.segments
  };
  if (override.progressionContext) merged.progressionContext = override.progressionContext;
  return merged;
}

export class DungeonScanner {
  scan(records = [], { plugins = [], onlyPlugins = null, requireInterior = false } = {}) {
    const allowed = onlyPlugins ? new Set(onlyPlugins.map((plugin) => plugin.toLowerCase())) : null;
    const cells = records.filter((record) => record.type === 'CELL' && (!allowed || allowed.has(record.plugin.toLowerCase())));
    const locations = new Map(records.filter((record) => record.type === 'LCTN').map((record) => [record.identity, record]));
    const references = records.filter((record) => ['ACHR', 'REFR'].includes(record.type));
    const containers = records.filter((record) => record.type === 'CONT');
    const groups = new Map();
    for (const cell of cells) {
      // A dungeon can span several CELL records. A resolved LCTN is the stable
      // grouping key; a cell remains its own fail-closed candidate when no
      // location relationship is available.
      const key = cell.locationIdentity ?? cell.locationId ?? cell.identity;
      const group = groups.get(key) ?? [];
      group.push(cell);
      groups.set(key, group);
    }
    const profiles = [];
    for (const [groupKey, groupCells] of groups) {
      if (requireInterior && !groupCells.some((cell) => cell.isInterior === true)) continue;
      const cellIds = new Set(groupCells.map((cell) => cell.identity));
      const refs = references.filter((ref) => cellIds.has(ref.cellId));
      const firstCell = groupCells[0];
      const cellLocation = firstCell.locationIdentity ? locations.get(firstCell.locationIdentity) : locations.get(firstCell.locationId);
      const locationIdentity = cellLocation?.identity ?? (typeof groupKey === 'string' && groupKey.includes('|') ? groupKey : null);
      profiles.push(createDiscoveredDungeon({
        plugin: firstCell.plugin,
        localFormId: firstCell.localFormId,
        dungeonId: locationIdentity,
        editorId: cellLocation?.editorId ?? firstCell.locationEditorId ?? firstCell.editorId,
        name: cellLocation?.name ?? firstCell.locationName ?? firstCell.name,
        cells: groupCells.map((cell) => cell.identity),
        locations: locationIdentity ? [locationIdentity] : [],
        references: refs,
        containers: containers.filter((container) => cellIds.has(container.cellId)).map((container) => ({ ...container, lootAuthority: 'VANILLA', role: 'UNRESOLVED' })),
        sourceMetadata: {
          worldspace: firstCell.worldspaceId ?? null,
          encounterZones: [...new Set(groupCells.map((cell) => cell.encounterZoneId).filter(Boolean))]
        }
      }));
    }
    return new DungeonRegistry(profiles);
  }
}
