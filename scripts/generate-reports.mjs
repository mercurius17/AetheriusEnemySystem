import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCompatibilityMatrix, EnemyCapabilityScanner } from '../src/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative, fallback) => {
  const file = path.join(root, relative);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
};
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), `${value.trim()}\n`);

const evidence = readJson('config/generated/housecarl-evidence.generated.json', { authorityResolution: {}, housecarl: {}, enemySummary: {}, lvlnSummary: {}, dungeonSummary: {} });
const enemies = readJson('config/generated/enemies.generated.json', { enemies: [], summary: {} });
const dungeons = readJson('config/generated/dungeons.generated.json', { dungeons: [], summary: {} });
const lvln = readJson('config/generated/lvln-reachability.generated.json', { lists: [], summary: {} });
const profiles = readJson('config/generated/housecarl-load-order.generated.json', { profiles: [] });
const authorityRows = ['SKYRIM_REVAMPED', 'THE_RESTLESS_DEAD', 'LAWLESS', 'BETTER_VAMPIRE_NPCS']
  .map((id) => `| ${id} | ${evidence.authorityResolution?.[id] ?? 'UNRESOLVED'} | ${evidence.authorityResolution?.[id] ? 'RESOLVED' : 'BLOCKING'} |`)
  .join('\n');
const profileRows = profiles.profiles.map((profile) => `| ${profile.name} | ${profile.enabledMods} | ${profile.activePlugins} |`).join('\n');

write('docs/MOD_COMPATIBILITY_REPORT.md', `# Mod compatibility report

Evidence source: houseCARL winner snapshots from the live MO2 instance at epoch \`${evidence.housecarl?.epoch ?? 'UNRESOLVED'}\`. No plugin filename is inferred from a Nexus title.

## Authorities

| Authority | Active plugin | Status |
| --- | --- | --- |
${authorityRows}

- Lawless is supplied by \`Bandit War.esp\`; the prior Luna report saying it was absent was incorrect.
- The draugr/skeleton authority is \`The Restless Dead.esp\`, from The Restless Dead (A Draugr and Skeleton Overhaul), Nexus mod 94100.
- Better Vampire NPCs touches non-vampire records, so plugin scope alone is not used as family evidence.
- Winning records and canonical cross-master identities are resolved by houseCARL at the true load-order winner.

## Profiles

| MO2 profile | Enabled mods | Active plugins |
| --- | ---: | ---: |
${profileRows}

Enabled-mod counts may differ. Active-plugin counts must remain equal across both profiles.

## Capability status

| Capability | Status |
| --- | --- |
| NPC/LVLN/CELL winner inspection | PLUGIN-RECORD VALIDATED |
| Canonical plugin + local FormID identity | PLUGIN-RECORD VALIDATED |
| Quest safety | USER RESOLVED: server has no quests |
| Global LCTN/CELL dungeon discovery | PLUGIN-RECORD VALIDATED |
| Optional ACHR/base NPC enrichment | SAME-EPOCH SNAPSHOT REQUIRED |
| SkyMP spawn/death/persistence binding | REQUIRES ADAPTER |
| Granular reloot suppression | REQUIRES REVIEWED HOST CAPABILITY |
| In-game multiplayer behavior | NOT YET VALIDATED |`);

write('docs/ENEMY_DISCOVERY_REPORT.md', `# Enemy discovery report

- houseCARL epoch: \`${evidence.housecarl?.epoch ?? 'UNRESOLVED'}\`
- unique canonical NPCs: ${enemies.summary?.total ?? evidence.enemySummary?.total ?? 0}
- classified from exact semantic evidence: ${enemies.summary?.classified ?? 0}
- classification unresolved: ${enemies.summary?.unresolvedClassification ?? 0}
- combat level unresolved: ${enemies.summary?.unresolvedCombatLevel ?? 0}
- winning override unresolved: ${enemies.summary?.unresolvedWinningOverride ?? 0}
- quest/reference safety unverified: ${enemies.summary?.questSafetyUnverified ?? 0}
- XP eligible: ${enemies.summary?.xpEligible ?? 0}

Family classification uses exact race/faction evidence, verified labels, LVLN reachability, and placed actor bases where a same-epoch snapshot is available. Resolved non-unique, non-scripted authority actors are accepted as generic even outside the captured LVLN roots; they do not enter procedural weighted pools without a source-derived weight.`);

write('docs/LVLN_REACHABILITY_REPORT.md', `# LVLN reachability report

- canonical winner lists: ${lvln.summary?.lists ?? 0}
- entries: ${lvln.summary?.entries ?? 0}
- resolved NPC targets: ${lvln.summary?.resolvedNpcTargets ?? 0}
- unresolved references: ${lvln.summary?.unresolvedReferences ?? 0}
- cycles: ${lvln.summary?.cycles ?? 0}
- excluded unresolved authority NPCs outside captured LVLN roots: ${lvln.summary?.orphanEnemies ?? 0}
- managed standalone generic enemies outside captured LVLN roots: ${lvln.summary?.standaloneGenericEnemies ?? 0}

Status: ${lvln.status ?? 'UNRESOLVED'}. Namespace and winners are resolved; the remaining unresolved references and orphan review are explicit blockers, not guessed links.`);

const tierCounts = Object.fromEntries(['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'].map((tier) => [tier, dungeons.dungeons.filter((dungeon) => dungeon.classification === tier).length]));
const dungeonRows = dungeons.dungeons.map((dungeon) => `| ${dungeon.name ?? dungeon.editorId ?? dungeon.dungeonId} | ${dungeon.classification} | ${dungeon.targetEnemyLevel} | ${dungeon.progressionContext.recommendedClassMin}–${dungeon.progressionContext.recommendedClassMax} | ${dungeon.contentEvidence?.actorCount ?? 0} | ${dungeon.contentEvidence?.reason ?? 'authorized policy'} |`).join('\n');
write('docs/DUNGEON_DISCOVERY_REPORT.md', `# Dungeon discovery report

- standard \`LocTypeDungeon\` locations: ${dungeons.summary?.taggedDungeonLocations ?? 0}
- total globally managed profiles: ${dungeons.summary?.managedLocations ?? dungeons.dungeons.length}
- managed profiles with interior cells: ${dungeons.summary?.managedWithInteriorCells ?? 0}
- location-only or exterior profiles: ${dungeons.summary?.managedLocationOnlyOrExterior ?? 0}
- unassigned classifications: ${dungeons.summary?.unassignedClassification ?? 0}
- authoritative progression profiles: ${dungeons.dungeons.filter((dungeon) => dungeon.progressionContext?.valid).length}
- tier distribution: EASY=${tierCounts.EASY}, MEDIUM=${tierCounts.MEDIUM}, HARD=${tierCounts.HARD}, VERY_HARD=${tierCounts.VERY_HARD}

All discovered vanilla, DLC, Creation Club, and mod-added dungeon profiles are managed. The original 49 Hammet dungeons remain a subset. Discovery uses canonical LCTN/CELL identities and standard keywords, hostile archetype metadata, encounter zones, plus explicit evidence overrides for mods that omit standard keywords. No load-order index is persisted.

| Dungeon | Tier | Enemy target | Class range | Actors | Decisive rule |
| --- | --- | ---: | --- | ---: | --- |
${dungeonRows}`);

const capability = buildCompatibilityMatrix(new EnemyCapabilityScanner().scan(enemies.enemies ?? []));
write('reports/compatibility.generated.json', JSON.stringify(capability, null, 2));
console.log('Generated houseCARL-backed discovery and compatibility reports.');
