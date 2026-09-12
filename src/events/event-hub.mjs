import { validateEvent, validateProgressionContext } from '../contracts/types.mjs';
import { sha256 } from '../records/identity.mjs';

export class EventHub {
  constructor() { this.listeners = new Map(); }

  on(eventName, listener) {
    const set = this.listeners.get(eventName) ?? new Set();
    set.add(listener);
    this.listeners.set(eventName, set);
    return () => set.delete(listener);
  }

  emit(eventName, event) {
    for (const listener of this.listeners.get(eventName) ?? []) listener(event);
  }
}

export class DeathBridge {
  constructor({ eventHub = new EventHub(), eventName = 'aetherius.enemy.killed.v1' } = {}) {
    this.eventHub = eventHub;
    this.eventName = eventName;
    this.emitted = new Set();
  }

  publish({ victimId, killerId = 0, enemy, progressionContext, occurredAt = Date.now(), respawnGeneration = 0, deathGeneration = 0, contributors = [] }) {
    // The NPC base identity alone is not unique: many live actors can use the
    // same NPC_. Include the stable spawn identity when available and the
    // server actor id as a disambiguator for legacy callers.
    const deathSubject = enemy?.spawnId || `victim:${victimId}`;
    const eventId = sha256(`${deathSubject}|${enemy?.stableEnemyIdentity ?? 'UNRESOLVED'}|${respawnGeneration}|${deathGeneration}`);
    if (this.emitted.has(eventId)) return { duplicate: true, eventId };
    const event = {
      contractVersion: 1,
      eventId,
      occurredAt,
      victimId,
      killerId: Number.isInteger(killerId) ? killerId : 0,
      enemy,
      progressionContext,
      contributors
    };
    const errors = validateEvent(event);
    if (errors.length) return { duplicate: false, event, errors };
    this.emitted.add(eventId);
    this.eventHub.emit(this.eventName, event);
    return { duplicate: false, event, errors: [] };
  }
}

export function progressionContextForProfile(profile) {
  const context = profile?.progressionContext ?? null;
  if (!context) return null;
  return { ...context, valid: validateProgressionContext(context).length === 0 && context.valid === true };
}
