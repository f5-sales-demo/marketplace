import { describe, expect, it } from 'bun:test';
import { observeAzureHealth } from '../../src/ce/health-observation';
import { shutdownProperties, shutdownResourceBody, verifyShutdown } from '../../src/ce/lifetime';

const plan = {
  subscription: { id: 'test-subscription' },
  intent: { resourceGroup: 'test-group' },
  deploymentName: 'test-ce',
  planSha256: 'a'.repeat(64),
  region: 'test-region',
  ownershipTagTemplate: {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-deployment-id': 'test-ce',
    'xcsh-plan-sha256': '__PLAN_SHA256__',
  },
} as any;
const deadline = () => new Date(Date.now() + 7 * 3600_000).toISOString();
describe('bounded compute exposure and measured gates', () => {
  it('rejects expired or oversized deadlines', () => {
    expect(() => shutdownProperties(plan, 1, new Date(Date.now() - 1).toISOString())).toThrow();
    expect(() => shutdownProperties(plan, 1, new Date(Date.now() + 9 * 3600_000).toISOString())).toThrow();
  });
  it('binds location, resolved ownership and VM deadline in the full ARM request', () => {
    const at = deadline();
    const body = shutdownResourceBody(plan, 1, at);
    expect(body).toEqual({
      location: 'test-region',
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-deployment-id': 'test-ce',
        'xcsh-plan-sha256': plan.planSha256,
      },
      properties: shutdownProperties(plan, 1, at),
    });
    expect(body.properties.targetResourceId).toBe(
      '/subscriptions/test-subscription/resourceGroups/test-group/providers/Microsoft.Compute/virtualMachines/test-ce-1',
    );
  });
  it('requires a fresh enabled cloud schedule bound to the exact VM, plan and UTC time', async () => {
    const at = deadline(),
      action = { node: 1, resourceId: '/test/schedule' } as any;
    const observed = {
      id: action.resourceId,
      properties: shutdownProperties(plan, 1, at),
      tags: { 'xcsh-deployment-id': plan.deploymentName, 'xcsh-plan-sha256': plan.planSha256 },
    };
    const api = { exec: async () => ({ exitCode: 0, stdout: JSON.stringify(observed), stderr: '' }) };
    await expect(verifyShutdown(plan, action, at, api)).resolves.toBeUndefined();
    observed.properties.targetResourceId = '/other-vm';
    await expect(verifyShutdown(plan, action, at, api)).rejects.toThrow();
  });
  it('never treats Azure existence or caller claims as F5 health', async () => {
    const api = { exec: async () => ({ exitCode: 0, stdout: '{}', stderr: '' }) };
    const result = await observeAzureHealth(plan, 1, api, {});
    expect(result.status).toBe('unknown');
  });
});
