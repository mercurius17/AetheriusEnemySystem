import { CONTRACT_VERSION, CONTAINER_ROLES, LOOT_AUTHORITIES, PROGRESSION_SOURCE_TYPES, validateCombatLevel, validateProgressionContext } from './types.mjs';

export function createEncounterProfile({ encounterId, sourceType = 'OTHER', provenance = null, minEnemyLevel = null, targetEnemyLevel = null, maxEnemyLevel = null, progressionContext = null } = {}) {
  const context = progressionContext ?? { contractVersion: 1, sourceType, sourceId: encounterId, recommendedClassMin: null, recommendedClassMax: null, status: 'UNASSIGNED', valid: false, provenance };
  return { schemaVersion: CONTRACT_VERSION, encounterId, sourceType, stableIdentity: encounterId, provenance, minEnemyLevel, targetEnemyLevel, maxEnemyLevel, progressionContext: context, segments: [] };
}

export function createEncounterSegment({ segmentId, cells = [], spawnRefs = [], allowedEnemyFamilies = [], minEnemyLevel = null, targetEnemyLevel = null, maxEnemyLevel = null, allowedSpawnRoles = [], bossPolicy = 'GENERIC_ONLY', parentContext = null, notes = null } = {}) {
  return { schemaVersion: CONTRACT_VERSION, segmentId, cells, spawnRefs, allowedEnemyFamilies, minEnemyLevel, targetEnemyLevel, maxEnemyLevel, allowedSpawnRoles, bossPolicy, progressionContext: parentContext ? { ...parentContext, provenance: `${parentContext.provenance ?? parentContext.sourceId}|segment:${segmentId}` } : null, notes, provenance: notes };
}

export function createContainerDescriptor({ sourceId, role = 'UNRESOLVED', lootAuthority = 'VANILLA', sourceType = 'CONTAINER', questCritical = false, provenance = null } = {}) {
  return { schemaVersion: CONTRACT_VERSION, sourceId, sourceType, containerRole: role, lootAuthority, questCritical, provenance };
}

export function validateEncounterProfile(value) {
  const errors = [];
  if (!value || value.schemaVersion !== CONTRACT_VERSION) errors.push('unsupported EncounterProfileV1');
  if (typeof value?.encounterId !== 'string' || !value.encounterId) errors.push('encounterId is required');
  if (!PROGRESSION_SOURCE_TYPES.includes(value?.sourceType)) errors.push('invalid sourceType');
  for (const level of [value?.minEnemyLevel, value?.targetEnemyLevel, value?.maxEnemyLevel]) if (level !== null && level !== undefined && !validateCombatLevel(level)) errors.push('enemy levels must be 1..100 or null');
  errors.push(...validateProgressionContext(value?.progressionContext));
  return errors;
}

export function validateEncounterSegment(value) {
  const errors = [];
  if (!value || value.schemaVersion !== CONTRACT_VERSION) errors.push('unsupported EncounterSegmentV1');
  if (typeof value?.segmentId !== 'string' || !value.segmentId) errors.push('segmentId is required');
  for (const level of [value?.minEnemyLevel, value?.targetEnemyLevel, value?.maxEnemyLevel]) if (level !== null && level !== undefined && !validateCombatLevel(level)) errors.push('enemy levels must be 1..100 or null');
  if (value?.progressionContext) errors.push(...validateProgressionContext(value.progressionContext));
  return errors;
}

export function validateContainerDescriptor(value) {
  const errors = [];
  if (!value || value.schemaVersion !== CONTRACT_VERSION) errors.push('unsupported ContainerDescriptorV1');
  if (typeof value?.sourceId !== 'string' || !value.sourceId) errors.push('sourceId is required');
  if (!CONTAINER_ROLES.includes(value?.containerRole)) errors.push('invalid containerRole');
  if (!LOOT_AUTHORITIES.includes(value?.lootAuthority)) errors.push('invalid lootAuthority');
  return errors;
}
