import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanLoadOrder } from '../src/discovery/plugin-scanner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function arg(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

const settingsPath = arg('--settings');
if (!settingsPath) {
  console.error('Usage: node scripts/scan-plugins.mjs --settings <server-settings.json> --records <comma-separated filenames>');
  process.exit(2);
}
const recordPlugins = (arg('--records', '') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const mappingsPath = path.join(root, 'config', 'manual', 'plugin-mappings.override.json');
const manualMappings = fs.existsSync(mappingsPath) ? JSON.parse(fs.readFileSync(mappingsPath, 'utf8')).mappings ?? [] : [];
const result = scanLoadOrder(path.resolve(settingsPath), { recordPlugins, manualMappings });
const output = path.join(root, 'config', 'generated', 'plugin-discovery.generated.json');
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${output}`);
console.log(`Plugins in declared load order: ${result.plugins.length}`);
console.log(`Existing plugin files: ${result.plugins.filter((plugin) => plugin.exists).length}`);
for (const [authorityId, candidates] of Object.entries(result.authorityCandidates)) console.log(`${authorityId}: ${candidates.length ? candidates.join(', ') : 'UNRESOLVED'}`);
