import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { type Invocation, type PlanReceipt, TerraformRunner } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { azureTerraformNetworkPowerDeployment } from '../../src/ce/terraform-network-power';
import { runAzureTerraformNetworkPowerStage } from '../../src/ce/terraform-network-power-execution';
import { AzureTerraformPowerLifecycleInterrupted } from '../../src/ce/terraform-network-power-lifecycle';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { networkUpdateFixture } from './network-update-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true });
});
const address = 'azapi_resource_action.ce_network';
async function executionFixture(operation: 'deallocate' | 'start' = 'deallocate') {
  const f = networkUpdateFixture(true, 'terraform', true, false);
  const before = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const deployment = await azureTerraformNetworkPowerDeployment(f.plan, before, 2, operation);
  const control = JSON.parse(deployment.configuration).resource.azapi_resource_action.ce_network;
  const root = await mkdtemp(join(tmpdir(), 'azure-tf-network-power-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, azureUpgradeBinding(f.plan).owner);
  const state = {
    power: operation === 'start' ? 'VM deallocated' : 'VM running',
    configuration: deployment.configuration,
    control: null as Record<string, unknown> | null,
    opened: false,
    wrongProjection: false,
    wrongConfiguration: false,
    loss: '' as string,
    nonconverging: false,
    cloudUnavailable: false,
    foreignUuid: false,
  };
  const status = new Map<string, 'planned' | 'applying' | 'applied'>();
  const projections = new Map<string, { before: unknown; after: unknown }>();
  const calls: string[] = [];
  let counter = 0;
  let latest: PlanReceipt | undefined;
  const receipts = new Map<string, PlanReceipt>();
  const manifestHash = () => {
    const { configuration, providerLock, ...identity } = deployment;
    return canonicalSha256({
      ...identity,
      configurationSha256: f.hash(state.configuration),
      providerLockSha256: f.hash(providerLock),
    });
  };
  const requireCurrent = (receipt: PlanReceipt, planned = false) => {
    if (latest?.planSha256 !== receipt.planSha256 || receipt.configurationSha256 !== f.hash(state.configuration))
      throw Error('exact current runner journal required');
    if (planned && status.get(receipt.planSha256) !== 'planned') throw Error('planned-only runner projection');
  };
  const session = {
    async readConfigurationSha256() {
      return f.hash(state.wrongConfiguration ? '{}' : state.configuration);
    },
    async readCurrentPlanJournal(expected: string) {
      expect(expected).toBe(f.hash(state.configuration));
      const receipt = latest?.configurationSha256 === expected ? latest : undefined;
      return {
        schemaVersion: 1,
        scope: 'current-saved-plan-byte-and-journal-binding',
        state: receipt ? status.get(receipt.planSha256) : 'absent',
        receipt: structuredClone(receipt),
        manifestSha256: manifestHash(),
        ...(receipt ? { ordinaryRefreshEnabled: true, executionSha256: 'a'.repeat(64) } : {}),
        journalSha256: receipt ? f.hash(JSON.stringify(receipt)) : null,
        savedPlanSha256: receipt?.planSha256 ?? null,
        planSemanticsQualified: false,
      };
    },
    async readPlanApplicationHistory(receipt: PlanReceipt) {
      const original = receipts.get(receipt.planSha256);
      if (!original || canonicalSha256(original) !== canonicalSha256(receipt))
        throw Error('fixture original receipt differs');
      return {
        schemaVersion: 1,
        scope: 'exact-saved-plan-journal-history',
        receiptSha256: canonicalSha256(receipt),
        incompleteArchives: 0,
        applicationOutcomeQualified: false,
        retirementQualified: false,
        matches: [
          {
            location: latest?.planSha256 === receipt.planSha256 ? 'current' : 'plan-history',
            journalSha256: f.hash(JSON.stringify(receipt)),
            savedPlanSha256: receipt.planSha256,
            manifestSha256: manifestHash(),
            state: status.get(receipt.planSha256),
          },
        ],
      };
    },
    async reviseConfiguration(expected: string, next: string) {
      expect(expected).toBe(f.hash(state.configuration));
      state.configuration = next;
      calls.push('revision');
      return f.hash(next);
    },
    async plan() {
      const desired = JSON.parse(state.configuration).resource?.azapi_resource_action?.ce_network ?? null;
      const effect = desired ? (state.control ? 'no-op' : 'create') : state.control ? 'delete' : undefined;
      const receipt: PlanReceipt = {
        schemaVersion: 1,
        deploymentId: deployment.deploymentId,
        engine: 'terraform',
        backendIdentity: deployment.backendIdentity,
        configurationSha256: f.hash(state.configuration),
        providerLockSha256: f.hash(deployment.providerLock),
        planSha256: f.hash(String(++counter)),
        noChanges: !effect || effect === 'no-op',
        changes: effect ? [{ address, type: 'azapi_resource_action', actions: [effect] }] : [],
      };
      projections.set(receipt.planSha256, { before: structuredClone(state.control), after: desired });
      status.set(receipt.planSha256, 'planned');
      latest = receipt;
      receipts.set(receipt.planSha256, structuredClone(receipt));
      calls.push('plan');
      return receipt;
    },
    async readPlannedResourceFields(receipt: PlanReceipt) {
      requireCurrent(receipt, true);
      return { [address]: projections.get(receipt.planSha256)?.before ?? null };
    },
    async readProposedResourceFields(receipt: PlanReceipt) {
      requireCurrent(receipt, true);
      const value = projections.get(receipt.planSha256)?.after ?? null;
      return {
        [address]:
          state.wrongProjection && value ? { ...(value as object), resource_id: before.nodes['1'].resourceId } : value,
      };
    },
    async readAppliedResourceFields(receipt: PlanReceipt) {
      requireCurrent(receipt);
      if (status.get(receipt.planSha256) === 'planned' && !receipt.noChanges)
        throw Error('submitted runner state required');
      return { [address]: state.control };
    },
    async readPlanApplicationState(receipt: PlanReceipt) {
      requireCurrent(receipt);
      return status.get(receipt.planSha256) ?? 'planned';
    },
    async apply(receipt: PlanReceipt) {
      expect(status.get(receipt.planSha256)).toBe('planned');
      status.set(receipt.planSha256, 'applying');
      const desired = projections.get(receipt.planSha256)?.after as Record<string, unknown> | null;
      const phase = desired ? 'mutation' : 'release';
      calls.push(`apply-${phase}`);
      if (state.loss === `${phase}-before`) {
        state.loss = '';
        throw Error('synthetic lost request before effect');
      }
      state.control = structuredClone(desired);
      if (desired && !state.nonconverging) state.power = operation === 'start' ? 'VM running' : 'VM deallocated';
      if (state.loss === `${phase}-after`) {
        state.loss = '';
        throw Error('synthetic response loss after effect');
      }
      status.set(receipt.planSha256, 'applied');
    },
    async reconcileApplyFromEvidence(receipt: PlanReceipt, evidence: string) {
      expect(status.get(receipt.planSha256)).toBe('applying');
      expect(evidence).toMatch(/^[a-f0-9]{64}$/);
      status.set(receipt.planSha256, 'applied');
      calls.push('reconcile');
    },
  } as unknown as TerraformSession;
  const terraform: CeTerraformService = {
    async open(owner, selected, resume) {
      expect(owner).toEqual(store.owner);
      expect(selected).toEqual(deployment);
      if (state.opened && !resume) throw Object.assign(Error('exists'), { code: 'EEXIST' });
      state.opened = true;
      return session;
    },
  };
  const api = {
    async exec(command: string, args: string[], options?: Parameters<typeof f.api.exec>[2]) {
      if (state.cloudUnavailable) return { exitCode: 1, stderr: '', stdout: '' };
      if (args[0] === 'vm' && args[1] === 'show')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            ...f.vms[1],
            vmId: state.foreignUuid ? f.vms[0].vmId : f.vms[1].vmId,
            powerState: state.power,
          }),
        };
      return f.api.exec(command, args, options);
    },
  };
  const run = (signal?: AbortSignal) =>
    runAzureTerraformNetworkPowerStage(f.plan, before, 2, operation, [], terraform, store, api, {}, signal, {
      attempts: 2,
      intervalMs: 0,
      wait: async () => {},
    });
  return { ...f, before, deployment, control, store, state, calls, status, session, run };
}

for (const operation of ['deallocate', 'start'] as const)
  test(`owning Terraform ${operation} network power stage applies exact plans and releases action state`, async () => {
    const f = await executionFixture(operation);
    const result = await f.run();
    expect(result.status).toBe('power-stage-complete');
    expect(result.vmId).toBe(f.before.nodes['2'].vmId);
    expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
    expect(f.state.control).toBeNull();
    expect(JSON.parse(f.state.configuration).resource).toBeUndefined();
    expect(f.mutations()).toBe(0);
    await f.run();
    expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
  });

for (const phase of ['mutation', 'release'] as const)
  test(`owning Terraform network power reconciles lost ${phase} response without another apply`, async () => {
    const f = await executionFixture();
    f.state.loss = `${phase}-after`;
    await f.run();
    expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
    expect(f.calls).toContain('reconcile');
    expect(f.state.control).toBeNull();
  });

for (const mode of ['foreign-uuid', 'foreign-projection', 'foreign-configuration', 'unavailable-cloud'] as const)
  test(`owning Terraform network power rejects ${mode} before applying`, async () => {
    const f = await executionFixture();
    if (mode === 'foreign-uuid') f.state.foreignUuid = true;
    if (mode === 'foreign-projection') f.state.wrongProjection = true;
    if (mode === 'foreign-configuration') f.state.wrongConfiguration = true;
    if (mode === 'unavailable-cloud') f.state.cloudUnavailable = true;
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.some((c) => c.startsWith('apply'))).toBe(false);
  });

test('owning Terraform network power preserves unresolved applying state and never replays a stalled mutation', async () => {
  const f = await executionFixture();
  f.state.loss = 'mutation-before';
  await expect(f.run()).rejects.toThrow();
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation']);
  expect(JSON.parse(f.state.configuration).resource.azapi_resource_action.ce_network).toEqual(f.control);
});

test('owning Terraform network power does not accept successful apply without observed convergence', async () => {
  const f = await executionFixture();
  f.state.nonconverging = true;
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation']);
  expect(f.state.control).toEqual(f.control);
});

test('owning Terraform network power resumes after a lost cloud-outcome checkpoint without replay', async () => {
  const f = await executionFixture();
  const write = f.store.write.bind(f.store);
  let loss = true;
  f.store.write = async (name, value) => {
    if (loss && name.endsWith('-mutation-outcome.json')) {
      loss = false;
      throw Error('synthetic outcome checkpoint loss');
    }
    return write(name, value);
  };
  await expect(f.run()).rejects.toThrow();
  await f.run();
  expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
});

for (const boundary of [
  'mutation-plan',
  'mutation-binding',
  'mutation-complete',
  'release-plan',
  'release-binding',
  'release-outcome',
  'release-complete',
  'final-plan',
  'current-no-change-plan',
] as const)
  test(`owning Terraform network power resumes lost ${boundary} publication without duplicate apply`, async () => {
    const f = await executionFixture();
    const write = f.store.write.bind(f.store);
    let loss = true;
    f.store.write = async (name, value) => {
      if (loss && name.endsWith(`-${boundary}.json`)) {
        loss = false;
        throw Error('synthetic publication loss');
      }
      return write(name, value);
    };
    await expect(f.run()).rejects.toThrow();
    await f.run();
    expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
    expect(f.state.control).toBeNull();
  });

test('owning Terraform network power resumes a completed configuration revision whose response was lost', async () => {
  const f = await executionFixture();
  const revise = f.session.reviseConfiguration.bind(f.session);
  let loss = true;
  f.session.reviseConfiguration = async (expected, next) => {
    const result = await revise(expected, next);
    if (loss) {
      loss = false;
      throw Error('synthetic lost CAS response');
    }
    return result;
  };
  await expect(f.run()).rejects.toThrow();
  await f.run();
  expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
});

for (const mode of [
  'missing-mutation-binding',
  'foreign-binding-receipt',
  'foreign-binding-target',
  'missing-mutation-complete',
  'foreign-completion-uuid',
  'foreign-release-state',
  'foreign-final-plan',
] as const)
  test(`owning Terraform network power rejects ${mode} saved history before another apply`, async () => {
    const f = await executionFixture();
    await f.run();
    const read = f.store.read.bind(f.store);
    f.store.read = async (name) => {
      if (
        (mode === 'missing-mutation-binding' && name.endsWith('-mutation-binding.json')) ||
        (mode === 'missing-mutation-complete' && name.endsWith('-mutation-complete.json'))
      )
        throw Object.assign(Error('missing'), { code: 'ENOENT' });
      const value = (await read(name)) as Record<string, unknown>;
      if (mode === 'foreign-binding-receipt' && name.endsWith('-mutation-binding.json'))
        value.receiptSha256 = 'f'.repeat(64);
      if (mode === 'foreign-binding-target' && name.endsWith('-mutation-binding.json'))
        ((value.proposed as Record<string, unknown>)[address] as Record<string, unknown>).resource_id =
          f.before.nodes['1'].resourceId;
      if (mode === 'foreign-completion-uuid' && name.endsWith('-mutation-complete.json'))
        (value.outcome as Record<string, unknown>).vmId = f.before.nodes['1'].vmId;
      if (mode === 'foreign-release-state' && name.endsWith('-release-complete.json'))
        (value.outcome as Record<string, unknown>).state = { [address]: f.control };
      if (mode === 'foreign-final-plan' && name.endsWith('-final-plan.json'))
        value.configurationSha256 = 'f'.repeat(64);
      return value;
    };
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
  });

test('owning Terraform network power checks UUID again after planning before the first apply', async () => {
  const f = await executionFixture();
  const plan = f.session.plan.bind(f.session);
  f.session.plan = async (...args) => {
    const result = await plan(...args);
    f.state.foreignUuid = true;
    return result;
  };
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.some((c) => c.startsWith('apply'))).toBe(false);
});

test('owning Terraform network power keeps a stalled control release unresolved without replay', async () => {
  const f = await executionFixture();
  f.state.loss = 'release-before';
  await expect(f.run()).rejects.toThrow();
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
  expect(f.state.control).toEqual(f.control);
});

test('owning Terraform network power rejects unavailable action-state absence after release', async () => {
  const f = await executionFixture();
  f.session.readAppliedResourceFields = async () => ({ [address]: f.control });
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
});

test('owning Terraform network power storage verification failure cannot reach a plan or apply', async () => {
  const f = await executionFixture();
  f.store.verify = async () => {
    throw Error('synthetic owner authorization failure');
  };
  await expect(f.run()).rejects.toThrow();
  expect(f.calls).toEqual([]);
});

test('owning Terraform network power rejects a UUID change after applying before releasing action state', async () => {
  const f = await executionFixture();
  const apply = f.session.apply.bind(f.session);
  f.session.apply = async (...args) => {
    await apply(...args);
    f.state.foreignUuid = true;
  };
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.filter((c) => c.startsWith('apply'))).toEqual(['apply-mutation']);
});

for (const phase of ['mutation', 'release'] as const)
  test(`lost ${phase} plan publication recovers the exact saved receipt without replanning`, async () => {
    const f = await executionFixture();
    const write = f.store.write.bind(f.store);
    let missing: PlanReceipt | undefined;
    f.store.write = async (name, value) => {
      if (!missing && name.endsWith(`-${phase}-plan.json`)) {
        missing = structuredClone(value) as PlanReceipt;
        throw Error('synthetic plan packet publication loss');
      }
      return write(name, value);
    };
    await expect(f.run()).rejects.toThrow('publication loss');
    const plans = f.calls.filter((call) => call === 'plan').length;
    await f.run();
    const recovered = await f.store.read(`${f.plan.planId}-terraform-network-node-2-deallocate-${phase}-plan.json`);
    expect(recovered).toEqual(missing);
    expect(f.calls.filter((call) => call === 'plan').length).toBe(plans + (phase === 'mutation' ? 2 : 1));
    expect(f.calls.filter((call) => call.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
  });
for (const state of ['applying', 'applied'] as const)
  test(`unpublished ${state} mutation journal rejects before replacing or replaying it`, async () => {
    const f = await executionFixture();
    const receipt = await f.session.plan({});
    f.status.set(receipt.planSha256, state);
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow('unpublished submitted');
    expect(f.calls).toEqual(calls);
    expect(f.status.get(receipt.planSha256)).toBe(state);
  });
for (const mode of ['foreign', 'malformed-absent', 'missing', 'service-error'] as const)
  test(`unpublished journal ${mode} rejects before another plan or apply`, async () => {
    const f = await executionFixture();
    const reader = f.session.readCurrentPlanJournal;
    if (mode === 'missing') f.session.readCurrentPlanJournal = undefined;
    else
      f.session.readCurrentPlanJournal = async (...args) => {
        if (mode === 'service-error') throw Error('synthetic journal unavailable');
        if (!reader) throw Error('fixture journal method missing');
        const row = await reader(...args);
        if (mode === 'malformed-absent') return { ...row, savedPlanSha256: 'a'.repeat(64) };
        return { ...row, scope: 'foreign' } as unknown as typeof row;
      };
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });

async function actualRunnerFixture(operation: 'deallocate' | 'start') {
  const f = await executionFixture(operation),
    commands: string[][] = [];
  const root = await mkdtemp(join(tmpdir(), 'azure-power-actual-runner-'));
  roots.push(root);
  let currentControl: Record<string, unknown> | null = null,
    rawPlan: Record<string, unknown> = {},
    count = 0;
  const executor = async (request: Invocation) => {
    commands.push([...request.args]);
    let stdout = '{}';
    if (request.args[0] === 'version') stdout = JSON.stringify({ terraform_version: f.deployment.terraformVersion });
    if (request.args[0] === 'plan') {
      const source = JSON.parse((await readFile(join(request.cwd, 'main.tf.json'))).toString());
      const proposed = source.resource?.azapi_resource_action?.ce_network ?? null;
      const effect = proposed ? (currentControl ? 'no-op' : 'create') : currentControl ? 'delete' : undefined;
      rawPlan = {
        format_version: '1.2',
        terraform_version: f.deployment.terraformVersion,
        errored: false,
        complete: true,
        applyable: true, // codespell:ignore applyable (exact Terraform JSON field)
        resource_changes: effect
          ? [
              {
                address,
                type: 'azapi_resource_action',
                mode: 'managed',
                provider_name: 'registry.terraform.io/azure/azapi',
                change: {
                  actions: [effect],
                  before: structuredClone(currentControl),
                  after: structuredClone(proposed),
                  before_sensitive: false,
                  after_sensitive: false,
                  after_unknown: false,
                },
              },
            ]
          : [],
        output_changes: {},
      };
      await writeFile(join(request.cwd, 'saved.tfplan'), `synthetic-saved-plan-${++count}`, { mode: 0o600 });
    }
    if (request.args[0] === 'show') {
      stdout = request.args.includes('saved.tfplan')
        ? JSON.stringify(rawPlan)
        : JSON.stringify({
            format_version: '1.0',
            terraform_version: f.deployment.terraformVersion,
            values: {
              root_module: {
                resources: currentControl
                  ? [
                      {
                        address,
                        type: 'azapi_resource_action',
                        name: 'ce_network',
                        mode: 'managed',
                        provider_name: 'registry.terraform.io/azure/azapi',
                        values: currentControl,
                        sensitive_values: false,
                      },
                    ]
                  : [],
              },
            },
          });
    }
    if (request.args[0] === 'apply') {
      const source = JSON.parse((await readFile(join(request.cwd, 'main.tf.json'))).toString());
      currentControl = source.resource?.azapi_resource_action?.ce_network ?? null;
      if (currentControl) f.state.power = operation === 'start' ? 'VM running' : 'VM deallocated';
    }
    return { code: 0, stdout, executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } };
  };
  let opened = false;
  const terraform: CeTerraformService = {
    async open(owner, deployment, resume) {
      expect(owner).toEqual(f.store.owner);
      expect(deployment).toEqual(f.deployment);
      if (opened && !resume) throw Object.assign(Error('existing actual fixture runner'), { code: 'EEXIST' });
      const runner = new TerraformRunner(root, executor);
      if (resume) await runner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
      else {
        await runner.prepare(deployment);
        opened = true;
      }
      return runner as unknown as TerraformSession;
    },
  };
  const api = {
    async exec(command: string, args: string[], options?: Parameters<typeof f.api.exec>[2]) {
      if (args[0] === 'vm' && args[1] === 'show')
        return { exitCode: 0, stderr: '', stdout: JSON.stringify({ ...f.vms[1], powerState: f.state.power }) };
      return f.api.exec(command, args, options);
    },
  };
  const run = (signal?: AbortSignal) =>
    runAzureTerraformNetworkPowerStage(f.plan, f.before, 2, operation, [], terraform, f.store, api, {}, signal, {
      attempts: 2,
      intervalMs: 0,
      wait: async () => {},
    });
  return { ...f, commands, runActual: run };
}
for (const operation of ['deallocate', 'start'] as const)
  for (const boundary of ['complete', 'mutation-plan', 'release-plan', 'final-plan', 'current-no-change-plan'])
    test(`production Terraform runner ${operation} handles ${boundary} through the owning power adapter`, async () => {
      const f = await actualRunnerFixture(operation),
        write = f.store.write.bind(f.store);
      let lost: PlanReceipt | undefined;
      if (boundary !== 'complete') {
        f.store.write = async (name, value) => {
          if (!lost && name.endsWith(`-${boundary}.json`)) {
            lost = structuredClone(value) as PlanReceipt;
            throw Error('synthetic actual-runner packet loss');
          }
          return write(name, value);
        };
        await expect(f.runActual()).rejects.toThrow('actual-runner packet loss');
      }
      expect((await f.runActual()).status).toBe('power-stage-complete');
      if (lost)
        expect(await f.store.read(`${f.plan.planId}-terraform-network-node-2-${operation}-${boundary}.json`)).toEqual(
          lost,
        );
      expect(f.commands.filter((args) => args[0] === 'plan')).toHaveLength(3);
      expect(f.commands.filter((args) => args[0] === 'apply')).toHaveLength(2);
      expect(f.commands.filter((args) => args[0] === 'plan').every((args) => args.includes('-refresh=true'))).toBe(
        true,
      );
      await f.runActual();
      expect(f.commands.filter((args) => args[0] === 'apply')).toHaveLength(2);
      expect(f.mutations()).toBe(0);
    });

for (const boundary of ['final-plan-publication', 'current-plan-publication', 'saved-plan-response'] as const)
  test(`completed power stage recovers the exact original final plan after lost ${boundary}`, async () => {
    const f = await executionFixture();
    if (boundary === 'saved-plan-response') {
      const actual = f.session.plan.bind(f.session);
      let calls = 0;
      f.session.plan = async (...args) => {
        const receipt = await actual(...args);
        if (++calls === 3) throw Error('synthetic final saved-plan response lost');
        return receipt;
      };
    } else {
      const actual = f.store.write.bind(f.store);
      let once = true;
      f.store.write = async (name, value) => {
        const suffix = boundary === 'final-plan-publication' ? '-final-plan.json' : '-current-no-change-plan.json';
        if (once && name.endsWith(suffix)) {
          once = false;
          throw Error('synthetic final packet publication lost');
        }
        await actual(name, value);
      };
    }
    await expect(f.run()).rejects.toThrow('synthetic final');
    if (!f.session.readCurrentPlanJournal) throw Error('current journal fixture missing');
    const original = await f.session.readCurrentPlanJournal(f.hash(f.state.configuration));
    expect(original.state).toBe('planned');
    expect(original.receipt?.noChanges).toBe(true);
    if (!original.receipt) throw Error('original final receipt missing');
    expect(f.calls.filter((call) => call === 'plan')).toHaveLength(3);
    const result = await f.run();
    expect(result.currentNoChangePlanSha256).toBe(original.receipt.planSha256);
    expect(f.calls.filter((call) => call === 'plan')).toHaveLength(3);
    expect(f.calls.filter((call) => call.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
  });

for (const boundary of ['before-preparation', 'after-preparation'] as const)
  test(`final refresh ${boundary} failure recovers original authorization without another power apply`, async () => {
    const f = await executionFixture(),
      write = f.store.write.bind(f.store);
    let once = true;
    f.store.write = async (name, value) => {
      if (once && name.startsWith('azure-power-finalize-')) {
        once = false;
        if (boundary === 'after-preparation') await write(name, value);
        throw Error('synthetic final preparation lost');
      }
      await write(name, value);
    };
    await expect(f.run()).rejects.toThrow('preparation lost');
    expect(f.calls.filter((call) => call === 'plan')).toHaveLength(2);
    await f.run();
    expect(f.calls.filter((call) => call === 'plan')).toHaveLength(3);
    expect(f.calls.filter((call) => call.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
  });
for (const mode of [
  'refresh-unavailable',
  'refresh-disabled',
  'bad-execution-hash',
  'foreign-manifest',
  'submitted-final',
] as const)
  test(`final journal ${mode} cannot publish completion or replace its saved bytes`, async () => {
    const f = await executionFixture(),
      read = f.session.readCurrentPlanJournal;
    if (!read) throw Error('fixture journal missing');
    f.session.readCurrentPlanJournal = async (...args) => {
      const row = await read(...args);
      if (!row.receipt?.noChanges) return row;
      if (mode === 'refresh-unavailable')
        return { ...row, ordinaryRefreshEnabled: undefined, executionSha256: undefined };
      if (mode === 'refresh-disabled') return { ...row, ordinaryRefreshEnabled: false };
      if (mode === 'bad-execution-hash') return { ...row, executionSha256: '__RUNTIME__' };
      if (mode === 'foreign-manifest') return { ...row, manifestSha256: 'f'.repeat(64) };
      return { ...row, state: 'applying' };
    };
    await expect(f.run()).rejects.toThrow();
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
    await expect(
      f.store.read(`${f.plan.planId}-terraform-network-node-2-deallocate-final-plan.json`),
    ).rejects.toThrow();
  });
for (const mode of ['missing-original', 'incomplete-original', 'foreign-original'] as const)
  test(`finalizing ${mode} release history cannot authorize a refresh plan`, async () => {
    const f = await executionFixture(),
      read = f.session.readPlanApplicationHistory;
    if (!read) throw Error('fixture original history missing');
    f.session.readPlanApplicationHistory = async (...args) => {
      const row = await read(...args);
      if (mode === 'missing-original') return { ...row, matches: [] };
      if (mode === 'incomplete-original') return { ...row, incompleteArchives: 1 };
      return { ...row, receiptSha256: 'f'.repeat(64) };
    };
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter((call) => call === 'plan')).toHaveLength(2);
    expect(f.calls.filter((call) => call.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
  });

for (const method of ['plan', 'write'] as const)
  for (const settlement of ['fulfilled', 'rejected'] as const)
    test(`ignored final ${method} ${settlement} retains power lock and cannot publish late success`, async () => {
      const f = await executionFixture(),
        abort = new AbortController(),
        late = Promise.withResolvers<void>();
      if (method === 'plan') {
        const actual = f.session.plan.bind(f.session);
        let count = 0;
        f.session.plan = async (...args) => {
          if (++count === 3) {
            abort.abort(Error('synthetic final interruption'));
            await late.promise;
            if (settlement === 'rejected') throw Error('synthetic late rejection');
          }
          return actual(...args);
        };
      } else {
        const actual = f.store.write.bind(f.store);
        let once = true;
        f.store.write = async (name, value) => {
          if (once && name.endsWith('-final-plan.json')) {
            once = false;
            abort.abort(Error('synthetic final interruption'));
            await late.promise;
            if (settlement === 'rejected') throw Error('synthetic late rejection');
          }
          return actual(name, value);
        };
      }
      let caught: unknown;
      try {
        await f.run(abort.signal);
      } catch (error) {
        caught = error;
      }
      if (!(caught instanceof AzureTerraformPowerLifecycleInterrupted))
        throw Error('pending mutation interruption missing');
      const lock = join(f.store.directory, '.terraform-network-power-lock', 'claim.json');
      expect(await readFile(lock)).toBeTruthy();
      await expect(f.run()).rejects.toThrow();
      late.resolve();
      const completed = await caught.completion;
      expect(completed.mutationSettlements).toEqual([settlement]);
      expect(completed.locksReleased).toBe(true);
      await expect(readFile(lock)).rejects.toThrow();
      await expect(
        f.store.read(`${f.plan.planId}-terraform-network-node-2-deallocate-current-no-change-plan.json`),
      ).rejects.toThrow();
      expect((await f.run()).status).toBe('power-stage-complete');
      expect(f.calls.filter((call) => call.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
    });
for (const changed of ['request', 'owner', 'write', 'journal', 'history'] as const)
  test(`final planning rejects cross-read ${changed} changes before completion publication`, async () => {
    const f = await executionFixture(),
      actual = f.session.plan.bind(f.session);
    let count = 0;
    f.session.plan = async (...args) => {
      const value = await actual(...args);
      if (++count === 3) {
        if (changed === 'request') f.plan.planSha256 = 'f'.repeat(64);
        if (changed === 'owner') f.store.owner.engine = 'native';
        if (changed === 'write') f.store.write = async () => {};
        if (changed === 'journal') f.session.readCurrentPlanJournal = undefined;
        if (changed === 'history') f.session.readPlanApplicationHistory = undefined;
      }
      return value;
    };
    await expect(f.run()).rejects.toThrow('dependency changed');
    await expect(
      f.store.read(`${f.plan.planId}-terraform-network-node-2-deallocate-final-plan.json`),
    ).rejects.toThrow();
    expect(f.calls.filter((call) => call.startsWith('apply'))).toEqual(['apply-mutation', 'apply-release']);
  });

for (const changed of ['schema', 'node', 'state', 'journal', 'release', 'owner', 'before'] as const)
  test(`tampered ${changed} finalizing packet rejects without replacing completed saved plans`, async () => {
    const f = await executionFixture();
    await f.run();
    const calls = [...f.calls],
      actual = f.store.read.bind(f.store);
    f.store.read = async (name) => {
      const value = (await actual(name)) as Record<string, unknown>;
      if (name.startsWith('azure-power-finalize-')) {
        if (changed === 'schema') value.extra = true;
        if (changed === 'node') value.node = 1;
        if (changed === 'state') value.originalState = 'applying';
        if (changed === 'journal') value.originalJournalSha256 = 'f'.repeat(64);
        if (changed === 'release') value.releaseReceiptSha256 = 'f'.repeat(64);
        if (changed === 'owner') value.ownerSha256 = 'f'.repeat(64);
        if (changed === 'before') value.beforeSha256 = 'f'.repeat(64);
      }
      return value;
    };
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });
for (const method of ['readCurrentPlanJournal', 'readPlanApplicationHistory'] as const)
  test(`ignored final ${method} aborts promptly and cannot publish its late read`, async () => {
    const f = await executionFixture(),
      abort = new AbortController(),
      late = Promise.withResolvers<void>();
    const actual = f.session[method];
    if (!actual) throw Error('fixture reader missing');
    // Both readers have different argument types; each keeps its owning signature.
    if (method === 'readCurrentPlanJournal') {
      const reader = f.session.readCurrentPlanJournal;
      if (!reader) throw Error('fixture journal missing');
      f.session.readCurrentPlanJournal = async (...args) => {
        const value = await reader(...args);
        if (f.calls.filter((call) => call === 'plan').length === 2) {
          abort.abort(Error('synthetic final read interrupted'));
          await late.promise;
        }
        return value;
      };
    } else {
      const reader = f.session.readPlanApplicationHistory;
      if (!reader) throw Error('fixture history missing');
      f.session.readPlanApplicationHistory = async (...args) => {
        const value = await reader(...args);
        abort.abort(Error('synthetic final read interrupted'));
        await late.promise;
        return value;
      };
    }
    let caught: unknown;
    try {
      await f.run(abort.signal);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(AzureTerraformPowerLifecycleInterrupted);
    await expect(readFile(join(f.store.directory, '.terraform-network-power-lock', 'claim.json'))).rejects.toThrow();
    late.resolve();
    await Promise.resolve();
    await expect(
      f.store.read(`${f.plan.planId}-terraform-network-node-2-deallocate-current-no-change-plan.json`),
    ).rejects.toThrow();
  });
test('final journal byte drift during projection rejects before receipt publication', async () => {
  const f = await executionFixture(),
    reader = f.session.readCurrentPlanJournal;
  let reads = 0;
  if (!reader) throw Error('fixture journal missing');
  f.session.readCurrentPlanJournal = async (...args) => {
    const value = await reader(...args);
    return value.receipt?.noChanges && ++reads > 1 ? { ...value, journalSha256: 'f'.repeat(64) } : value;
  };
  await expect(f.run()).rejects.toThrow('saved evidence changed');
  await expect(f.store.read(`${f.plan.planId}-terraform-network-node-2-deallocate-final-plan.json`)).rejects.toThrow();
  expect(f.calls.filter((call) => call === 'plan')).toHaveLength(3);
});
