import { expect, test } from 'bun:test';
import {
  azureTerraformNetworkPowerDeployment,
  azureTerraformNetworkRetiredPowerDeployment,
} from '../../src/ce/terraform-network-power';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

for (const ha of [false, true])
  test(`retired power identity exactly matches original release for ${ha ? 'three-node' : 'single-node'} source`, async () => {
    const f = await terraformNetworkSourceFixture(ha);
    const stages = new Set<string>();
    for (const node of Object.keys(f.before.nodes).map(Number))
      for (const operation of ['deallocate', 'start'] as const) {
        const original = await azureTerraformNetworkPowerDeployment(f.plan, f.before, node, operation, true);
        const retired = await azureTerraformNetworkRetiredPowerDeployment(f.plan, node, operation);
        expect(retired).toEqual(original);
        expect(retired.stage).toBe(`network-${f.plan.planSha256.slice(0, 24)}-node-${node}-${operation}`);
        expect(retired.backendIdentity).toBe(`local:${f.plan.deploymentName}:stage:${retired.stage}`);
        expect(Object.hasOwn(JSON.parse(retired.configuration), 'resource')).toBe(false);
        stages.add(retired.stage as string);
        const mutation = await azureTerraformNetworkPowerDeployment(f.plan, f.before, node, operation, false);
        expect(JSON.parse(mutation.configuration).resource.azapi_resource_action.ce_network.action).toBe(operation);
        expect(mutation.stage).toBe(retired.stage);
      }
    expect(stages.size).toBe(f.plan.topology.nodeCount * 2);
  });
test('retired power binding rejects wrong engine, operation, nodes and unresolved source identifiers', async () => {
  const f = await terraformNetworkSourceFixture(false);
  for (const plan of [
    { ...f.plan, engine: 'native' },
    { ...f.plan, intent: { ...f.plan.intent, operation: 'deploy' } },
    { ...f.plan, planSha256: 'unresolved-runtime' },
  ])
    await expect(azureTerraformNetworkRetiredPowerDeployment(plan as typeof f.plan, 1, 'start')).rejects.toThrow(
      'exact retired network',
    );
  for (const node of [0, 2, -1, 1.5, NaN])
    await expect(azureTerraformNetworkRetiredPowerDeployment(f.plan, node, 'start')).rejects.toThrow(
      'exact retired network',
    );
  await expect(azureTerraformNetworkRetiredPowerDeployment(f.plan, 1, 'foreign' as 'start')).rejects.toThrow(
    'exact retired network',
  );
});
