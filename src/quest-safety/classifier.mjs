export const QUEST_SAFETY_ROLES = Object.freeze(['GENERIC', 'BOSS_GENERIC', 'BOSS_UNIQUE', 'QUEST_CRITICAL', 'SCRIPTED', 'UNRESOLVED']);

export function classifyReference(reference, { serverHasQuests = true } = {}) {
  if (!reference || typeof reference !== 'object') return { role: 'UNRESOLVED', reason: 'missing reference metadata' };
  if (reference.boss && reference.unique) return { role: 'BOSS_UNIQUE', reason: 'explicit boss role plus unique flag' };
  if (!serverHasQuests && reference.unique) return { role: 'BOSS_UNIQUE', reason: 'user-authorized unique boss on a server without quests' };
  if (reference.questCritical || reference.questAlias || reference.unique) return { role: 'QUEST_CRITICAL', reason: 'quest relationship or unique flag' };
  if (reference.scripted) return { role: 'SCRIPTED', reason: 'script metadata' };
  if (reference.boss && reference.generic) return { role: 'BOSS_GENERIC', reason: 'explicit boss/generic metadata' };
  if (reference.generic === true) return { role: 'GENERIC', reason: 'explicit generic metadata' };
  return { role: 'UNRESOLVED', reason: 'no authoritative safety evidence' };
}

export class QuestSafetyClassifier {
  constructor({ serverHasQuests = true } = {}) { this.serverHasQuests = serverHasQuests; }

  classify(references = []) {
    return references.map((reference) => ({ ...reference, ...classifyReference(reference, { serverHasQuests: this.serverHasQuests }) }));
  }
}
