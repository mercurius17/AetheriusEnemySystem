import { createEncounterProfile, createEncounterSegment, validateEncounterProfile, validateEncounterSegment } from '../contracts/factories.mjs';

export { createEncounterProfile, createEncounterSegment, validateEncounterProfile, validateEncounterSegment };

export function resolveEncounterContext(profile, segment = null) {
  if (!profile?.progressionContext) return null;
  return segment?.progressionContext ? segment.progressionContext : profile.progressionContext;
}
