import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeReachability } from '../src/leveled-lists/analyzer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const discovery = JSON.parse(fs.readFileSync(path.join(root, 'config', 'generated', 'plugin-discovery.generated.json'), 'utf8'));
const lists = discovery.plugins.flatMap((plugin) => (plugin.records ?? []).filter((record) => ['LVLN', 'LVLI'].includes(record.type)).map((record) => ({ ...record, plugin: plugin.filename })));
const reportEntries = lists.map((list) => {
  const entries = (list.entries ?? []).map((entry) => ({ ...entry, resolution: 'UNRESOLVED_SOURCE_NAMESPACE' }));
  const report = analyzeReachability({ roots: [list.identity], lists: new Map([[list.identity, { id: list.identity, entries: [] }]]), npcs: new Map() });
  return { listId: list.identity, plugin: list.plugin, type: list.type, editorId: list.editorId, entries, analysis: report, status: 'PARTIAL_RECORD_SCAN' };
});
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'read-only binary plugin scan',
  status: lists.length ? 'PARTIAL_RECORD_SCAN' : 'NO_RELEVANT_RECORDS_SCANNED',
  note: 'References inside real plugins require the host ESPM namespace/master resolver before a winning LVLN path can be asserted. No path is promoted silently.',
  lists: reportEntries,
  summary: { lists: lists.length, entries: lists.reduce((sum, list) => sum + (list.entries?.length ?? 0), 0), unresolvedReferences: lists.reduce((sum, list) => sum + (list.entries?.length ?? 0), 0), cycles: 0, orphanEnemies: 0 }
};
const outputPath = path.join(root, 'config', 'generated', 'lvln-reachability.generated.json');
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
console.log(JSON.stringify(output.summary));
