import { CONTAINER_ROLES, LOOT_AUTHORITIES } from '../contracts/types.mjs';

export function validateLootAuthority(authority) {
  return LOOT_AUTHORITIES.includes(authority);
}

export function resolveManagedLoot(container, { lootSystemPresent = false } = {}) {
  const authority = container.questCritical ? 'QUEST' : container.lootAuthority ?? 'VANILLA';
  const role = CONTAINER_ROLES.includes(container.role) ? container.role : 'UNRESOLVED';
  if (authority === 'QUEST') return { authority, role: 'QUEST', action: 'PRESERVE', reason: 'quest/script/alias semantics are protected' };
  if (authority === 'EXTERNAL') return { authority, role, action: 'KEEP_EMPTY', lootSystemPresent, reason: lootSystemPresent ? 'future Loot System may claim this source' : 'fail-closed without Loot System' };
  if (authority === 'SUPPRESSED') return { authority, role, action: 'KEEP_EMPTY', lootSystemPresent, reason: 'suppressed by explicit policy' };
  if (authority === 'VANILLA') return { authority, role, action: 'PRESERVE', reason: 'Enemy System is not authoritative for this source' };
  return { authority: 'UNRESOLVED', role: 'UNRESOLVED', action: 'BLOCK', reason: 'unknown loot authority' };
}

export function buildLootSourceDescriptor(container, options = {}) {
  const policy = resolveManagedLoot(container, options);
  return {
    schemaVersion: 1,
    sourceId: container.sourceId,
    sourceType: container.sourceType ?? 'CONTAINER',
    lootAuthority: policy.authority,
    containerRole: policy.role,
    action: policy.action,
    questCritical: Boolean(container.questCritical),
    provenance: container.provenance ?? null
  };
}

export class ManagedLootController {
  constructor({ lootSystemPresent = false } = {}) {
    this.lootSystemPresent = lootSystemPresent;
  }

  plan(container) {
    return resolveManagedLoot(container, { lootSystemPresent: this.lootSystemPresent });
  }

  onEmptyManagedContainer(container) {
    const policy = this.plan(container);
    if (policy.action === 'KEEP_EMPTY') return { ...policy, reloot: 'BLOCKED_IF_GRANULAR_CAPABILITY_AVAILABLE' };
    return { ...policy, reloot: 'UNCHANGED' };
  }

  onDungeonGeneration({ dungeonId, generation, reason = 'NEW_GENERATION' } = {}) {
    if (!dungeonId || !Number.isInteger(generation) || generation < 0) throw new Error('dungeonId and non-negative generation are required');
    return {
      schemaVersion: 1,
      dungeonId,
      generation,
      reason,
      action: this.lootSystemPresent ? 'DELEGATE_TO_AETHERIUS_LOOT_SYSTEM' : 'RESTORE_SOURCE_COMPOSITION',
      restoreWithinSameGeneration: false
    };
  }

  onDungeonReset(context = {}) {
    return this.onDungeonGeneration({ ...context, reason: 'DUNGEON_RESET' });
  }
}
