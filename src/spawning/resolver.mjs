import { validateCombatLevel, validateEnemyDescriptor, validateProgressionContext } from '../contracts/types.mjs';
import { deterministicWeightedPick } from '../leveled-lists/analyzer.mjs';
import { toEnemyDescriptor } from '../enemies/registry.mjs';
import { sha256 } from '../records/identity.mjs';

export class InMemorySpawnStateStore {
  constructor(seed = 'UNASSIGNED_SERVER_SEED') {
    this.seed = seed;
    this.states = new Map();
  }

  get(spawnStableIdentity) { return this.states.get(spawnStableIdentity) ?? null; }

  save(spawnStableIdentity, state) { this.states.set(spawnStableIdentity, structuredClone(state)); }
}

function levelAllowed(enemy, profile) {
  if (!validateCombatLevel(enemy.combatLevel)) return false;
  if (Number.isInteger(profile?.minEnemyLevel) && enemy.combatLevel < profile.minEnemyLevel) return false;
  if (Number.isInteger(profile?.maxEnemyLevel) && enemy.combatLevel > profile.maxEnemyLevel) return false;
  return true;
}

export class ServerAuthoritativeSpawnResolver {
  constructor({ registry, stateStore = new InMemorySpawnStateStore(), serverSeed, resolverVersion = 'v1' } = {}) {
    if (!registry) throw new Error('registry is required');
    if (!serverSeed) throw new Error('serverSeed is required; do not use an implicit random seed');
    this.registry = registry;
    this.stateStore = stateStore;
    this.serverSeed = serverSeed;
    this.resolverVersion = resolverVersion;
  }

  resolve({ spawnStableIdentity, generation, dungeonId = null, encounterId = null, segmentId = null, profile = null, families = [], roles = [], bossPolicy = 'GENERIC_ONLY' }) {
    if (!spawnStableIdentity || !Number.isInteger(generation) || generation < 0) return this.fail('INVALID_SPAWN_IDENTITY_OR_GENERATION');
    const existing = this.stateStore.get(spawnStableIdentity);
    if (existing && existing.respawnGeneration === generation) return { ...existing.resolution, reused: true };
    const effectiveFamilies = families.length ? families : (profile?.allowedEnemyFamilies ?? []);
    const effectiveRoles = roles.length ? roles : (profile?.allowedSpawnRoles ?? []);
    if (!effectiveFamilies.length) return this.fail('SPAWN_FAMILY_SCOPE_UNASSIGNED', { spawnStableIdentity, generation });
    const candidates = this.registry.eligible({
      families: effectiveFamilies,
      minLevel: profile?.minEnemyLevel ?? null,
      maxLevel: profile?.maxEnemyLevel ?? null,
      roles: effectiveRoles,
      bossPolicy
    }).filter((enemy) => levelAllowed(enemy, profile));
    if (!candidates.length) return this.fail('NO_ELIGIBLE_SERVER_POOL', { spawnStableIdentity, generation });
    const ordered = candidates.toSorted((a, b) => a.stableEnemyIdentity.localeCompare(b.stableEnemyIdentity));
    const missingWeight = ordered.filter((enemy) => !Number.isFinite(enemy.sourceWeight) || enemy.sourceWeight <= 0);
    if (missingWeight.length) return this.fail('POOL_WEIGHTING_UNASSIGNED', {
      spawnStableIdentity,
      generation,
      unresolvedCandidates: missingWeight.map((enemy) => enemy.stableEnemyIdentity)
    });
    const candidate = deterministicWeightedPick(ordered, `${this.serverSeed}|${spawnStableIdentity}|${generation}|${this.resolverVersion}`);
    if (!candidate || !validateCombatLevel(candidate.combatLevel) || !candidate.winningOverridePlugin) return this.fail('CANDIDATE_IDENTITY_OR_LEVEL_UNRESOLVED', { spawnStableIdentity, generation });
    const descriptorResult = toEnemyDescriptor(candidate, { dungeonId, encounterId, segmentId, spawnId: spawnStableIdentity });
    if (descriptorResult.errors.length) return this.fail('DESCRIPTOR_INVALID', { errors: descriptorResult.errors });
    const resolution = {
      schemaVersion: 1,
      status: 'RESOLVED',
      spawnStableIdentity,
      resolvedNpcStableIdentity: candidate.stableEnemyIdentity,
      runtimeActorId: null,
      dungeonId,
      encounterId,
      segmentId,
      enemyFamily: candidate.enemyFamily,
      combatLevel: candidate.combatLevel,
      spawnRole: candidate.spawnRole,
      respawnGeneration: generation,
      resolverVersion: this.resolverVersion,
      seedFingerprint: sha256(`${this.serverSeed}|${spawnStableIdentity}|${generation}|${this.resolverVersion}`),
      progressionContext: profile?.progressionContext ? structuredClone(profile.progressionContext) : null,
      descriptor: descriptorResult.descriptor,
      reused: false
    };
    this.stateStore.save(spawnStableIdentity, {
      respawnGeneration: generation,
      resolvedNpcStableIdentity: candidate.stableEnemyIdentity,
      resolution
    });
    return resolution;
  }

  beginRespawn(spawnStableIdentity) {
    const existing = this.stateStore.get(spawnStableIdentity);
    const next = existing ? existing.respawnGeneration + 1 : 0;
    return { spawnStableIdentity, respawnGeneration: next };
  }

  fail(reason, details = {}) {
    return { schemaVersion: 1, status: 'FAILED', reason, ...details };
  }
}

export function validateResolvedSpawn(resolution) {
  const errors = [];
  if (!resolution || resolution.schemaVersion !== 1) errors.push('unsupported SpawnResolutionV1');
  if (resolution?.status === 'RESOLVED') {
    if (!resolution.resolvedNpcStableIdentity) errors.push('resolvedNpcStableIdentity is required');
    if (!validateCombatLevel(resolution.combatLevel)) errors.push('combatLevel must be 1..100');
    errors.push(...validateEnemyDescriptor(resolution.descriptor));
    if (resolution.progressionContext) errors.push(...validateProgressionContext(resolution.progressionContext));
  }
  return errors;
}
