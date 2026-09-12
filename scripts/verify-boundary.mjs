import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gitRootResult = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
if (gitRootResult.status !== 0) throw new Error(`Cannot resolve repository root: ${gitRootResult.stderr}`);

const gitRoot = path.resolve(gitRootResult.stdout.trim());
const statusResult = spawnSync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
if (statusResult.status !== 0) throw new Error(`Cannot inspect repository status: ${statusResult.stderr}`);

const changedPaths = statusResult.stdout
  .split(/\r?\n/)
  .filter(Boolean)
  .flatMap((entry) => entry.slice(3).split(' -> '))
  .map((entry) => entry.replace(/^"|"$/g, ''));

function isContained(relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

const escapedPaths = changedPaths.filter((entry) => !isContained(entry));
const report = {
  schemaVersion: 2,
  checkedAt: new Date().toISOString(),
  implementationRoot: root,
  gitRoot,
  repositoryRootMatches: gitRoot === root,
  boundaryContained: gitRoot === root && escapedPaths.length === 0,
  changedPaths: changedPaths.toSorted(),
  escapedPaths: escapedPaths.toSorted()
};

fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports', 'final-integrity.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Repository boundary contained: ${report.boundaryContained}`);
console.log(`Changed paths inspected: ${report.changedPaths.length}`);
process.exitCode = report.boundaryContained ? 0 : 1;
