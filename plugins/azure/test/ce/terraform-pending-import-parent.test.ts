import { expect, test } from 'bun:test';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';
import { executeOwningPendingImport } from './terraform-pending-import-parent-fixture';

test('same owning main runner executes pending import and preserves immutable completed replay', async () => {
  const original = await originalNativeWorkflowFixture(true, false, undefined, undefined, true);
  try {
    expect((await original.run()).status).toBe('registered');
    const proof = await executeOwningPendingImport(original);
    expect(Object.keys(proof.payloadSha256ByField).sort()).toEqual(['importedConfiguration', 'originalConfiguration']);
  } finally {
    await original.close();
  }
}, 180000);
