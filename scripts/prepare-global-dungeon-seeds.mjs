import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSingleEpoch, field, readHousecarlArtifact } from '../src/discovery/housecarl-snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotRoot = path.join(root, 'config', 'generated', 'housecarl');
const cellArtifact = readHousecarlArtifact(path.join(snapshotRoot, 'all-interior-cells-winners.jsonl'));
const locationArtifact = readHousecarlArtifact(path.join(snapshotRoot, 'all-locations-winners.jsonl'));
const epoch = assertSingleEpoch([cellArtifact, locationArtifact]);
const dungeonLocationIds = new Set(locationArtifact.rows
  .filter((row) => (row.fields ?? []).some((candidate) => /^Keywords\[\d+\]$/.test(candidate.path) && candidate.link?.editorid === 'LocTypeDungeon'))
  .map((row) => row.formid));
const rows = cellArtifact.rows.filter((row) => dungeonLocationIds.has(field(row, 'Location')?.value));
const ownerPlugins = [...new Set(rows.map((row) => row.formid.split(':').slice(1).join(':')))].sort();
const manifest = {
  ...cellArtifact.manifest,
  query: { derivedFrom: ['all-interior-cells-winners.jsonl', 'all-locations-winners.jsonl'], rule: 'interior CELL whose resolved LCTN has LocTypeDungeon' },
  row_count: rows.length,
  total: rows.length,
  epoch,
  created: new Date().toISOString(),
  notes: ['Derived locally from complete same-epoch houseCARL artifacts; identity remains canonical CELL FormID.']
};
fs.writeFileSync(path.join(snapshotRoot, 'all-dungeon-cells-winners.jsonl'), `${[manifest, ...rows].map((row) => JSON.stringify(row)).join('\n')}\n`);
fs.writeFileSync(path.join(root, 'config', 'generated', 'dungeon-owner-plugins.generated.json'), `${JSON.stringify({ schemaVersion: 1, epoch, ownerPlugins }, null, 2)}\n`);
console.log(JSON.stringify({ epoch, dungeonLocations: dungeonLocationIds.size, dungeonCells: rows.length, ownerPlugins }, null, 2));
