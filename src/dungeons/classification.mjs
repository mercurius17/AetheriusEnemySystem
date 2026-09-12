const TIERS = Object.freeze({
  EASY: { minEnemyLevel: 1, targetEnemyLevel: 8, maxEnemyLevel: 15, recommendedClassMin: 1, recommendedClassMax: 10 },
  MEDIUM: { minEnemyLevel: 15, targetEnemyLevel: 22, maxEnemyLevel: 30, recommendedClassMin: 10, recommendedClassMax: 20 },
  HARD: { minEnemyLevel: 25, targetEnemyLevel: 37, maxEnemyLevel: 50, recommendedClassMin: 20, recommendedClassMax: 30 },
  VERY_HARD: { minEnemyLevel: 40, targetEnemyLevel: 70, maxEnemyLevel: 100, recommendedClassMin: 30, recommendedClassMax: 40 }
});

const DWEMER = new Set(['DWEMER', 'DWARVEN_SPIDER', 'DWARVEN_SPHERE', 'DWARVEN_BALLISTA', 'DWARVEN_CENTURION']);
const EASY_ANIMALS = new Set(['WOLF', 'MUDCRAB', 'SKEEVER', 'SLAUGHTERFISH', 'HORKER']);
const MEDIUM_ANIMALS = new Set(['BEAR', 'SABRE_CAT']);

const LOCATION_KEYWORD_FAMILIES = Object.freeze({
  LocTypeDragonPriestLair: 'DRAGON_PRIEST',
  LocTypeVampireLair: 'VAMPIRE',
  LocSetDwarvenRuin: 'DWEMER',
  LocTypeDwarvenAutomatons: 'DWEMER',
  LocTypeBanditCamp: 'BANDIT',
  LocTypeDraugrCrypt: 'DRAUGR',
  LocTypeWarlockLair: 'WARLOCK',
  LocTypeFalmerHive: 'FALMER',
  LocTypeAnimalDen: 'WOLF',
  LocTypeHagravenNest: 'HAGRAVEN',
  LocTypeGiantCamp: 'GIANT',
  LocTypeDragonLair: 'DRAGON',
  LocTypeForswornCamp: 'BANDIT',
  LocTypeWerewolfLair: 'WOLF',
  LocTypeWerebearLair: 'BEAR',
  LocTypeSprigganGrove: 'WARLOCK',
  DLC2LocTypeAshSpawn: 'ASH_SPAWN',
  DLC2LocTypeRieklingCamp: 'RIEKLING'
});

export function inferFamiliesFromLocationKeywords(keywords = []) {
  return [...new Set(keywords.map((keyword) => LOCATION_KEYWORD_FAMILIES[keyword]).filter(Boolean))];
}

export function inferFamilyFromVerifiedLabel(...values) {
  const text = values.filter(Boolean).join(' ').toUpperCase();
  if (/DRAGON[ _-]?PRIEST/.test(text)) return 'DRAGON_PRIEST';
  if (/VAMPIRE/.test(text)) return 'VAMPIRE';
  if (/DEATH[ _-]?HOUND/.test(text)) return 'DEATH_HOUND';
  if (/DWEMER|DWARVEN|CENTURION|BALLISTA|SPHERE|DWARVENSPIDER/.test(text)) return 'DWEMER';
  if (/BANDIT/.test(text)) return 'BANDIT';
  if (/DRAUGR/.test(text)) return 'DRAUGR';
  if (/SKELETON/.test(text)) return 'SKELETON';
  if (/WARLOCK|NECROMANCER|CONJURER/.test(text)) return 'WARLOCK';
  if (/GHOST/.test(text)) return 'GHOST';
  if (/FROSTBITE.*SPIDER|SPIDER.*FROSTBITE/.test(text)) return 'FROSTBITE_SPIDER';
  if (/FLAME.*ATRONACH/.test(text)) return 'FLAME_ATRONACH';
  if (/FROST.*ATRONACH/.test(text)) return 'FROST_ATRONACH';
  if (/STORM.*ATRONACH/.test(text)) return 'STORM_ATRONACH';
  if (/SABRE|SABER/.test(text)) return 'SABRE_CAT';
  if (/BEAR/.test(text)) return 'BEAR';
  if (/WOLF/.test(text)) return 'WOLF';
  if (/MUDCRAB/.test(text)) return 'MUDCRAB';
  if (/SKEEVER/.test(text)) return 'SKEEVER';
  if (/SLAUGHTERFISH/.test(text)) return 'SLAUGHTERFISH';
  if (/HORKER/.test(text)) return 'HORKER';
  if (/TROLL/.test(text)) return 'TROLL';
  if (/FALMER/.test(text)) return 'FALMER';
  if (/CHAURUS/.test(text)) return 'CHAURUS';
  if (/HAGRAVEN/.test(text)) return 'HAGRAVEN';
  if (/GIANT/.test(text)) return 'GIANT';
  if (/DRAGON/.test(text)) return 'DRAGON';
  return 'UNRESOLVED';
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * ratio))];
}

export function classifyManagedDungeon({ families = [], levels = [] } = {}) {
  const resolved = families.filter((family) => family && family !== 'UNRESOLVED');
  const counts = new Map();
  for (const family of resolved) counts.set(family, (counts.get(family) ?? 0) + 1);
  const count = (family) => counts.get(family) ?? 0;
  const share = (family) => resolved.length ? count(family) / resolved.length : 0;
  const p75 = percentile(levels.filter((level) => Number.isInteger(level)), 0.75);
  let tier;
  let reason;
  if (count('DRAGON_PRIEST')) [tier, reason] = ['VERY_HARD', 'Dragon Priest present'];
  else if ([...counts.keys()].some((family) => DWEMER.has(family))) [tier, reason] = ['HARD', 'Dwemer content present'];
  else if (share('VAMPIRE') >= 0.5) [tier, reason] = ['VERY_HARD', 'vampires are predominant'];
  else if (count('VAMPIRE')) [tier, reason] = ['HARD', 'vampire content present'];
  else if (share('BANDIT') >= 0.5) [tier, reason] = [p75 !== null && p75 > 15 ? 'MEDIUM' : 'EASY', 'bandit lair progression'];
  else if (count('DRAUGR') || count('SKELETON')) [tier, reason] = [p75 !== null && p75 > 30 ? 'HARD' : 'MEDIUM', 'draugr/skeleton crypt progression'];
  else if ([...counts.keys()].some((family) => MEDIUM_ANIMALS.has(family))) [tier, reason] = ['MEDIUM', 'bear or sabre cat content'];
  else if (resolved.length && resolved.every((family) => EASY_ANIMALS.has(family))) [tier, reason] = ['EASY', 'low-tier animal den'];
  else if ([...counts.keys()].some((family) => ['TROLL', 'FALMER', 'CHAURUS', 'HAGRAVEN', 'GIANT', 'DRAGON'].includes(family))) [tier, reason] = ['HARD', 'high-threat creature content'];
  else if (p75 !== null && p75 <= 15) [tier, reason] = ['EASY', 'content level percentile'];
  else if (p75 !== null && p75 <= 30) [tier, reason] = ['MEDIUM', 'content level percentile'];
  else if (p75 !== null && p75 <= 50) [tier, reason] = ['HARD', 'content level percentile'];
  else if (p75 !== null) [tier, reason] = ['VERY_HARD', 'content level percentile'];
  else [tier, reason] = ['MEDIUM', 'authorized neutral fallback for ambiguous managed dungeon'];
  return { tier, ...TIERS[tier], reason, familyCounts: Object.fromEntries([...counts].sort()), levelP75: p75 };
}

export function progressionContextForTier(dungeonId, tier, provenance) {
  const rule = TIERS[tier];
  return { contractVersion: 1, sourceType: 'DUNGEON', sourceId: dungeonId, recommendedClassMin: rule.recommendedClassMin, recommendedClassMax: rule.recommendedClassMax, status: 'ASSIGNED', valid: true, provenance };
}

export { TIERS as DUNGEON_TIER_POLICY };
