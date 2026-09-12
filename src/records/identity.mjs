import { createHash } from 'node:crypto';

export function normalizePluginName(name) {
  return String(name ?? '').replaceAll('\\', '/').split('/').at(-1).toLowerCase();
}

export function stableRecordIdentity(plugin, localFormId) {
  if (!plugin || !Number.isInteger(localFormId) || localFormId < 0) return null;
  return `${plugin}|${localFormId.toString(16).padStart(6, '0').toUpperCase()}`;
}

export function parseStableRecordIdentity(identity) {
  const match = /^(.+)\|([0-9A-Fa-f]{6})$/.exec(String(identity ?? ''));
  if (!match) return null;
  return { plugin: match[1], localFormId: Number.parseInt(match[2], 16) };
}

export function stableSpawnIdentity({ plugin, localFormId, refId, cellId, sourcePath }) {
  const direct = refId ?? localFormId;
  if (!plugin || !Number.isInteger(direct)) return null;
  const suffix = [cellId, sourcePath].filter((value) => value !== undefined && value !== null && value !== '').join('|');
  return `${plugin}|${direct.toString(16).padStart(6, '0').toUpperCase()}${suffix ? `|${suffix}` : ''}`;
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function fingerprint(value) {
  return sha256(JSON.stringify(value));
}

export class LoadOrderResolver {
  constructor(plugins = []) {
    this.plugins = [...plugins];
    this.byName = new Map(this.plugins.map((plugin) => [normalizePluginName(plugin.filename), plugin]));
  }

  get(filename) {
    return this.byName.get(normalizePluginName(filename)) ?? null;
  }

  indexOf(filename) {
    const plugin = this.get(filename);
    return plugin ? plugin.loadOrderIndex : null;
  }

  validatePrecedence(requiredAuthorityFilenames) {
    const issues = [];
    const resolved = [];
    for (const entry of requiredAuthorityFilenames) {
      const plugin = this.get(entry.filename);
      if (!plugin) {
        issues.push({ severity: 'ERROR', code: 'AUTHORITY_PLUGIN_MISSING', authorityId: entry.authorityId, filename: entry.filename });
        continue;
      }
      resolved.push({ ...entry, plugin });
    }
    for (let i = 1; i < resolved.length; i += 1) {
      if (resolved[i - 1].plugin.loadOrderIndex >= resolved[i].plugin.loadOrderIndex) {
        issues.push({ severity: 'ERROR', code: 'AUTHORITY_PRECEDENCE_INVALID', before: resolved[i - 1].authorityId, after: resolved[i].authorityId });
      }
    }
    return { ok: issues.every((issue) => issue.severity !== 'ERROR'), issues, resolved };
  }
}

export class WinningOverrideResolver {
  constructor(records = [], loadOrder = []) {
    this.records = records;
    this.loadOrder = new LoadOrderResolver(loadOrder);
  }

  resolve(recordIdentity) {
    const record = this.records.find((candidate) => candidate.identity === recordIdentity);
    if (!record) return { status: 'UNRESOLVED', winningOverridePlugin: null, reason: 'record not found' };
    if (record.winningOverridePlugin) return { status: 'RESOLVED', winningOverridePlugin: record.winningOverridePlugin, evidence: record.overrideEvidence ?? 'adapter-provided' };
    const candidates = this.records.filter((candidate) => candidate.localFormId === record.localFormId && candidate.type === record.type);
    if (candidates.length === 1) return { status: 'RESOLVED', winningOverridePlugin: candidates[0].plugin, evidence: 'single candidate' };
    if (candidates.length > 1) {
      const sorted = candidates.toSorted((a, b) => (a.loadOrderIndex ?? -1) - (b.loadOrderIndex ?? -1));
      const winner = sorted.at(-1);
      if (winner?.loadOrderIndex !== undefined && sorted.every((candidate) => candidate.loadOrderIndex !== undefined)) {
        return { status: 'RESOLVED', winningOverridePlugin: winner.plugin, evidence: 'highest loaded candidate; ownership must be adapter-verified' };
      }
      return { status: 'UNRESOLVED', winningOverridePlugin: null, reason: 'multiple candidates without authoritative ownership/load order' };
    }
    return { status: 'UNRESOLVED', winningOverridePlugin: null, reason: 'no winning override evidence' };
  }
}
