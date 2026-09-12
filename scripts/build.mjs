import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [path.join(root, 'src'), path.join(root, 'scripts')];
const files = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (entry.name.endsWith('.mjs')) files.push(target);
  }
}
for (const directory of roots) visit(directory);
const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file, output: `${result.stdout}${result.stderr}` });
}
const manifest = { schemaVersion: 1, builtAt: new Date().toISOString(), runtime: process.version, filesChecked: files.length, failures };
fs.writeFileSync(path.join(root, 'reports', 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Syntax-checked ${files.length} JavaScript modules.`);
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
