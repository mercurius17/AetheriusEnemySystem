import fs from 'node:fs';

const FORM_ID = /^([0-9A-Fa-f]{6}):(.+)$/;

export function canonicalFormIdToStableIdentity(formId) {
  const match = FORM_ID.exec(String(formId ?? ''));
  return match ? `${match[2]}|${match[1].toUpperCase()}` : null;
}

export function definingPluginFromFormId(formId) {
  return FORM_ID.exec(String(formId ?? ''))?.[2] ?? null;
}

export function readHousecarlArtifact(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error(`empty houseCARL artifact: ${filePath}`);
  const manifest = JSON.parse(lines[0]);
  if (manifest.housecarl_artifact !== 1 || manifest.tool !== 'housecarl_records') {
    throw new Error(`unsupported houseCARL artifact: ${filePath}`);
  }
  const rows = lines.slice(1).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`invalid JSONL row ${index + 2} in ${filePath}: ${error.message}`); }
  });
  if (manifest.row_count !== rows.length || manifest.total !== rows.length) {
    throw new Error(`incomplete houseCARL artifact: expected ${manifest.total}, got ${rows.length}`);
  }
  return { manifest, rows, filePath };
}

export function field(row, path) {
  return row?.fields?.find((candidate) => candidate.path === path) ?? null;
}

export function fieldValue(row, path) {
  return field(row, path)?.value ?? null;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasFlag(value, flag) {
  return String(value ?? '').split(',').map((item) => item.trim()).includes(flag);
}

function listLinks(row, expression) {
  return (row.fields ?? [])
    .filter((candidate) => expression.test(candidate.path) && candidate.value)
    .map((candidate) => ({ formId: candidate.value, ...(candidate.link ?? {}) }));
}

export function npcFromHousecarlRow(row, { authorityId = null, authorityPlugin = null } = {}) {
  const fixedLevel = parseNumber(fieldValue(row, 'Configuration.Level.Level'));
  const levelMult = parseNumber(fieldValue(row, 'Configuration.Level.LevelMult'));
  const flags = fieldValue(row, 'Configuration.Flags');
  const raceField = field(row, 'Race');
  const templateField = field(row, 'Template');
  const scripts = (row.fields ?? []).filter((candidate) => /^VirtualMachineAdapter\.Scripts\[\d+\]$/.test(candidate.path));
  return {
    type: 'NPC_',
    identity: canonicalFormIdToStableIdentity(row.formid),
    canonicalFormId: row.formid,
    runtimeFormId: row.runtime_formid,
    sourcePlugin: definingPluginFromFormId(row.formid),
    touchedByPlugin: row.source ?? authorityPlugin,
    authorityId,
    authorityPlugin,
    winningOverridePlugin: row.winner ?? null,
    overrideDepth: row.override_depth ?? null,
    editorId: row.editorid ?? null,
    race: raceField?.value ?? null,
    raceEditorId: raceField?.link?.editorid ?? null,
    factions: listLinks(row, /^Factions\[\d+\]\.Faction$/),
    keywords: listLinks(row, /^Keywords\[\d+\]$/),
    template: templateField?.value ?? null,
    templateType: templateField?.link?.type ?? null,
    levelSemantics: fixedLevel !== null ? 'FIXED' : levelMult !== null ? 'PC_LEVEL_MULT' : 'UNRESOLVED',
    sourceLevel: fixedLevel,
    levelMultiplier: levelMult,
    calcMinLevel: parseNumber(fieldValue(row, 'Configuration.CalcMinLevel')),
    calcMaxLevel: parseNumber(fieldValue(row, 'Configuration.CalcMaxLevel')),
    autoCalcStats: hasFlag(flags, 'AutoCalcStats'),
    unique: hasFlag(flags, 'Unique'),
    essential: hasFlag(flags, 'Essential'),
    protected: hasFlag(flags, 'Protected'),
    respawns: hasFlag(flags, 'Respawn'),
    scripted: scripts.length > 0,
    scriptCount: scripts.length,
    perks: listLinks(row, /^Perks\[\d+\]\.Perk$/),
    spells: listLinks(row, /^ActorEffect\[\d+\]$/),
    combatStyle: field(row, 'CombatStyle')?.value ?? null,
    provenance: {
      source: 'houseCARL winner snapshot',
      epoch: null,
      scopedPlugin: row.source ?? authorityPlugin,
      canonicalFormId: row.formid
    }
  };
}

export function leveledListFromHousecarlRow(row) {
  const byIndex = new Map();
  for (const candidate of row.fields ?? []) {
    const match = /^Entries\[(\d+)\]\.Data\.(Level|Reference|Count)$/.exec(candidate.path);
    if (!match) continue;
    const index = Number(match[1]);
    const entry = byIndex.get(index) ?? { index, level: null, formId: null, count: 1, targetType: null, targetEditorId: null };
    if (match[2] === 'Level') entry.level = parseNumber(candidate.value);
    if (match[2] === 'Count') entry.count = parseNumber(candidate.value) ?? 1;
    if (match[2] === 'Reference') {
      entry.formId = candidate.value ?? null;
      entry.targetType = candidate.link?.type ?? null;
      entry.targetEditorId = candidate.link?.editorid ?? null;
      entry.resolved = candidate.link?.resolved === true;
    }
    byIndex.set(index, entry);
  }
  const flags = fieldValue(row, 'Flags');
  return {
    id: row.formid,
    identity: canonicalFormIdToStableIdentity(row.formid),
    canonicalFormId: row.formid,
    editorId: row.editorid ?? null,
    winner: row.winner ?? null,
    sourcePlugin: row.source ?? null,
    entries: [...byIndex.values()].sort((a, b) => a.index - b.index),
    calculateFromAllLevels: hasFlag(flags, 'CalculateFromAllLevelsLessThanOrEqualPlayer'),
    calculateForEach: hasFlag(flags, 'CalculateForEachItemInCount'),
    useAll: hasFlag(flags, 'UseAll'),
    chanceNone: parseNumber(fieldValue(row, 'ChanceNone')) ?? 0
  };
}

export function cellFromHousecarlRow(row) {
  const location = field(row, 'Location');
  const encounterZone = field(row, 'EncounterZone');
  const flags = fieldValue(row, 'Flags');
  return {
    type: 'CELL',
    identity: canonicalFormIdToStableIdentity(row.formid),
    canonicalFormId: row.formid,
    sourcePlugin: definingPluginFromFormId(row.formid),
    touchedByPlugin: row.source ?? null,
    winningOverridePlugin: row.winner ?? null,
    editorId: row.editorid ?? null,
    name: fieldValue(row, 'Name'),
    locationId: location?.value ?? null,
    locationIdentity: canonicalFormIdToStableIdentity(location?.value),
    locationEditorId: location?.link?.editorid ?? null,
    locationName: location?.link?.name ?? null,
    encounterZoneId: encounterZone?.value ?? null,
    encounterZoneEditorId: encounterZone?.link?.editorid ?? null,
    flags,
    isInterior: hasFlag(flags, 'IsInteriorCell')
  };
}

export function locationFromHousecarlRow(row) {
  const parent = field(row, 'ParentLocation');
  return {
    type: 'LCTN',
    identity: canonicalFormIdToStableIdentity(row.formid),
    canonicalFormId: row.formid,
    sourcePlugin: definingPluginFromFormId(row.formid),
    winningOverridePlugin: row.winner ?? null,
    editorId: row.editorid ?? null,
    name: fieldValue(row, 'Name'),
    parentLocationId: parent?.value ?? null,
    parentLocationIdentity: canonicalFormIdToStableIdentity(parent?.value),
    keywords: listLinks(row, /^Keywords\[\d+\]$/)
  };
}

export function placedNpcFromHousecarlRow(row) {
  const base = field(row, 'Base');
  const parent = field(row, '*parent.FormKey');
  const location = field(row, '*parent.Location');
  const scripts = (row.fields ?? []).filter((candidate) => /^VirtualMachineAdapter\.Scripts\[\d+\]$/.test(candidate.path));
  return {
    type: 'ACHR',
    identity: canonicalFormIdToStableIdentity(row.formid),
    canonicalFormId: row.formid,
    winningOverridePlugin: row.winner ?? null,
    baseId: base?.value ?? null,
    baseIdentity: canonicalFormIdToStableIdentity(base?.value),
    baseType: base?.link?.type ?? null,
    baseEditorId: base?.link?.editorid ?? null,
    baseName: base?.link?.name ?? null,
    cellId: parent?.value ?? null,
    cellIdentity: canonicalFormIdToStableIdentity(parent?.value),
    cellEditorId: parent?.link?.editorid ?? fieldValue(row, '*parent.EditorID'),
    cellName: parent?.link?.name ?? fieldValue(row, '*parent.Name'),
    locationId: location?.value ?? null,
    locationIdentity: canonicalFormIdToStableIdentity(location?.value),
    locationEditorId: location?.link?.editorid ?? null,
    locationName: location?.link?.name ?? null,
    scripted: scripts.length > 0,
    enabledByParent: field(row, 'EnableParent')?.note !== '(absent)'
  };
}

export function assertSingleEpoch(artifacts) {
  const epochs = [...new Set(artifacts.map(({ manifest }) => manifest.epoch).filter(Boolean))];
  if (epochs.length !== 1) throw new Error(`houseCARL artifacts span multiple load-order epochs: ${epochs.join(', ')}`);
  return epochs[0];
}
