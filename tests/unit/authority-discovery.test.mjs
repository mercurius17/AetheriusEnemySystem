import test from 'node:test';
import assert from 'node:assert/strict';
import { authorityCandidates } from '../../src/discovery/plugin-scanner.mjs';

test('The Restless Dead is the exact draugr and skeleton authority plugin', () => {
  const plugins = [
    { filename: 'The Restless Dead.esp', normalizedName: 'the restless dead.esp' },
    { filename: 'Some Draugr and Skeleton Overhaul.esp', normalizedName: 'some draugr and skeleton overhaul.esp' }
  ];
  const result = authorityCandidates(plugins);
  assert.deepEqual(result.THE_RESTLESS_DEAD, ['The Restless Dead.esp']);
  assert.equal(Object.hasOwn(result, 'DUI'), false);
});
