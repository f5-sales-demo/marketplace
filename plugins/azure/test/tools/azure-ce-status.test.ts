import { expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import type { PluginInterface } from '../../src/az/types';
import type { AzureCePlan } from '../../src/ce/types';
import { createAzureCeDiagnoseTool } from '../../src/tools/azure-ce-diagnose';
import { azureSummary, createAzureCeStatusTool } from '../../src/tools/azure-ce-status';

it('rejects caller health assertions before reading plans or making cloud calls', async () => {
  const pi = { typebox: { Type } } as unknown as PluginInterface;
  for (const tool of [createAzureCeStatusTool(pi), createAzureCeDiagnoseTool(pi)]) {
    const result = await tool.execute(
      'test',
      {
        planId: 'missing',
        planSha256: 'missing',
        mode: 'passive',
        f5Evidence: { siteState: 'healthy', bgpEstablished: true },
      },
      undefined,
      undefined,
      {} as never,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Caller-supplied F5 health evidence is unsupported');
    expect(JSON.stringify(tool.parameters)).not.toContain('f5Evidence');
  }
});

it('reports lifecycle-owned resources using the frozen deployment plan hash', () => {
  const ownerPlanSha256 = 'a'.repeat(64);
  const resource = {
    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/ce-1',
    name: 'ce-1',
    type: 'Microsoft.Compute/virtualMachines',
    powerState: 'VM running',
    provisioningState: 'Succeeded',
    tags: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-deployment-id': 'ce',
      'xcsh-execution-engine': 'native',
      'xcsh-plan-sha256': ownerPlanSha256,
    },
  };
  const plan = {
    planSha256: 'b'.repeat(64),
    engine: 'native',
    subscription: { id: 'sub' },
    intent: { resourceGroup: 'rg' },
    deploymentName: 'ce',
    actions: [{ kind: 'vm-state-gate', expectedOwnerPlanSha256: ownerPlanSha256 }],
  } as AzureCePlan;
  expect(azureSummary(plan, [resource], [resource], [])).toMatchObject({
    resources: [{ id: resource.id }],
    vms: [{ name: 'ce-1', powerState: 'VM running' }],
  });
  const foreign = { ...resource, tags: { ...resource.tags, 'xcsh-plan-sha256': 'c'.repeat(64) } };
  expect(azureSummary(plan, [foreign], [foreign], [])).toMatchObject({ resources: [], vms: [] });
});
