import { expect } from 'bun:test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { type Invocation, TerraformRunner } from '../../../terraform/src/runner';
import { createCeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureTerraformNetworkPowerDeployment } from '../../src/ce/terraform-network-power';
import { cancelAzureTerraformNetworkPowerStage } from '../../src/ce/terraform-network-power-cancellation';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';

export async function terraformNetworkPowerCancellationFixture(
  ha = false,
  targetNode = 1,
  targetOperation: 'deallocate' | 'start' = 'deallocate',
  published = false,
  existingSelectedControl = false,
  independentVerifier?: ConstructorParameters<typeof TerraformRunner>[2],
) {
  const f = await terraformNetworkDriverFixture(ha),
    commands: string[] = [],
    invocations: Array<{ args: string[]; expectedExecutable?: Invocation['expectedExecutable'] }> = [],
    vmPowerActions: string[] = [],
    savedPlans = new Map<string, Record<string, unknown>>(),
    appliedState = {
      control: null as Record<string, unknown> | null,
      loseApplyResponse: false,
      loseApplyBeforeEffect: false,
      extraResources: [] as Array<Record<string, unknown>>,
      extraOutputs: {} as Record<string, unknown>,
    };
  let planCount = 0;
  const originalPower = f.dependencies.runPower;
  let runner: TerraformRunner | undefined,
    directory = '',
    originalReceipt: Awaited<ReturnType<TerraformRunner['plan']>> | undefined;
  f.dependencies.runPower = async (...args: Parameters<typeof originalPower>) => {
    const [plan, before, node, operation] = args;
    if (node !== targetNode || operation !== targetOperation) return originalPower(...args);
    await f.preparePowerFixture(plan, before, node);
    const deployment = await azureTerraformNetworkPowerDeployment(plan, before, node, operation);
    if (!deployment.stage) throw Error('fixture stage missing');
    directory = join(f.store.directory, 'terraform-stages', deployment.stage, deployment.deploymentId);
    if (existingSelectedControl)
      appliedState.control = JSON.parse(deployment.configuration).resource.azapi_resource_action.ce_network;
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
          applyable: !!effect && effect !== 'no-op',
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
        const bytes =
          ++planCount === 1
            ? 'synthetic-original-unsubmitted-power-plan'
            : `synthetic-selected-power-plan-${planCount}`;
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
          if (change.after) vmPowerActions.push(String(change.after.action));
        }
      }
      if (request.args[0] === 'apply' && appliedState.loseApplyResponse)
        throw Error('synthetic selected release response lost after effect');
      return { code: 0, stdout, executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } };
    };
    runner = new TerraformRunner(
      join(f.store.directory, 'terraform-stages', deployment.stage),
      executor,
      independentVerifier,
    );
    await runner.prepare(deployment);
    originalReceipt = await runner.plan({});
    if (published)
      await f.store.write(
        `${plan.planId}-terraform-network-node-${node}-${operation}-mutation-plan.json`,
        originalReceipt,
      );
    throw Error('synthetic original mutation plan publication interrupted');
  };
  await expect(f.run()).rejects.toThrow('publication interrupted');
  if (!runner || !originalReceipt) throw Error('actual selected runner missing');
  const actualRunner = runner,
    receipt = originalReceipt;
  const selectedDeployment = await azureTerraformNetworkPowerDeployment(f.plan, f.before, targetNode, targetOperation);
  const resumeSelectedRunner = async () => {
    await actualRunner.resume(selectedDeployment.deploymentId, selectedDeployment, 'current');
    return actualRunner;
  };
  const platform = {
    storage: async (owner: typeof f.store.owner) => {
      expect(owner).toEqual(f.store.owner);
      await f.store.verify();
      return f.store;
    },
  } as unknown as CePlatformService;
  const terraform = createCeTerraformService(async () => platform),
    actualOpen = terraform.open;
  // File/journal/cancellation methods use the actual service. Plan projections use the genuine
  // runner's synthetic executor, so this is source integration rather than live Terraform.
  terraform.open = async (...args) => {
    const session = await actualOpen(...args);
    await resumeSelectedRunner();
    session.readPlannedResourceFields = actualRunner.readPlannedResourceFields.bind(actualRunner);
    session.readProposedResourceFields = actualRunner.readProposedResourceFields.bind(actualRunner);
    return session;
  };
  const runCancellation = (signal?: AbortSignal) =>
    cancelAzureTerraformNetworkPowerStage(
      f.plan,
      targetNode,
      targetOperation,
      terraform,
      f.store,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
      {},
      signal,
    );
  const packetName = async () =>
    (await readdir(f.store.directory)).find((name) => name.startsWith('azure-power-cancel-'));
  return {
    ...f,
    commands,
    invocations,
    vmPowerActions,
    appliedState,
    selectedDeployment,
    resumeSelectedRunner,
    directory,
    actualRunner,
    receipt,
    cancellationTerraform: terraform,
    runCancellation,
    packetName,
  };
}
