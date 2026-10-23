import { expect, test } from 'bun:test';
import { readAzureTerraformWorkflowStatus } from '../../src/ce/terraform-status';
import type { AzureCePlan } from '../../src/ce/types';

const plan = { engine: 'terraform', planSha256: 'a'.repeat(64) } as AzureCePlan;
const workflow = {
  schemaVersion: 1,
  engine: 'terraform',
  planSha256: plan.planSha256,
  configurationSha256: 'b'.repeat(64),
  stage: 'registration-pending',
  bootstrapByNode: { '1': 'private-material' },
};
test('reports owning Terraform progress without exporting bootstrap or inventing native completion', async () => {
  for (const stage of ['network-pending', 'registration-pending', 'registered']) {
    const result = await readAzureTerraformWorkflowStatus(plan, {
      verify: async () => {},
      read: async () => ({ ...workflow, stage }),
    });
    expect(result.state).toBe(stage);
    expect(JSON.stringify(result)).not.toContain('private-material');
    expect(result).not.toHaveProperty('completedActionIds');
  }
});
test('missing journal differs from foreign, malformed, unavailable or unauthorized evidence', async () => {
  const absent = await readAzureTerraformWorkflowStatus(plan, {
    verify: async () => {},
    read: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
  });
  expect(absent.state).toBe('not-started');
  for (const value of [
    null,
    [],
    { ...workflow, engine: 'native' },
    { ...workflow, planSha256: 'c'.repeat(64) },
    { ...workflow, configurationSha256: '' },
    { ...workflow, stage: 'complete' },
  ]) {
    await expect(
      readAzureTerraformWorkflowStatus(plan, { verify: async () => {}, read: async () => value }),
    ).rejects.toThrow();
  }
  await expect(
    readAzureTerraformWorkflowStatus(plan, {
      verify: async () => {
        throw new Error('foreign owner');
      },
      read: async () => workflow,
    }),
  ).rejects.toThrow('foreign owner');
  await expect(
    readAzureTerraformWorkflowStatus(plan, {
      verify: async () => {},
      read: async () => {
        throw new Error('service unavailable');
      },
    }),
  ).rejects.toThrow('service unavailable');
});
