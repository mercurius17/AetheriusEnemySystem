export const CONTRACT_VERSION = 1;
export const XP_CATEGORY_CONTRACT_VERSION = 1;
export const XP_CATEGORY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

// Default categories emitted without an injected Leveling contract. The list is
// intentionally data-only: reward values remain owned by AetheriusLevelingSystem.
export const BESTIARY_XP_CATEGORIES = Object.freeze([
  'bandit', 'riekling', 'silver_hand', 'reaver', 'forsworn', 'warlock',
  'cultist', 'vampire', 'thalmor', 'skeleton', 'draugr', 'ghost', 'corrupted_shade',
  'boneman', 'mistman', 'wrathman', 'ash_spawn',
  'dragon_priest', 'ice_wraith', 'mudcrab', 'skeever', 'slaughterfish', 'wolf', 'horker',
  'frostbite_spider', 'sabre_cat', 'bear', 'death_hound', 'netch', 'mammoth',
  'giant', 'troll', 'hagraven', 'chaurus', 'chaurus_hunter', 'falmer',
  'spriggan', 'wispmother', 'wisp', 'gargoyle', 'ash_guardian', 'lurker', 'seeker',
  'dwarven_spider', 'dwarven_sphere', 'dwarven_ballista', 'dwarven_centurion',
  'flame_atronach', 'frost_atronach', 'storm_atronach', 'dremora', 'dragon'
]);

export const BUILT_IN_ENEMY_FAMILIES = Object.freeze([
  ...new Set([...BESTIARY_XP_CATEGORIES.map((category) => category.toUpperCase()), 'DWEMER'])
]);

export const ENEMY_FAMILIES = Object.freeze([
  ...BUILT_IN_ENEMY_FAMILIES,
  'UNRESOLVED'
]);

export function isExactXpCategory(value) {
  return typeof value === 'string' && value.length <= 96 && XP_CATEGORY_PATTERN.test(value);
}

function isExactEnemyFamily(value) {
  return typeof value === 'string' && /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(value) && value !== 'UNRESOLVED';
}

export function createXpCategoryContract(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('XP category contract must be an object');
  const { categories = [], familyMappings = null, source = null, balanceVersion = null } = input;
  const suppliedVersion = input?.contractVersion;
  if (suppliedVersion !== undefined && suppliedVersion !== XP_CATEGORY_CONTRACT_VERSION) throw new TypeError('unsupported XP category contractVersion');
  if (!Array.isArray(categories)) throw new TypeError('XP category contract categories must be an array');
  const uniqueCategories = [...new Set(categories)];
  if (uniqueCategories.some((category) => !isExactXpCategory(category))) throw new TypeError('XP category contract contains an invalid category');
  const categorySet = new Set(uniqueCategories);
  const mappings = familyMappings ?? Object.fromEntries(uniqueCategories.map((category) => [category.toUpperCase(), category]));
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new TypeError('XP category familyMappings must be an object');
  const normalizedMappings = {};
  for (const [family, category] of Object.entries(mappings)) {
    if (!isExactEnemyFamily(family)) throw new TypeError(`invalid enemy family mapping: ${family}`);
    if (!categorySet.has(category)) throw new TypeError(`enemy family ${family} maps outside the configured XP catalog`);
    normalizedMappings[family] = category;
  }
  return Object.freeze({
    contractVersion: XP_CATEGORY_CONTRACT_VERSION,
    categories: Object.freeze(uniqueCategories),
    familyMappings: Object.freeze(normalizedMappings),
    source,
    balanceVersion
  });
}

export const DEFAULT_XP_CATEGORY_CONTRACT = createXpCategoryContract({
  categories: BESTIARY_XP_CATEGORIES,
  source: 'AetheriusEnemySystem defaults'
});

export const PROGRESSION_SOURCE_TYPES = Object.freeze([
  'DUNGEON', 'WORLD_ENCOUNTER', 'ROAD_ENCOUNTER', 'CAMP', 'PATROL',
  'BOSS_ENCOUNTER', 'SERVER_EVENT', 'OTHER'
]);

export const PROGRESSION_STATUSES = Object.freeze([
  'ASSIGNED', 'UNASSIGNED', 'INVALID', 'NOT_APPLICABLE'
]);

export const DUNGEON_CLASSIFICATIONS = Object.freeze([
  'EASY', 'MEDIUM', 'HARD', 'VERY_HARD', 'UNASSIGNED'
]);

export const LOOT_AUTHORITIES = Object.freeze([
  'VANILLA', 'SUPPRESSED', 'EXTERNAL', 'QUEST'
]);

export const CONTAINER_ROLES = Object.freeze([
  'SECONDARY', 'FINAL', 'BOSS', 'QUEST', 'DECORATIVE', 'UNRESOLVED'
]);

export function unassignedProgressionContext(sourceType, sourceId, provenance = null) {
  return {
    contractVersion: CONTRACT_VERSION,
    sourceType,
    sourceId,
    recommendedClassMin: null,
    recommendedClassMax: null,
    status: 'UNASSIGNED',
    valid: false,
    provenance
  };
}

export function validateProgressionContext(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['context must be an object'];
  if (value.contractVersion !== CONTRACT_VERSION) errors.push('unsupported contractVersion');
  if (!PROGRESSION_SOURCE_TYPES.includes(value.sourceType)) errors.push('invalid sourceType');
  if (typeof value.sourceId !== 'string' || value.sourceId.length === 0) errors.push('sourceId is required');
  if (!PROGRESSION_STATUSES.includes(value.status)) errors.push('invalid status');
  const min = value.recommendedClassMin;
  const max = value.recommendedClassMax;
  const bothNull = min === null && max === null;
  if (!bothNull) {
    if (!Number.isInteger(min) || min < 1 || min > 40) errors.push('recommendedClassMin must be 1..40 or null');
    if (!Number.isInteger(max) || max < 1 || max > 40) errors.push('recommendedClassMax must be 1..40 or null');
    if (Number.isInteger(min) && Number.isInteger(max) && min > max) errors.push('recommendedClassMin must be <= recommendedClassMax');
  }
  if (value.valid && (value.status !== 'ASSIGNED' || bothNull)) errors.push('valid context must be assigned with a range');
  if (!value.valid && value.status === 'ASSIGNED' && !bothNull) errors.push('assigned range must be valid');
  return errors;
}

export function validateCombatLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= 100;
}

export function validateClassLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= 40;
}

export function validateXpCategory(category) {
  return category === null || isExactXpCategory(category);
}

export function validateEnemyDescriptor(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['enemy descriptor must be an object'];
  if (value.contractVersion !== CONTRACT_VERSION) errors.push('unsupported contractVersion');
  if (value.managed !== true) errors.push('managed must be true');
  if (typeof value.stableEnemyIdentity !== 'string' || !value.stableEnemyIdentity) errors.push('stableEnemyIdentity is required');
  if (typeof value.enemyFamily !== 'string' || !value.enemyFamily || value.enemyFamily === 'UNRESOLVED') errors.push('enemyFamily must be resolved');
  if (typeof value.spawnRole !== 'string' || !value.spawnRole || value.spawnRole === 'UNRESOLVED') errors.push('spawnRole must be resolved');
  if (!validateCombatLevel(value.combatLevel)) errors.push('combatLevel must be 1..100');
  if (typeof value.xpEligible !== 'boolean') errors.push('xpEligible must be boolean');
  if (!validateXpCategory(value.xpCategory)) errors.push('xpCategory must be an exact configured snake_case category');
  if (value.xpEligible && (value.xpCategory === null || value.xpCategory === 'UNRESOLVED')) errors.push('eligible enemy must have an exact xpCategory');
  if (typeof value.sourcePlugin !== 'string' || !value.sourcePlugin) errors.push('sourcePlugin is required');
  if (typeof value.winningOverridePlugin !== 'string' || !value.winningOverridePlugin) errors.push('winningOverridePlugin is required');
  if (typeof value.sourceRecordIdentity !== 'string' || !value.sourceRecordIdentity) errors.push('sourceRecordIdentity is required');
  if ('xpReward' in value || 'finalXp' in value || 'enemyLevelFactor' in value) errors.push('enemy descriptor contains leveling-owned calculated reward data');
  return errors;
}

export function validateDungeonProfile(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['dungeon profile must be an object'];
  if (value.schemaVersion !== CONTRACT_VERSION) errors.push('unsupported schemaVersion');
  if (typeof value.dungeonId !== 'string' || !value.dungeonId) errors.push('dungeonId is required');
  if (!DUNGEON_CLASSIFICATIONS.includes(value.classification)) errors.push('invalid classification');
  const levels = [value.minEnemyLevel, value.targetEnemyLevel, value.maxEnemyLevel];
  for (const level of levels) if (level !== null && level !== undefined && !validateCombatLevel(level)) errors.push('enemy levels must be 1..100 or null');
  if (Number.isInteger(value.minEnemyLevel) && Number.isInteger(value.maxEnemyLevel) && value.minEnemyLevel > value.maxEnemyLevel) errors.push('minEnemyLevel must be <= maxEnemyLevel');
  if (Number.isInteger(value.targetEnemyLevel) && Number.isInteger(value.minEnemyLevel) && value.targetEnemyLevel < value.minEnemyLevel) errors.push('targetEnemyLevel must be >= minEnemyLevel');
  if (Number.isInteger(value.targetEnemyLevel) && Number.isInteger(value.maxEnemyLevel) && value.targetEnemyLevel > value.maxEnemyLevel) errors.push('targetEnemyLevel must be <= maxEnemyLevel');
  errors.push(...validateProgressionContext(value.progressionContext));
  return errors;
}

export function validateEvent(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['event must be an object'];
  if (value.contractVersion !== CONTRACT_VERSION) errors.push('unsupported contractVersion');
  if (typeof value.eventId !== 'string' || !value.eventId) errors.push('eventId is required');
  if (!Number.isFinite(value.occurredAt)) errors.push('occurredAt is required');
  if (!Number.isInteger(value.victimId)) errors.push('victimId must be an integer');
  if (!Number.isInteger(value.killerId)) errors.push('killerId must be an integer; use 0 for no attributable killer');
  errors.push(...validateEnemyDescriptor(value.enemy));
  errors.push(...validateProgressionContext(value.progressionContext));
  const forbidden = [
    'xpReward', 'finalXp', 'Delta', 'delta', 'ContentRelevanceModifier',
    'contentRelevanceModifier', 'PartyModifier', 'partyModifier',
    'FatigueModifier', 'fatigueModifier', 'EnemyLevelFactor', 'enemyLevelFactor'
  ];
  if (forbidden.some((field) => field in value)) errors.push('event contains leveling-owned calculated reward data');
  if (value.contributors !== undefined && !Array.isArray(value.contributors)) errors.push('contributors must be an array when present');
  return errors;
}
