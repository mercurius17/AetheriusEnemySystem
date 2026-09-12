import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { normalizePluginName, stableRecordIdentity } from '../records/identity.mjs';

const RECORD_HEADER_SIZE = 24;
const COMPRESSED_RECORD = 0x00040000;
const ESL_FLAG = 0x00000200;
const DEFAULT_RECORD_TYPES = new Set(['NPC_', 'LVLN', 'LVLI', 'CELL', 'LCTN', 'ECZN', 'ACHR', 'REFR', 'CONT', 'QUST', 'WRLD', 'DOOR']);

function readAscii(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString('ascii');
}

function readFormId(subrecord) {
  return subrecord?.data?.length >= 4 ? subrecord.data.readUInt32LE(0) : null;
}

function readCString(subrecord) {
  return subrecord?.data?.toString('utf8').replace(/\0+$/, '') ?? null;
}

function parseSubrecords(data) {
  const result = [];
  let offset = 0;
  let extendedSize = null;
  while (offset + 6 <= data.length) {
    const type = readAscii(data, offset, 4);
    const shortSize = data.readUInt16LE(offset + 4);
    offset += 6;
    if (type === 'XXXX') {
      if (offset + 4 > data.length) break;
      extendedSize = data.readUInt32LE(offset);
      offset += shortSize;
      continue;
    }
    const size = extendedSize ?? shortSize;
    extendedSize = null;
    if (offset + size > data.length) break;
    result.push({ type, size, data: data.subarray(offset, offset + size) });
    offset += size;
  }
  return result;
}

function groupLabel(buffer, offset) {
  const raw = buffer.readUInt32LE(offset + 8);
  return `0x${raw.toString(16).padStart(8, '0').toUpperCase()}`;
}

function normalizeRecord(record, plugin, groups) {
  const subrecords = record.subrecords;
  const first = (type) => subrecords.find((subrecord) => subrecord.type === type);
  const all = (type) => subrecords.filter((subrecord) => subrecord.type === type);
  const editorId = readCString(first('EDID'));
  const name = readCString(first('FULL'));
  const mask = plugin.light ? 0xFFF : 0xFFFFFF;
  const localFormId = record.formId & mask;
  const output = {
    identity: stableRecordIdentity(plugin.filename, localFormId),
    identityStatus: 'PROVISIONAL_RAW_FILE_NAMESPACE',
    plugin: plugin.filename,
    pluginKind: plugin.kind,
    localFormId,
    formId: record.formId,
    type: record.type,
    recordFlags: record.flags,
    editorId,
    name,
    subrecordTypes: [...new Set(subrecords.map((subrecord) => subrecord.type))],
    groups: groups.map((group) => group.label)
  };
  if (record.type === 'NPC_') {
    output.race = readFormId(first('RNAM'));
    output.factions = all('SNAM').map(readFormId).filter((value) => value !== null);
    output.keywords = all('KWDA').flatMap((subrecord) => {
      const ids = [];
      for (let i = 0; i + 4 <= subrecord.data.length; i += 4) ids.push(`0x${subrecord.data.readUInt32LE(i).toString(16).padStart(8, '0').toUpperCase()}`);
      return ids;
    });
    output.levelSemantics = 'UNRESOLVED';
    output.sourceLevel = null;
  }
  if (record.type === 'LVLN' || record.type === 'LVLI') {
    output.entries = all('LVLO').map((subrecord) => ({
      level: subrecord.data.length >= 2 ? subrecord.data.readUInt16LE(0) : null,
      formId: subrecord.data.length >= 8 ? subrecord.data.readUInt32LE(4) : null,
      count: subrecord.data.length >= 10 ? subrecord.data.readUInt16LE(8) : 1
    })).filter((entry) => entry.formId !== null).map((entry) => ({ ...entry, formId: `0x${(entry.formId & 0xFFFFFFFF).toString(16).padStart(8, '0').toUpperCase()}` }));
    const listFlags = first('LVLF')?.data?.[0] ?? 0;
    output.calculateFromAllLevels = Boolean(listFlags & 0x01);
    output.calculateForEach = Boolean(listFlags & 0x02);
    output.useAll = Boolean(listFlags & 0x04);
    output.chanceNone = first('LVLD')?.data?.[0] ?? 0;
  }
  if (record.type === 'REFR' || record.type === 'ACHR') {
    output.baseFormId = readFormId(first('NAME'));
    output.baseType = null;
    output.cellId = groups.at(-1)?.label ?? null;
    output.quest = null;
    output.questSafetyStatus = 'UNRESOLVED_ALIAS_AND_REFERENCE_RELATIONSHIPS';
    output.scripted = Boolean(first('VMAD'));
  }
  if (record.type === 'CELL') {
    output.locationId = readFormId(first('XLCN'));
    output.encounterZoneId = readFormId(first('XEZN'));
    output.worldspaceId = null;
    output.worldspaceResolution = 'GROUP_CONTEXT_REQUIRED';
  }
  if (record.type === 'CONT') {
    output.containerEntries = all('CNTO').map((subrecord) => readFormId(subrecord)).filter((value) => value !== null);
  }
  return output;
}

function walkRecords(buffer, start, end, plugin, records, groups = []) {
  let offset = start;
  while (offset + RECORD_HEADER_SIZE <= end) {
    const type = readAscii(buffer, offset, 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (!size && type !== 'GRUP') break;
    const blockEnd = Math.min(end, offset + size);
    if (type === 'GRUP') {
      const nextGroups = [...groups, { label: groupLabel(buffer, offset), type: buffer.readUInt32LE(offset + 12) }];
      if (size >= RECORD_HEADER_SIZE) walkRecords(buffer, offset + RECORD_HEADER_SIZE, blockEnd, plugin, records, nextGroups);
    } else {
      const dataStart = offset + RECORD_HEADER_SIZE;
      const dataEnd = Math.min(end, dataStart + size);
      let data = buffer.subarray(dataStart, dataEnd);
      if (buffer.readUInt32LE(offset + 8) & COMPRESSED_RECORD && data.length >= 4) {
        try { data = inflateSync(data.subarray(4)); } catch { /* preserve unreadable record as unresolved */ }
      }
      const parsed = { type, size, flags: buffer.readUInt32LE(offset + 8), formId: buffer.readUInt32LE(offset + 12), subrecords: parseSubrecords(data) };
      if (type !== 'TES4' && DEFAULT_RECORD_TYPES.has(type)) records.push(normalizeRecord(parsed, plugin, groups));
      plugin.recordCount += 1;
      plugin.recordTypes[type] = (plugin.recordTypes[type] ?? 0) + 1;
    }
    const nextOffset = type === 'GRUP' ? blockEnd : Math.min(end, offset + RECORD_HEADER_SIZE + size);
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }
}

function readHeader(buffer) {
  if (buffer.length < RECORD_HEADER_SIZE || readAscii(buffer, 0, 4) !== 'TES4') return { valid: false, flags: null, masters: [] };
  const size = buffer.readUInt32LE(4);
  const data = buffer.subarray(RECORD_HEADER_SIZE, Math.min(buffer.length, RECORD_HEADER_SIZE + size));
  const subrecords = parseSubrecords(data);
  return {
    valid: true,
    flags: buffer.readUInt32LE(8),
    masters: subrecords.filter((subrecord) => subrecord.type === 'MAST').map(readCString).filter(Boolean),
    author: readCString(subrecords.find((subrecord) => subrecord.type === 'CNAM')),
    description: readCString(subrecords.find((subrecord) => subrecord.type === 'SNAM'))
  };
}

export function scanPluginFile(filePath, { includeRecords = false } = {}) {
  const stat = fs.statSync(filePath);
  const filename = path.basename(filePath);
  const extension = path.extname(filename).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  const header = readHeader(buffer);
  const light = extension === '.esl' || Boolean(header.flags & ESL_FLAG);
  const plugin = {
    filename,
    normalizedName: normalizePluginName(filename),
    path: filePath,
    extension,
    kind: light ? 'LIGHT' : extension === '.esm' ? 'MASTER' : 'REGULAR',
    light,
    size: stat.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    headerValid: header.valid,
    headerFlags: header.flags,
    masters: header.masters,
    recordCount: 0,
    recordTypes: {},
    records: []
  };
  if (includeRecords && header.valid) walkRecords(buffer, 0, buffer.length, plugin, plugin.records);
  if (!includeRecords && header.valid) {
    // Count only top-level records cheaply; detailed records are opt-in because assets can be large.
    let offset = 0;
    while (offset + RECORD_HEADER_SIZE <= buffer.length) {
      const type = readAscii(buffer, offset, 4);
      const size = buffer.readUInt32LE(offset + 4);
      if (!size) break;
      plugin.recordCount += 1;
      plugin.recordTypes[type] = (plugin.recordTypes[type] ?? 0) + 1;
      offset += RECORD_HEADER_SIZE + size;
    }
  }
  return plugin;
}

function basename(value) { return path.basename(String(value).replaceAll('\\', '/')); }

export function authorityCandidates(plugins, manualMappings = []) {
  const matchers = {
    SKYRIM_REVAMPED: (name) => name === 'skyrim revamped - complete enemy overhaul.esp',
    LAWLESS: (name) => name.includes('lawless'),
    THE_RESTLESS_DEAD: (name) => name === 'the restless dead.esp',
    BETTER_VAMPIRE_NPCS: (name) => name === 'better vampire npcs.esp'
  };
  const result = Object.fromEntries(Object.entries(matchers).map(([authorityId, matcher]) => [authorityId, plugins.filter((plugin) => matcher(plugin.normalizedName)).map((plugin) => plugin.filename)]));
  for (const mapping of manualMappings) {
    const plugin = plugins.find((candidate) => normalizePluginName(candidate.filename) === normalizePluginName(mapping.pluginFilename));
    if (plugin && Object.hasOwn(result, mapping.authorityId)) result[mapping.authorityId] = [plugin.filename];
  }
  return result;
}

export function scanLoadOrder(settingsPath, { recordPlugins = [], manualMappings = [] } = {}) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const loadOrder = Array.isArray(settings.loadOrder) ? settings.loadOrder : [];
  const wanted = new Set(recordPlugins.map((value) => normalizePluginName(value)));
  const plugins = loadOrder.map((entry, loadOrderIndex) => {
    const filePath = String(entry);
    const filename = basename(filePath);
    const exists = fs.existsSync(filePath);
    if (!exists) return { filename, normalizedName: normalizePluginName(filename), path: filePath, loadOrderIndex, exists: false, kind: 'UNRESOLVED', light: null, size: null, sha256: null, headerValid: false, masters: [], recordCount: null, recordTypes: {}, records: [] };
    const scanned = scanPluginFile(filePath, { includeRecords: wanted.has(normalizePluginName(filename)) });
    return { ...scanned, loadOrderIndex, exists: true, records: scanned.records ?? [] };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    settingsPath,
    loadOrderSource: 'server-settings.json loadOrder',
    plugins,
    authorityCandidates: authorityCandidates(plugins.filter((plugin) => plugin.exists), manualMappings),
    recordScanPlugins: recordPlugins
  };
}
