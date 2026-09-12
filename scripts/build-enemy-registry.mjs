import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnemyScanner } from '../src/enemies/registry.mjs';
import { WinningOverrideResolver } from '../src/records/identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const discovery = JSON.parse(fs.readFileSync(path.join(root, 'config', 'generated', 'plugin-discovery.generated.json'), 'utf8'));
const authorityFamilies = { LAWLESS: ['BANDIT'], THE_RESTLESS_DEAD: ['DRAUGR', 'SKELETON'], BETTER_VAMPIRE_NPCS: ['VAMPIRE'], SKYRIM_REVAMPED: [] };
const authorityByPlugin = new Map();
for (const [authorityId, candidates] of Object.entries(discovery.authorityCandidates ?? {})) for (const filename of candidates) authorityByPlugin.set(filename, { authorityId, families: authorityFamilies[authorityId] ?? [] });
const records = discovery.plugins.flatMap((plugin) => (plugin.records ?? []).map((record) => ({ ...record, loadOrderIndex: plugin.loadOrderIndex })));
const resolver = new WinningOverrideResolver([]);
const scanner = new EnemyScanner({ authorityByPlugin, winningOverrideResolver: resolver });
const registry = scanner.scan(records);
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'read-only plugin record scan; unresolved values are intentional',
  sourcePlugins: discovery.recordScanPlugins,
  sourceRecordsInspected: records.filter((record) => record.type === 'NPC_').length,
  enemies: registry.enemies,
  summary: {
    total: registry.enemies.length,
    classified: registry.enemies.filter((enemy) => enemy.classificationStatus === 'RESOLVED').length,
    unresolvedClassification: registry.enemies.filter((enemy) => enemy.classificationStatus !== 'RESOLVED').length,
    unresolvedCombatLevel: registry.enemies.filter((enemy) => enemy.combatLevel === null).length,
    unresolvedWinningOverride: registry.enemies.filter((enemy) => !enemy.winningOverridePlugin).length,
    xpEligible: registry.enemies.filter((enemy) => enemy.xpEligible).length
  }
};
const output = path.join(root, 'config', 'generated', 'enemies.generated.json');
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${output}`);
console.log(JSON.stringify(result.summary));
