import {
  DEFAULT_XP_CATEGORY_CONTRACT,
  ENEMY_FAMILIES,
  createXpCategoryContract,
  validateCombatLevel,
  validateEnemyDescriptor
} from '../contracts/types.mjs';

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

export function classifyEnemy(record, { authorityFamilies = [], manualClassification = null, knownFamilies = ENEMY_FAMILIES } = {}) {
  const evidence = [];
  if (manualClassification) return { family: manualClassification.family, status: 'RESOLVED', evidence: ['manual override'], archetype: manualClassification.archetype ?? null, spawnRole: manualClassification.spawnRole ?? 'GENERIC' };
  if (record.dragonPriest === true) evidence.push('record.dragonPriest');
  const tokens = new Set([
    ...(record.keywords ?? []).map((value) => String(value).toUpperCase()),
    ...(record.factions ?? []).map((value) => String(value).toUpperCase()),
    ...(record.semanticTags ?? []).map((value) => String(value).toUpperCase())
  ]);
  for (const family of knownFamilies) if (tokens.has(family)) evidence.push(`tag:${family}`);
  for (const family of authorityFamilies) evidence.push(`authority-scope:${family}`);
  if (evidence.includes('record.dragonPriest')) return { family: 'DRAGON_PRIEST', status: 'RESOLVED', evidence, archetype: record.archetype ?? null, spawnRole: record.spawnRole ?? 'BOSS' };
  // Authority determines which mod wins for a family; it is not evidence that
  // every NPC touched by that plugin belongs to that family.
  const candidates = unique([...tokens].filter((token) => knownFamilies.includes(token)));
  if (candidates.length === 1) return { family: candidates[0], status: 'RESOLVED', evidence, archetype: record.archetype ?? null, spawnRole: record.spawnRole ?? 'GENERIC' };
  return { family: 'UNRESOLVED', status: 'UNRESOLVED', evidence, archetype: null, spawnRole: record.spawnRole ?? 'UNRESOLVED' };
}

export function resolveXpCategory(family, xpCategoryContract = DEFAULT_XP_CATEGORY_CONTRACT) {
  return xpCategoryContract?.familyMappings?.[family] ?? null;
}

export function resolveCombatLevel(record, profile = null) {
  if (record.family === 'DRAGON_PRIEST') return { level: 100, reason: 'fixed dragon priest rule' };
  if (record.levelSemantics === 'FIXED' && validateCombatLevel(record.sourceLevel)) return { level: record.sourceLevel, reason: 'verified fixed source level' };
  if (record.levelSemantics === 'PC_LEVEL_MULT' || record.levelSemantics === 'AUTOCALC') {
    if (profile?.targetEnemyLevel !== null && profile?.targetEnemyLevel !== undefined && validateCombatLevel(profile.targetEnemyLevel)) return { level: profile.targetEnemyLevel, reason: 'authoritative encounter target' };
    return { level: null, reason: 'dynamic source requires authoritative encounter target' };
  }
  if (validateCombatLevel(record.combatLevel)) return { level: record.combatLevel, reason: 'adapter-provided resolved level' };
  if (profile?.targetEnemyLevel !== null && profile?.targetEnemyLevel !== undefined && validateCombatLevel(profile.targetEnemyLevel)) return { level: profile.targetEnemyLevel, reason: 'authoritative encounter target' };
  return { level: null, reason: 'combat level unresolved' };
}

export class EnemyRegistry {
  constructor(enemies = []) {
    this.enemies = [...enemies];
    this.byIdentity = new Map(this.enemies.map((enemy) => [enemy.stableEnemyIdentity, enemy]));
  }

  get(identity) { return this.byIdentity.get(identity) ?? null; }

  eligible({ families = [], minLevel = null, maxLevel = null, roles = [], bossPolicy = 'GENERIC_ONLY' } = {}) {
    return this.enemies.filter((enemy) => {
      if (enemy.classificationStatus !== 'RESOLVED') return false;
      if (families.length && !families.includes(enemy.enemyFamily)) return false;
      if (roles.length && !roles.includes(enemy.spawnRole)) return false;
      if (enemy.quest || enemy.summonOnly || enemy.excluded) return false;
      if (enemy.unique && enemy.spawnRole !== 'BOSS_UNIQUE') return false;
      if (enemy.scripted && enemy.spawnRole !== 'BOSS_UNIQUE') return false;
      if (bossPolicy === 'GENERIC_ONLY' && enemy.spawnRole !== 'GENERIC') return false;
      if (bossPolicy === 'BOSS_GENERIC' && enemy.spawnRole !== 'BOSS_GENERIC') return false;
      if (bossPolicy === 'BOSS_ANY' && !['BOSS_GENERIC', 'BOSS_UNIQUE'].includes(enemy.spawnRole)) return false;
      if (minLevel !== null && enemy.combatLevel !== null && enemy.combatLevel < minLevel) return false;
      if (maxLevel !== null && enemy.combatLevel !== null && enemy.combatLevel > maxLevel) return false;
      if (minLevel !== null && enemy.combatLevel === null) return false;
      return true;
    });
  }
}

export class EnemyScanner {
  constructor({ authorityByPlugin = new Map(), manualOverrides = new Map(), winningOverrideResolver = null, xpCategoryContract = DEFAULT_XP_CATEGORY_CONTRACT } = {}) {
    this.authorityByPlugin = authorityByPlugin instanceof Map ? authorityByPlugin : new Map(Object.entries(authorityByPlugin));
    this.manualOverrides = manualOverrides instanceof Map ? manualOverrides : new Map(Object.entries(manualOverrides));
    this.winningOverrideResolver = winningOverrideResolver;
    this.xpCategoryContract = xpCategoryContract?.contractVersion
      ? createXpCategoryContract(xpCategoryContract)
      : createXpCategoryContract(xpCategoryContract ?? {});
    this.knownFamilies = Object.freeze([...new Set([
      ...ENEMY_FAMILIES,
      ...Object.keys(this.xpCategoryContract.familyMappings)
    ])]);
  }

  scan(records = [], { encounterProfiles = new Map() } = {}) {
    const enemies = [];
    for (const record of records) {
      if (record.type !== 'NPC_') continue;
      const identity = record.identity;
      const authority = this.authorityByPlugin.get(record.plugin) ?? { authorityId: null, families: [] };
      const classification = classifyEnemy(record, {
        authorityFamilies: authority.families ?? [],
        manualClassification: this.manualOverrides.get(identity) ?? null,
        knownFamilies: this.knownFamilies
      });
      const exclusions = {
        quest: Boolean(record.quest || record.questAliasCritical),
        unique: Boolean(record.unique || record.named),
        scripted: Boolean(record.scripted),
        summonOnly: Boolean(record.summonOnly),
        excluded: Boolean(record.explicitlyExcluded)
      };
      const profile = encounterProfiles.get(record.encounterId) ?? null;
      const levelResult = resolveCombatLevel({ ...record, family: classification.family }, profile);
      const xpCategory = resolveXpCategory(classification.family, this.xpCategoryContract);
      const xpEligible = classification.status === 'RESOLVED' && Boolean(xpCategory) && Object.values(exclusions).every((value) => !value) && validateCombatLevel(levelResult.level);
      const winning = this.winningOverrideResolver?.resolve(identity);
      enemies.push({
        stableEnemyIdentity: identity,
        sourcePlugin: record.plugin,
        winningOverridePlugin: winning?.winningOverridePlugin ?? record.winningOverridePlugin ?? null,
        sourceRecordIdentity: identity,
        editorId: record.editorId ?? null,
        name: record.name ?? null,
        race: record.race ?? null,
        factions: record.factions ?? [],
        keywords: record.keywords ?? [],
        sourceLvlnPaths: record.sourceLvlnPaths ?? [],
        templateChain: record.templateChain ?? [],
        levelSemantics: record.levelSemantics ?? 'UNRESOLVED',
        sourceLevel: record.sourceLevel ?? null,
        combatLevel: levelResult.level,
        combatLevelResolution: levelResult.reason,
        enemyFamily: classification.family,
        classificationStatus: classification.status,
        classificationEvidence: classification.evidence,
        archetype: classification.archetype,
        spawnRole: classification.spawnRole,
        xpCategory,
        xpEligible,
        exclusions,
        quest: exclusions.quest,
        unique: exclusions.unique,
        scripted: exclusions.scripted,
        summonOnly: exclusions.summonOnly,
        excluded: exclusions.excluded,
        lootAuthority: record.lootAuthority ?? 'VANILLA',
        capabilityStatus: record.capabilityStatus ?? 'UNVERIFIED',
        sourceWeight: Number.isFinite(record.sourceWeight) && record.sourceWeight > 0 ? record.sourceWeight : null,
        provenance: record.provenance ?? null
      });
    }
    return new EnemyRegistry(enemies);
  }
}

export function toEnemyDescriptor(enemy, { runtimeActorId, dungeonId = null, encounterId = null, segmentId = null, spawnId = null } = {}) {
  const descriptor = {
    contractVersion: 1,
    managed: true,
    stableEnemyIdentity: enemy.stableEnemyIdentity,
    runtimeActorId,
    enemyFamily: enemy.enemyFamily,
    archetype: enemy.archetype,
    spawnRole: enemy.spawnRole,
    sourceLevel: enemy.sourceLevel,
    combatLevel: enemy.combatLevel,
    xpEligible: enemy.xpEligible,
    xpCategory: enemy.xpCategory,
    sourcePlugin: enemy.sourcePlugin,
    winningOverridePlugin: enemy.winningOverridePlugin,
    sourceRecordIdentity: enemy.sourceRecordIdentity,
    dungeonId,
    encounterId,
    segmentId,
    spawnId
  };
  const errors = validateEnemyDescriptor(descriptor);
  return { descriptor, errors };
}
