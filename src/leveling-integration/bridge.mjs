import { validateEvent, validateProgressionContext } from '../contracts/types.mjs';

export function prepareLevelingEvent(event) {
  const eventErrors = validateEvent(event);
  const contextErrors = validateProgressionContext(event?.progressionContext);
  return {
    acceptedForConsumer: eventErrors.length === 0 && contextErrors.length === 0 && event.progressionContext.valid === true,
    failClosed: eventErrors.length > 0 || contextErrors.length > 0 || event?.progressionContext?.valid !== true,
    errors: [...new Set([...eventErrors, ...contextErrors])],
    event
  };
}
