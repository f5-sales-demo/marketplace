import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { runAzureTerraformAdmission } from '../../src/ce/terraform-workflow';
import { intent, observation } from './fixtures';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

const threeNics: typeof intent.nics = (['slo', 'data', 'sli'] as const).map((role, index) => ({
  name: ['mgmt', 'external', 'internal'][index],
  role,
  subnet: { mode: 'greenfield', name: `nic${index}`, cidr: `10.20.${index}.0/24` },
}));
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

test('applies foundation and admission exactly once and resumes from collected Azure identities', async () => {
  const f = await originalNativeWorkflowFixture();
  try {
    expect((await f.run()).status).toBe('registered');
    const commands = [...f.commands];
    expect((await f.run()).status).toBe('registered');
    expect(f.counts()).toEqual({ applies: 2, revisions: 1, bootstrap: 1, reservations: 1 });
    expect(f.commands.filter((command) => command === 'apply')).toHaveLength(2);
    expect(f.commands.slice(commands.length)).not.toContain('plan');
    const checkpoint = (await f.storage.read('terraform-workflow.json')) as {
      stage: string;
      admissionReceiptSha256ByNode: Record<string, string>;
    };
    expect(checkpoint.stage).toBe('registered');
    expect(Object.keys(checkpoint.admissionReceiptSha256ByNode)).toEqual(['1']);
    expect(JSON.stringify(checkpoint)).toContain('/etc/vpm/user_data');
    expect(await f.storage.read('terraform-registration-configuration.json')).toEqual({ status: 'configured' });
  } finally {
    await f.close();
  }
});

test('resumes interrupted three-node Azure HA admission through durable serial boundaries', async () => {
  const f = await originalNativeWorkflowFixture(true, false, threeNics);
  try {
    const write = f.storage.write.bind(f.storage);
    f.storage.write = async (name, value) => {
      await write(name, value);
      if (
        name === 'terraform-workflow.json' &&
        (value as { launchedAtByNode?: Record<string, string> }).launchedAtByNode?.['1']
      )
        throw Error('applied checkpoint response lost');
    };
    await expect(f.run()).rejects.toThrow('applied checkpoint response lost');
    f.storage.write = write;
    expect((await f.run()).status).toBe('registered');
    expect(f.counts()).toEqual({ applies: 4, revisions: 3, bootstrap: 3, reservations: 2 });
    const checkpoint = (await f.storage.read('terraform-workflow.json')) as {
      launchedAtByNode: Record<string, string>;
      admissionReceiptSha256ByNode: Record<string, string>;
    };
    expect(Object.keys(checkpoint.launchedAtByNode)).toEqual(['1', '2', '3']);
    expect(Object.keys(checkpoint.admissionReceiptSha256ByNode)).toEqual(['1', '2', '3']);
    const commands = [...f.commands];
    expect((await f.run()).status).toBe('registered');
    expect(f.counts().applies).toBe(4);
    expect(f.commands.slice(commands.length)).not.toContain('plan');
  } finally {
    await f.close();
  }
});

test('rejects unavailable Azure bootstrap before opening Terraform or calling Azure', async () => {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(plan);
  const path = await mkdtemp(join(tmpdir(), 'azure-tf-bootstrap-gate-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let opens = 0;
  let cloudCalls = 0;
  await expect(
    runAzureTerraformAdmission(
      plan,
      {
        open: async () => {
          opens++;
          return {} as TerraformSession;
        },
      },
      {
        engine: 'terraform',
        requireBootstrapContract() {
          throw new Error('Verified azure headless bootstrap capability is unavailable');
        },
      } as never,
      storage,
      {
        exec: async () => {
          cloudCalls++;
          return { exitCode: 0, stdout: '{}', stderr: '' };
        },
      },
      async () => {},
      {},
    ),
  ).rejects.toThrow('unavailable');
  expect({ opens, cloudCalls }).toEqual({ opens: 0, cloudCalls: 0 });
});

test('rejects Route Server admission without an expected route before Terraform, Azure, or bootstrap access', async () => {
  const selected = structuredClone(intent);
  selected.engine = 'terraform';
  selected.routing = {
    mode: 'route-server',
    destinationCidrs: [],
    localAsn: 64512,
  };
  const plan = compileAzureCePlan(selected, observation);
  const binding = azureUpgradeBinding(plan);
  const path = await mkdtemp(join(tmpdir(), 'azure-tf-routing-gate-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let opens = 0;
  let cloudCalls = 0;
  let bootstrapChecks = 0;
  await expect(
    runAzureTerraformAdmission(
      plan,
      {
        open: async () => {
          opens++;
          return {} as TerraformSession;
        },
      },
      {
        engine: 'terraform',
        requireBootstrapContract() {
          bootstrapChecks++;
        },
      } as never,
      storage,
      {
        exec: async () => {
          cloudCalls++;
          return { exitCode: 0, stdout: '{}', stderr: '' };
        },
      },
      async () => {},
      {},
    ),
  ).rejects.toThrow(/expected learned prefix/);
  expect({ opens, cloudCalls, bootstrapChecks }).toEqual({
    opens: 0,
    cloudCalls: 0,
    bootstrapChecks: 0,
  });
});

test('accepts platform ingress and traffic before the final refresh no-change plan', async () => {
  const f = await originalNativeWorkflowFixture(false, true, threeNics, undefined, false, '10.20.2.10');
  try {
    const events: string[] = [];
    const result = await f.run(async (session) => {
      expect(session).toBe(f.runner);
      events.push('ingress-traffic');
      const plan = f.runner.plan.bind(f.runner);
      f.runner.plan = async (...args) => {
        events.push('final-plan');
        return plan(...args);
      };
      return { ingress: { synthetic: true }, traffic: { status: 'healthy' } };
    });
    expect(result).toMatchObject({ status: 'accepted', traffic: { status: 'healthy' }, terraformNoChanges: true });
    expect(events).toEqual(['ingress-traffic', 'final-plan']);
    expect(f.counts().applies).toBe(2);
  } finally {
    await f.close();
  }
});

test('rejects a saved Terraform workflow missing launch boundaries without reconstructing them', async () => {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const root = await mkdtemp(join(tmpdir(), 'azure-no-workflow-migration-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureUpgradeBinding(plan).owner);
  await storage.write('terraform-workflow.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: 'a'.repeat(64),
    bootstrapByNode: {},
    stage: 'network-pending',
  });
  let opened = 0,
    bootstraps = 0;
  const terraform = {
    open: async () => {
      opened++;
      throw Error('unexpected Terraform open');
    },
  } as unknown as CeTerraformService;
  const runtime = {
    engine: 'terraform',
    requireBootstrapContract() {},
    requireRoutingContract() {},
    bootstrap: async () => {
      bootstraps++;
      throw Error('unexpected bootstrap');
    },
  } as unknown as CeRuntime;
  const api = {
    exec: async () => {
      throw Error('unexpected cloud call');
    },
  } as AzExecApi;
  await expect(runAzureTerraformAdmission(plan, terraform, runtime, storage, api, async () => {}, {})).rejects.toThrow(
    /checkpoint differs/,
  );
  expect(opened).toBe(0);
  expect(bootstraps).toBe(0);
  expect(((await storage.read('terraform-workflow.json')) as Record<string, unknown>).launchedAtByNode).toBeUndefined();
});
