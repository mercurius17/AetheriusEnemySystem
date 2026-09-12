import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselines = [
  { path: 'C:\\Code\\Aetherius - SkyMP\\sistema-classes', expected: '' },
  { path: 'C:\\Code\\Aetherius - SkyMP\\skymp-main', expected: ' M skymp5-client/yarn.lock\n?? skymp5-client/package-lock.json' },
  { path: 'C:\\Code\\Testes_Build_SKYMP\\skymp-main', expected: ' M skymp5-scripts/pex/ActiveMagicEffect.pex\n M skyrim-platform/src/platform_se/pex/TESModPlatform.pex\n M unit/papyrus_test_files/pex/AAATestObject.pex\n M unit/papyrus_test_files/pex/LatentTest.pex\n M unit/papyrus_test_files/pex/OpcodesTest.pex\n?? vcpkg/\n?? world.zip' }
];
const checks = baselines.map(({ path: repoPath, expected }) => {
  const result = spawnSync('git', ['-c', `safe.directory=${repoPath}`, '-C', repoPath, 'status', '--short'], { encoding: 'utf8' });
  const actual = (result.stdout ?? '').trimEnd();
  return { path: repoPath, expected, actual, unchanged: result.status === 0 && actual === expected };
});
const internalFiles = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.name === '.references') continue;
    if (entry.isDirectory()) visit(target);
    else internalFiles.push(path.relative(root, target).replaceAll('\\', '/'));
  }
}
visit(root);
const report = { schemaVersion: 1, checkedAt: new Date().toISOString(), implementationRoot: root, outsideRepositoriesUnchanged: checks.every((check) => check.unchanged), checks, internalFileCount: internalFiles.length, internalFiles: internalFiles.toSorted() };
fs.writeFileSync(path.join(root, 'reports', 'final-integrity.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Outside repositories unchanged: ${report.outsideRepositoriesUnchanged}`);
for (const check of checks) console.log(`${check.unchanged ? 'OK' : 'CHANGED'} ${check.path}`);
process.exitCode = report.outsideRepositoriesUnchanged ? 0 : 1;
