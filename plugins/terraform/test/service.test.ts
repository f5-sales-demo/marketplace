import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';
import type { CeOwner } from '../../platform/src/ce/runtime';
import { type CePlatformService, registerCePlatformService } from '../../platform/src/ce/service';
import factory from '../src/index';
import type { Deployment, Executor, Invocation, PlanReceipt } from '../src/runner';
import { type CeTerraformService, createCeTerraformService, TERRAFORM_SERVICE_CHANNEL } from '../src/service';

const directories: string[] = [];
afterEach(async () => {
  for (const root of directories.splice(0)) await rm(root, { recursive: true, force: true });
});
const owner: CeOwner = {
  deploymentId: 'ce-tf',
  engine: 'terraform',
  provider: 'aws',
  account: '123456789012',
  region: 'us-east-1',
};
const deployment: Deployment = {
  schemaVersion: 1,
  deploymentId: owner.deploymentId,
  engine: 'terraform',
  scope: { cloud: 'aws', account: owner.account, region: owner.region },
  terraformVersion: '1.16.1',
  configuration: '{"terraform":{"required_version":"= 1.16.1"}}',
  providerLock: '# no external providers',
  backendIdentity: 'local:ce-tf',
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-service-'));
  directories.push(root);
  const platform = { storage: (identity: CeOwner) => CeDeploymentStore.open(root, identity) } as CePlatformService;
  return { root, platform, service: createCeTerraformService(async () => platform) };
}

test('shared service selects its executor once and preserves isolated invocation settings', async () => {
  const { platform } = await fixture();
  const calls: Invocation[] = [];
  const failure = new Error('reviewed executor unavailable');
  const options = {
    execute: async (request: Invocation) => {
      calls.push(request);
      throw failure;
    },
  };
  const service = createCeTerraformService(async () => platform, options);
  options.execute = async () => {
    throw new Error('substituted executor');
  };
  const session = await service.open(owner, deployment, false);
  const controller = new AbortController();
  await expect(session.plan({ TF_CLI_ARGS: '-lock=false', AWS_PROFILE: 'fixture' }, controller.signal)).rejects.toBe(
    failure,
  );
  const store = await platform.storage(owner);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    cwd: join(store.directory, owner.deploymentId),
    args: ['version', '-json'],
    signal: controller.signal,
    env: {
      AWS_PROFILE: 'fixture',
      TF_CLI_CONFIG_FILE: join(store.directory, owner.deploymentId, 'deployment.tfrc'),
      TF_INPUT: '0',
    },
  });
  expect(calls[0].env.TF_CLI_ARGS).toBeUndefined();
  const resumed = await service.open(owner, deployment, true);
  await expect(resumed.plan({})).rejects.toBe(failure);
  expect(calls).toHaveLength(2);
});

test('executor selection cannot bypass engine, deployment, cloud, account or region admission', async () => {
  const { platform } = await fixture();
  let storageCalls = 0;
  let executionCalls = 0;
  const service = createCeTerraformService(
    async () => ({
      ...platform,
      storage: async (identity: CeOwner) => {
        storageCalls++;
        return platform.storage(identity);
      },
    }),
    {
      execute: async () => {
        executionCalls++;
        throw new Error('must not execute');
      },
    },
  );
  for (const changed of [
    { ...owner, engine: 'native' as const },
    { ...owner, deploymentId: 'foreign' },
    { ...owner, provider: 'gcp' as const },
    { ...owner, account: '000000000000' },
    { ...owner, region: 'foreign' },
  ])
    await expect(service.open(changed, deployment, false)).rejects.toThrow('ownership differ');
  await expect(service.open(owner, { ...deployment, engine: 'native' } as never, false)).rejects.toThrow(
    'ownership differ',
  );
  expect(storageCalls).toBe(0);
  expect(executionCalls).toBe(0);
});

test('custom executor still rechecks durable ownership on every session operation', async () => {
  const { platform } = await fixture();
  let executionCalls = 0;
  const service = createCeTerraformService(async () => platform, {
    execute: async () => {
      executionCalls++;
      throw new Error('must not execute');
    },
  });
  const session = await service.open(owner, deployment, false);
  const store = await platform.storage(owner);
  await writeFile(
    join(store.directory, 'owner.json'),
    JSON.stringify({ schemaVersion: 2, owner: { ...owner, account: '000000000000' } }),
  );
  await expect(session.plan({})).rejects.toThrow();
  await expect(session.planDestroy({})).rejects.toThrow();
  await expect(session.apply({} as PlanReceipt, {})).rejects.toThrow();
  await expect(session.readOutputs([], {})).rejects.toThrow();
  await expect(session.readApplyCheckpoint?.({} as PlanReceipt)).rejects.toThrow();
  expect(executionCalls).toBe(0);
});

test('interrupted custom execution retains its claim and consumed apply across two resumes', async () => {
  const { platform } = await fixture();
  const calls: Invocation[] = [];
  let release: (() => Promise<void>) | undefined;
  let claimPath = '';
  const execute: Executor = async (request) => {
    calls.push(request);
    if (request.args[0] === 'plan')
      await writeFile(join(request.cwd, 'saved.tfplan'), 'reviewed-binary-fixture', { mode: 0o600 });
    if (request.args[0] === 'apply') {
      claimPath = join(request.cwd, '.terraform-executor-lock', 'claim.json');
      release = await acquireProcessLock(join(request.cwd, '.terraform-executor-lock'));
      throw new Error('executor outcome unresolved');
    }
    return {
      code: 0,
      stdout: JSON.stringify(
        request.args[0] === 'version'
          ? { terraform_version: deployment.terraformVersion }
          : request.args[0] === 'show'
            ? {
                format_version: '1.2',
                terraform_version: deployment.terraformVersion,
                errored: false,
                complete: true,
                applyable: true,
                resource_changes: [
                  {
                    address: 'terraform_data.ce',
                    mode: 'managed',
                    type: 'terraform_data',
                    change: { actions: ['create'] },
                  },
                ],
              }
            : {},
      ),
    };
  };
  const service = createCeTerraformService(async () => platform, { execute });
  const session = await service.open(owner, deployment, false);
  const receipt = await session.plan({});
  try {
    await expect(session.apply(receipt, {})).rejects.toThrow('outcome unresolved');
    const originalClaim = await readFile(claimPath, 'utf8');
    const submittedCalls = calls.length;
    for (let n = 0; n < 2; n++) {
      await expect(service.open(owner, deployment, true)).rejects.toThrow('live process');
      await expect(session.plan({})).rejects.toThrow('live process');
      await expect(session.apply(receipt, {})).rejects.toThrow('live process');
      expect(await readFile(claimPath, 'utf8')).toBe(originalClaim);
    }
    expect(calls).toHaveLength(submittedCalls);
  } finally {
    await release?.();
  }
  const resumed = await service.open(owner, deployment, true);
  await expect(resumed.apply(receipt, {})).rejects.toThrow('consumed');
  expect(await resumed.readApplyCheckpoint?.(receipt)).toMatchObject({ state: 'applying' });
  expect(calls.filter((call) => call.args[0] === 'apply')).toHaveLength(1);
});
test('Terraform refuses native ownership and mismatched resume configuration', async () => {
  const { platform, service } = await fixture();
  await platform.storage({ ...owner, engine: 'native' });
  await expect(service.open(owner, deployment, false)).rejects.toThrow('engine');
  const other = await fixture();
  await expect(other.service.open({ ...owner, account: '000000000000' }, deployment, false)).rejects.toThrow(
    'ownership differ',
  );
  await other.service.open(owner, deployment, false);
  await expect(
    other.service.open(owner, { ...deployment, providerLock: '# changed provider lock' }, true),
  ).rejects.toThrow('differs');
  await other.service.open(owner, deployment, true);
});
test('Terraform revalidates durable ownership before execution', async () => {
  const { platform, service } = await fixture();
  const session = await service.open(owner, deployment, false);
  const store = await platform.storage(owner);
  await writeFile(
    join(store.directory, 'owner.json'),
    JSON.stringify({ schemaVersion: 2, owner: { ...owner, engine: 'native' } }),
    { mode: 0o600 },
  );
  await expect(session.plan({})).rejects.toThrow();
  await expect(
    session.readAppliedResourceFields?.({} as PlanReceipt, { 'terraform_data.ce': ['id'] }, {}),
  ).rejects.toThrow();
  await expect(session.readApplyCheckpoint?.({} as PlanReceipt)).rejects.toThrow();
  await expect(
    session.readApplyAttemptResourceFields?.({} as PlanReceipt, { 'terraform_data.ce': ['id'] }, {}),
  ).rejects.toThrow();
  await expect(session.readConfiguration('0'.repeat(64))).rejects.toThrow();
  await expect(
    session.readPlannedResourceFields({} as PlanReceipt, { 'terraform_data.ce': ['id'] }, {}),
  ).rejects.toThrow();
});
test('installed Terraform extension registers an executable service through the supported bus', async () => {
  const { platform } = await fixture();
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  const bus = {
    on(channel: string, handler: (data: unknown) => void) {
      const list = handlers.get(channel) ?? new Set();
      list.add(handler);
      handlers.set(channel, list);
      return () => {
        list.delete(handler);
      };
    },
    emit(channel: string, data: unknown) {
      for (const handler of handlers.get(channel) ?? []) handler(data);
    },
  };
  registerCePlatformService(bus, platform);
  factory({ events: bus, setLabel: () => {} });
  const service = await new Promise<CeTerraformService>((resolve) =>
    bus.emit(TERRAFORM_SERVICE_CHANNEL, { version: 1, resolve }),
  );
  await service.open(owner, deployment, false);
  await service.open(owner, deployment, true);
});

test('current resume retains private stage configuration while enforcing provider and owner identity', async () => {
  const { service } = await fixture();
  const session = await service.open(owner, deployment, false);
  const { createHash } = await import('node:crypto');
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const next = JSON.stringify({
    terraform: { required_version: '= 1.16.1' },
    resource: { terraform_data: { ce: { input: 'private-bootstrap-fixture' } } },
  });
  await session.reviseConfiguration(hash(deployment.configuration), next);
  await expect(service.open(owner, deployment, true)).rejects.toThrow('differs');
  await service.open(owner, deployment, 'current');
  await expect(service.open(owner, { ...deployment, providerLock: '# foreign lock' }, 'current')).rejects.toThrow(
    'differs',
  );
  await expect(
    service.open(
      owner,
      {
        ...deployment,
        configuration: JSON.stringify({
          terraform: { required_version: '= 1.16.1' },
          provider: { aws: { region: 'foreign' } },
        }),
      },
      'current',
    ),
  ).rejects.toThrow('identity');
});

test('isolates lifecycle stage workspaces while retaining deployment and engine ownership', async () => {
  const { service } = await fixture();
  await service.open(owner, deployment, false);
  const staged = {
    ...deployment,
    stage: 'upgrade-site-one',
    backendIdentity: `local:${owner.deploymentId}:stage:upgrade-site-one`,
  };
  await service.open(owner, staged, false);
  await service.open(owner, staged, true);
  await service.open(owner, deployment, true);
  await expect(service.open(owner, { ...staged, stage: '../foreign' }, false)).rejects.toThrow();
  await expect(service.open(owner, { ...staged, backendIdentity: deployment.backendIdentity }, true)).rejects.toThrow();
});
