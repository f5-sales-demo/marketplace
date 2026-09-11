import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { Deployment, PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { azureFailoverOwner, buildAzureCeFailoverPlan } from '../../src/ce/failover';
import { compileAzureCePlan } from '../../src/ce/planner';
import {
  azureTerraformFailoverDeployment,
  createAzureTerraformFailoverController,
} from '../../src/ce/terraform-failover';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function failoverFixture() {
  const sourceVmResourceId =
    `/subscriptions/${intent.subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
  const selected = structuredClone(intent);
  selected.engine = 'terraform';
  selected.topology.ha = true;
  selected.routing = { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 64512 };
  selected.nics = ['slo', 'data', 'sli'].map((role, index) => ({
    name: ['mgmt', 'external', 'internal'][index],
    role: role as 'slo' | 'data' | 'sli',
    subnet: { mode: 'greenfield', name: `nic${index}`, cidr: `10.20.${index}.0/24` },
  }));
  selected.ingress = {
    mode: 'platform-http',
    port: 8080,
    listener: {
      name: 'ce-listener',
      namespace: 'system',
      domain: 'ce.example.invalid',
      privateAddress: '10.20.2.10',
      originPool: { name: 'ce-origin', namespace: 'system' },
    },
    probe: { sourceVmResourceId, path: '/healthz', expectedStatus: 200, expectedBodySha256: '4'.repeat(64) },
  };
  selected.brownfield.resourceIds = [sourceVmResourceId];
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 24;
  observed.resources = [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }];
  const plan = compileAzureCePlan(selected, observed);
  const vmResourceId = plan.actions.find((action) => action.kind === 'vm-create' && action.node === 1)?.resourceId;
  if (!vmResourceId) throw new Error('missing failover VM');
  const failover = buildAzureCeFailoverPlan(plan, {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: plan.subscription.id,
    region: plan.region,
    engine: 'terraform',
    deploymentId: plan.deploymentName,
    sourcePlanSha256: plan.planSha256,
    nodeIndex: 1,
    vmResourceId,
    vmId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    powerState: 'running',
    observedAt: '2026-09-10T12:00:00Z',
  });
  return { plan, failover };
}

test('renders only the selected Azure VM power action and an empty release configuration', async () => {
  const f = failoverFixture();
  const stop = await azureTerraformFailoverDeployment(f.plan, f.failover, 'stop');
  const start = await azureTerraformFailoverDeployment(f.plan, f.failover, 'start');
  const release = await azureTerraformFailoverDeployment(f.plan, f.failover, 'release');
  expect(JSON.parse(stop.configuration).resource.azapi_resource_action.ce_failover).toMatchObject({
    resource_id: f.failover.vmResourceId,
    action: 'deallocate',
    method: 'POST',
    when: 'apply',
  });
  expect(JSON.parse(start.configuration).resource.azapi_resource_action.ce_failover.action).toBe('start');
  expect(JSON.parse(release.configuration).resource).toEqual({});
  expect(new Set([stop.backendIdentity, start.backendIdentity, release.backendIdentity]).size).toBe(1);
});

test('saves exact stop/start plans, releases the temporary control and finishes no-change', async () => {
  const f = failoverFixture();
  const root = await mkdtemp(join(tmpdir(), 'azure-tf-failover-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureFailoverOwner(f.plan));
  const deployments = {
    stop: await azureTerraformFailoverDeployment(f.plan, f.failover, 'stop'),
    start: await azureTerraformFailoverDeployment(f.plan, f.failover, 'start'),
    release: await azureTerraformFailoverDeployment(f.plan, f.failover, 'release'),
  };
  let configuration = deployments.stop.configuration;
  let applied: 'none' | 'stop' | 'start' | 'release' = 'none';
  const calls: string[] = [];
  const session = {
    async readConfigurationSha256() {
      return digest(configuration);
    },
    async reviseConfiguration(expected: string, next: string) {
      expect(digest(configuration)).toBe(expected);
      configuration = next;
      return digest(next);
    },
    async plan() {
      const parsed = JSON.parse(configuration);
      const action = parsed.resource.azapi_resource_action?.ce_failover?.action as 'deallocate' | 'start' | undefined;
      const phase = action === 'deallocate' ? 'stop' : action === 'start' ? 'start' : 'release';
      const changes =
        phase === 'release'
          ? applied === 'release'
            ? []
            : [{ address: 'azapi_resource_action.ce_failover', type: 'azapi_resource_action', actions: ['delete'] }]
          : [
              {
                address: 'azapi_resource_action.ce_failover',
                type: 'azapi_resource_action',
                actions: [applied === 'none' ? 'create' : 'update'],
              },
            ];
      return {
        schemaVersion: 1,
        deploymentId: f.plan.deploymentName,
        engine: 'terraform',
        backendIdentity: deployments.stop.backendIdentity,
        configurationSha256: digest(configuration),
        providerLockSha256: digest(deployments.stop.providerLock),
        planSha256: digest(`${phase}-${applied}`),
        noChanges: changes.length === 0,
        changes,
      } as PlanReceipt;
    },
    async apply(receipt: PlanReceipt) {
      const action = JSON.parse(configuration).resource.azapi_resource_action?.ce_failover?.action;
      applied = action === 'deallocate' ? 'stop' : action === 'start' ? 'start' : 'release';
      calls.push(applied);
      expect(receipt.configurationSha256).toBe(digest(configuration));
    },
  } as unknown as TerraformSession;
  const terraform = { open: async (_owner: unknown, _deployment: Deployment) => session } as CeTerraformService;
  const controller = await createAzureTerraformFailoverController(
    f.plan,
    f.failover,
    terraform,
    storage,
    async () => applied,
    {},
  );
  await controller.mutate('stop');
  await controller.mutate('start');
  await controller.release();
  expect(calls).toEqual(['stop', 'start', 'release']);
  expect((await storage.read(`${f.failover.planId}-stop-plan.json`)) as PlanReceipt).toMatchObject({
    changes: [{ actions: ['create'] }],
  });
  expect((await storage.read(`${f.failover.planId}-start-plan.json`)) as PlanReceipt).toMatchObject({
    changes: [{ actions: ['update'] }],
  });
  expect((await storage.read(`${f.failover.planId}-final-plan.json`)) as PlanReceipt).toMatchObject({
    noChanges: true,
    changes: [],
  });
});
