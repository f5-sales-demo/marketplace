import { expect } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { type Invocation, TerraformRunner } from '../../../terraform/src/runner';
import { createCeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { runAzureTerraformNetworkUpdate } from '../../src/ce/terraform-network-driver';
import { azureTerraformNetworkPowerDeployment } from '../../src/ce/terraform-network-power';
import { runAzureTerraformNetworkPowerStage } from '../../src/ce/terraform-network-power-execution';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';

export async function terraformNetworkSerialPowerFixture(
  ha = false,
  independentVerifier?: ConstructorParameters<typeof TerraformRunner>[2],
  seed?: Parameters<typeof terraformNetworkDriverFixture>[2],
) {
  const f = await terraformNetworkDriverFixture(ha, true, seed),
    commands: string[] = [],
    invocations: Array<{ args: string[]; expectedExecutable?: Invocation['expectedExecutable'] }> = [],
    vmPowerActions: string[] = [],
    savedPlans = new Map<string, Record<string, unknown>>(),
    stages = new Map<
      string,
      { runner: TerraformRunner; deployment: Awaited<ReturnType<typeof azureTerraformNetworkPowerDeployment>> }
    >();
  const appliedStateTemplate = {
    control: null as Record<string, unknown> | null,
    loseApplyResponse: false,
    loseApplyBeforeEffect: false,
    extraResources: [] as Array<Record<string, unknown>>,
    extraOutputs: {} as Record<string, unknown>,
  };
  let planCount = 0;
  delete (f.dependencies as { retirePower?: unknown }).retirePower;
  const mainOpen = f.terraform.open;
  const platform = { storage: async () => f.store } as unknown as CePlatformService;
  const service = createCeTerraformService(async () => platform);
  const actualOpen = service.open;
  f.terraform.open = async (...args) => {
    if (!args[1].stage) return mainOpen(...args);
    const entry = stages.get(args[1].stage);
    if (!entry) throw Error('actual selected stage runner missing');
    const session = await actualOpen(...args);
    await entry.runner.resume(entry.deployment.deploymentId, args[1], args[2] === 'current' ? 'current' : 'exact');
    const runner = entry.runner;
    session.readPlannedResourceFields = runner.readPlannedResourceFields.bind(runner);
    session.readProposedResourceFields = runner.readProposedResourceFields.bind(runner);
    session.plan = runner.plan.bind(runner);
    session.apply = runner.apply.bind(runner);
    session.readAppliedResourceFields = runner.readAppliedResourceFields.bind(runner);
    session.retireArtifacts = runner.retireArtifacts.bind(runner);
    return session;
  };
  f.dependencies.runPower = async (...args: Parameters<typeof runAzureTerraformNetworkPowerStage>) => {
    const [plan, before, node, operation, appliedNics] = args;
    const appliedState = structuredClone(appliedStateTemplate);
    f.calls.push(`${node}:${operation}`);
    await f.preparePowerFixture(plan, before, node);
    const deployment = await azureTerraformNetworkPowerDeployment(plan, before, node, operation);

    if (!deployment.stage) throw Error('fixture stage missing');

    const executor = async (request: Invocation) => {
      commands.push(request.args[0]);
      invocations.push(structuredClone({ args: request.args, expectedExecutable: request.expectedExecutable }));
      let stdout = '{}';
      if (request.args[0] === 'version') stdout = JSON.stringify({ terraform_version: deployment.terraformVersion });
      if (request.args[0] === 'plan') {
        const source = JSON.parse((await readFile(join(request.cwd, 'main.tf.json'))).toString());
        const proposed = source.resource?.azapi_resource_action?.ce_network ?? null;
        const before = structuredClone(appliedState.control);
        const effect = proposed
          ? before
            ? canonicalSha256(before) === canonicalSha256(proposed)
              ? 'no-op'
              : 'update'
            : 'create'
          : before
            ? 'delete'
            : undefined;
        const raw = {
          format_version: '1.2',
          terraform_version: deployment.terraformVersion,
          errored: false,
          complete: true,
          applyable: !!effect && effect !== 'no-op', // codespell:ignore applyable (exact Terraform JSON field)
          planned_values: {
            root_module: {
              resources: proposed
                ? [
                    {
                      address: 'azapi_resource_action.ce_network',
                      type: 'azapi_resource_action',
                      values: structuredClone(proposed),
                    },
                  ]
                : [],
            },
          },
          resource_changes: effect
            ? [
                {
                  address: 'azapi_resource_action.ce_network',
                  type: 'azapi_resource_action',
                  mode: 'managed',
                  provider_name: 'registry.terraform.io/azure/azapi',
                  change: {
                    actions: [effect],
                    before,
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
        const bytes = `synthetic-completed-power-plan-${++planCount}`;
        savedPlans.set(bytes, raw);
        await writeFile(join(request.cwd, 'saved.tfplan'), bytes, { mode: 0o600 });
      }
      if (request.args[0] === 'show') {
        if (request.args.includes('saved.tfplan')) {
          const bytes = await readFile(join(request.cwd, 'saved.tfplan'), 'utf8');
          const raw = savedPlans.get(bytes);
          if (!raw) throw Error('synthetic saved plan bytes unknown');
          stdout = JSON.stringify(raw);
        } else
          stdout = JSON.stringify({
            format_version: '1.0',
            terraform_version: deployment.terraformVersion,
            values: {
              root_module: {
                resources: [
                  ...(appliedState.control
                    ? [
                        {
                          address: 'azapi_resource_action.ce_network',
                          type: 'azapi_resource_action',
                          name: 'ce_network',
                          mode: 'managed',
                          provider_name: 'registry.terraform.io/azure/azapi',
                          values: structuredClone(appliedState.control),
                          sensitive_values: false,
                        },
                      ]
                    : []),
                  ...appliedState.extraResources,
                ],
              },
              outputs: appliedState.extraOutputs,
            },
          });
      }
      if (request.args[0] === 'apply' && appliedState.loseApplyBeforeEffect)
        throw Error('synthetic selected release response lost before effect');
      if (request.args[0] === 'apply') {
        const bytes = await readFile(join(request.cwd, 'saved.tfplan'), 'utf8');
        const raw = savedPlans.get(bytes);
        if (!raw) throw Error('synthetic submitted bytes unknown');
        const change = (
          raw.resource_changes as Array<{ change: { actions: string[]; after: Record<string, unknown> | null } }>
        )[0]?.change;
        if (change && change.actions[0] !== 'no-op') {
          appliedState.control = structuredClone(change.after);
          if (change.after) {
            vmPowerActions.push(String(change.after.action));
            const selected = f.fixtures.get(node);
            if (!selected) throw Error('selected synthetic cloud fixture missing');
            selected.state.power = operation === 'start' ? 'VM running' : 'VM deallocated';
          }
        }
      }
      if (request.args[0] === 'apply' && appliedState.loseApplyResponse)
        throw Error('synthetic selected release response lost after effect');
      return { code: 0, stdout, executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } };
    };
    const runner = new TerraformRunner(
      join(f.store.directory, 'terraform-stages', deployment.stage),
      executor,
      independentVerifier,
    );
    await runner.prepare(deployment);
    stages.set(deployment.stage, { runner, deployment });
    const selectedRunner = runner;
    const stageService = {
      async open(owner: typeof f.store.owner, expected: typeof deployment, resume: boolean | 'current') {
        expect(owner).toEqual(f.store.owner);
        expect(expected).toEqual(deployment);
        if (!resume) throw Object.assign(Error('selected stage already prepared'), { code: 'EEXIST' });
        await selectedRunner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
        return selectedRunner as unknown as import('../../../terraform/src/service').TerraformSession;
      },
    };
    const result = await runAzureTerraformNetworkPowerStage(
      plan,
      before,
      node,
      operation,
      appliedNics,
      stageService,
      f.store,
      f.api,
      {},
      args[9],
      { attempts: 2, intervalMs: 0, wait: async () => {} },
    );
    return result;
  };
  const run = (signal?: AbortSignal) =>
    runAzureTerraformNetworkUpdate(f.plan, f.terraform, f.store, f.api, {}, f.loaders, f.site, f.dependencies, signal);
  const dependencies = f.dependencies as Omit<typeof f.dependencies, 'retirePower'> &
    Pick<import('../../src/ce/terraform-network-driver').AzureTerraformNetworkDriverDependencies, 'retirePower'>;
  return { ...f, dependencies, run, stages, commands, invocations, vmPowerActions };
}
