import test from 'node:test';
import assert from 'node:assert/strict';
import { LoadOrderResolver, WinningOverrideResolver, stableRecordIdentity } from '../../src/index.mjs';

test('stable identity survives regular, light, and load-order index changes', () => {
  assert.equal(stableRecordIdentity('Example.esp', 0x123456), 'Example.esp|123456');
  assert.equal(stableRecordIdentity('Example.esl', 0xabc), 'Example.esl|000ABC');
  const a = stableRecordIdentity('Example.esl', 0xabc);
  const b = stableRecordIdentity('Example.esl', 0xabc);
  assert.equal(a, b);
});

test('winning override uses highest loaded candidate only when candidates are explicit', () => {
  const records = [
    { identity: 'Skyrim.esm|000001', plugin: 'Skyrim.esm', localFormId: 1, type: 'NPC_', loadOrderIndex: 0 },
    { identity: 'Patch.esp|000001', plugin: 'Patch.esp', localFormId: 1, type: 'NPC_', loadOrderIndex: 3 }
  ];
  assert.equal(new WinningOverrideResolver(records).resolve(records[0].identity).winningOverridePlugin, 'Patch.esp');
  const resolver = new LoadOrderResolver([{ filename: 'Skyrim.esm', loadOrderIndex: 0 }, { filename: 'Patch.esp', loadOrderIndex: 3 }]);
  assert.equal(resolver.validatePrecedence([{ authorityId: 'BASE', filename: 'Skyrim.esm' }, { authorityId: 'PATCH', filename: 'Patch.esp' }]).ok, true);
  assert.equal(resolver.validatePrecedence([{ authorityId: 'MISSING', filename: 'Missing.esp' }]).ok, false);
});
