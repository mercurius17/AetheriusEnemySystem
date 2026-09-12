import { sha256 } from '../records/identity.mjs';

function asMap(value) {
  return value instanceof Map ? value : new Map(Object.entries(value ?? {}));
}

function stableNumber(seed) {
  return Number.parseInt(sha256(seed).slice(0, 12), 16) / 0x1000000000000;
}

/**
 * Analyzes possible LVLN/LVLI reachability without rolling a player-dependent list.
 * `lists` entries use the adapter-neutral shape documented in docs/ARCHITECTURE.md.
 */
export function analyzeReachability({ roots = [], lists: sourceLists = new Map(), npcs: sourceNpcs = new Map(), level = null } = {}) {
  const lists = asMap(sourceLists);
  const npcs = asMap(sourceNpcs);
  const reachableNpcs = new Set();
  const reachableLists = new Set();
  const missing = [];
  const cycles = [];
  const paths = [];
  const visitedEdges = new Set();

  function walk(id, path, stack) {
    if (npcs.has(id)) {
      reachableNpcs.add(id);
      paths.push({ npcId: id, path: [...path, id] });
      return;
    }
    const list = lists.get(id);
    if (!list) {
      missing.push({ id, path: [...path, id] });
      return;
    }
    if (stack.has(id)) {
      cycles.push({ id, path: [...path, id] });
      return;
    }
    reachableLists.add(id);
    const nextStack = new Set(stack).add(id);
    const entries = Array.isArray(list.entries) ? list.entries : [];
    for (const entry of entries) {
      const edge = `${id}->${entry.formId}`;
      if (visitedEdges.has(edge)) continue;
      visitedEdges.add(edge);
      const threshold = Number.isInteger(entry.level) ? entry.level : 0;
      if (level !== null && level !== undefined && threshold > level) continue;
      walk(entry.formId, [...path, id], nextStack);
    }
  }

  for (const root of roots) walk(root, [], new Set());
  return {
    roots: [...roots],
    reachableNpcs: [...reachableNpcs],
    reachableLists: [...reachableLists],
    missing,
    cycles,
    paths,
    unresolved: [...new Set(missing.map((item) => item.id))],
    hasCriticalFailure: missing.length > 0 || cycles.length > 0
  };
}

export function resolveListDeterministic(listId, lists, seed, { level = null, maxDepth = 64 } = {}) {
  const map = asMap(lists);
  const trace = [];
  const stack = new Set();

  function resolve(id, depth, invocationSeed) {
    if (depth > maxDepth) return { status: 'FAILED', reason: 'maximum list depth exceeded', trace };
    if (stack.has(id)) return { status: 'FAILED', reason: 'circular leveled-list reference', trace };
    const list = map.get(id);
    if (!list) return { status: 'FAILED', reason: `missing leveled list ${id}`, trace };
    stack.add(id);
    const eligible = (list.entries ?? []).filter((entry) => level === null || level === undefined || !Number.isInteger(entry.level) || entry.level <= level);
    const chanceNone = Math.max(0, Math.min(100, Number(list.chanceNone ?? 0)));
    const chanceRoll = stableNumber(`${invocationSeed}|${id}|chance-none`) * 100;
    trace.push({ listId: id, useAll: Boolean(list.useAll), calculateForEach: Boolean(list.calculateForEach), chanceNone, chanceRoll, candidateCount: eligible.length });
    if (chanceRoll < chanceNone) {
      stack.delete(id);
      return { status: 'EMPTY', reason: 'chance none', trace };
    }
    if (!eligible.length) {
      stack.delete(id);
      return { status: 'EMPTY', reason: 'no eligible entries', trace };
    }
    const chosen = list.useAll ? eligible : [eligible[Math.floor(stableNumber(`${invocationSeed}|${id}|entry`) * eligible.length)]];
    const output = [];
    for (let chosenIndex = 0; chosenIndex < chosen.length; chosenIndex += 1) {
      const entry = chosen[chosenIndex];
      const count = Math.max(1, Number.isInteger(entry.count) ? entry.count : 1);
      const childList = map.get(entry.formId);
      if (childList) {
        const invocations = childList.calculateForEach && count > 1 ? count : 1;
        const childOutput = [];
        for (let occurrence = 0; occurrence < invocations; occurrence += 1) {
          const nested = resolve(entry.formId, depth + 1, `${invocationSeed}|${id}|${chosenIndex}|${occurrence}`);
          if (nested.status === 'FAILED') {
            stack.delete(id);
            return nested;
          }
          childOutput.push(...(nested.formIds ?? []));
        }
        if (invocations === 1) output.push(...childOutput.flatMap((formId) => Array.from({ length: count }, () => formId)));
        else output.push(...childOutput);
      } else {
        output.push(...Array.from({ length: count }, () => entry.formId));
      }
    }
    stack.delete(id);
    return output.length ? { status: 'RESOLVED', formIds: output, trace } : { status: 'EMPTY', reason: 'nested lists resolved empty', formIds: [], trace };
  }
  return resolve(listId, 0, seed);
}

export function deterministicPick(items, seed) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(stableNumber(seed) * items.length)];
}

export function deterministicWeightedPick(items, seed, weightSelector = (item) => item.sourceWeight) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const weights = items.map((item) => Number(weightSelector(item)));
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) return null;
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = stableNumber(seed) * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) return items[index];
  }
  return items.at(-1);
}
