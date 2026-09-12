import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReadinessReport, formatReadinessReport } from '../src/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
const discovery = read(path.join(root, 'config', 'generated', 'plugin-discovery.generated.json'), { plugins: [], authorityCandidates: {} });
const enemies = read(path.join(root, 'config', 'generated', 'enemies.generated.json'), { enemies: [] });
const dungeons = read(path.join(root, 'config', 'generated', 'dungeons.generated.json'), { dungeons: [] });
const lvln = read(path.join(root, 'config', 'generated', 'lvln-reachability.generated.json'), { lists: [] });
const housecarl = read(path.join(root, 'config', 'generated', 'housecarl-evidence.generated.json'), { authorityResolution: {} });
const profileEvidence = read(path.join(root, 'config', 'generated', 'housecarl-load-order.generated.json'), { profiles: [] });
const authorityConfig = read(path.join(root, 'config', 'enemy-authorities.json'), { precedence: [] });
const authorityIssues = [];
if (profileEvidence.epoch && dungeons.housecarlEpoch && profileEvidence.epoch !== dungeons.housecarlEpoch) authorityIssues.push({ severity: 'ERROR', code: 'DUNGEON_SNAPSHOT_EPOCH_STALE', snapshotEpoch: dungeons.housecarlEpoch, liveEpoch: profileEvidence.epoch });
if (profileEvidence.epoch && enemies.housecarlEpoch && profileEvidence.epoch !== enemies.housecarlEpoch) authorityIssues.push({ severity: 'ERROR', code: 'ENEMY_SNAPSHOT_EPOCH_STALE', snapshotEpoch: enemies.housecarlEpoch, liveEpoch: profileEvidence.epoch });
const authorityOrder = authorityConfig.precedence;
for (const authorityId of authorityOrder) {
  const filename = housecarl.authorityResolution?.[authorityId] ?? null;
  if (!filename) authorityIssues.push({ severity: 'ERROR', code: 'AUTHORITY_PLUGIN_UNRESOLVED', authorityId });
  else if (!discovery.plugins.find((candidate) => candidate.filename === filename)) authorityIssues.push({ severity: 'ERROR', code: 'AUTHORITY_PLUGIN_NOT_IN_DECLARED_LOAD_ORDER', authorityId, filename });
}
const resolvedAuthorities = authorityOrder.map((authorityId) => {
  const filename = housecarl.authorityResolution?.[authorityId] ?? null;
  return { authorityId, filename, plugin: discovery.plugins.find((candidate) => candidate.filename === filename) };
}).filter((entry) => entry.plugin);
const precedenceIssues = [];
for (let i = 1; i < resolvedAuthorities.length; i += 1) if (resolvedAuthorities[i - 1].plugin.loadOrderIndex >= resolvedAuthorities[i].plugin.loadOrderIndex) precedenceIssues.push({ severity: 'ERROR', code: 'AUTHORITY_PRECEDENCE_INVALID', before: resolvedAuthorities[i - 1].authorityId, after: resolvedAuthorities[i].authorityId });
const profilePluginCounts = profileEvidence.profiles.map((profile) => profile.activePlugins);
const profileIssues = new Set(profilePluginCounts).size > 1
  ? [{ severity: 'ERROR', code: 'MO2_PROFILE_PLUGIN_COUNT_MISMATCH', counts: profileEvidence.profiles.map((profile) => ({ name: profile.name, activePlugins: profile.activePlugins })) }]
  : [];
if (profilePluginCounts.length > 0 && profilePluginCounts.some((count) => count !== discovery.plugins.length)) {
  profileIssues.push({
    severity: 'WARN',
    code: 'DECLARED_SERVER_LOAD_ORDER_STALE_MO2_IS_AUTHORITY',
    declaredPluginCount: discovery.plugins.length,
    liveProfiles: profileEvidence.profiles.map((profile) => ({ name: profile.name, activePlugins: profile.activePlugins }))
  });
}
const issues = [...authorityIssues, ...precedenceIssues, ...profileIssues];
const enemiesByCanonicalId = new Map((enemies.enemies ?? []).map((enemy) => [enemy.canonicalFormId, enemy]));
const unresolvedOrphans = (lvln.orphanEnemies ?? []).filter((identity) => {
  const enemy = enemiesByCanonicalId.get(identity);
  return !enemy || enemy.classificationStatus !== 'RESOLVED' || enemy.unique || enemy.scripted;
});
const reachabilityForReadiness = { ...lvln, orphanEnemies: unresolvedOrphans };
const report = buildReadinessReport({ sourceLockOk: fs.existsSync(path.join(root, 'docs', 'SOURCE_LOCK.md')), plugins: discovery.plugins, loadOrderValidation: { ok: !issues.some((issue) => issue.severity === 'ERROR'), issues }, enemyRegistry: enemies, reachability: [reachabilityForReadiness], dungeons: dungeons.dungeons ?? [], integration: { inGameValidated: false, housecarlEpoch: dungeons.housecarlEpoch ?? housecarl.housecarl?.epoch ?? null, profilePluginCounts } });
const output = path.join(root, 'reports', 'readiness.generated.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(formatReadinessReport(report));
process.exitCode = report.readyForProduction ? 0 : 1;
