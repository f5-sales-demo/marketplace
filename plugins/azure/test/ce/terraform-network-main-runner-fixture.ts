import { expect } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { TerraformRunner } from '../../../terraform/src/runner';
import { createCeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import { readAzureTerraformNetworkMainRunnerHistory } from '../../src/ce/terraform-network-main-runner-history';
import { readAzureTerraformNetworkRetirementGraph } from '../../src/ce/terraform-network-retirement-graph';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';
import type { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';

/** Original graph from the production serial driver with its synthetic executor/cloud substrate.
 * Exact original receipts are reproduced by actual TerraformRunner saved bytes and journals.
 * This authenticates source composition only, not installed execution or live Azure outcome.
 */
export async function terraformNetworkMainRunnerFixture(
  ha = false,
  seed?: Parameters<typeof terraformNetworkDriverFixture>[2],
  driver?: Awaited<ReturnType<typeof terraformNetworkSerialPowerFixture>>,
  runDriver = true,
  prior?: {
    runner: TerraformRunner;
    commands: string[];
    archiveReceipt(receipt: PlanReceipt, source: string): Promise<void>;
    appendPlan(receipt: PlanReceipt): Promise<PlanReceipt>;
  },
) {
  const f = driver ?? (await terraformNetworkDriverFixture(ha, true, seed));
  if (runDriver) await f.run();
  const graph = await readAzureTerraformNetworkRetirementGraph(
    f.plan,
    f.store,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
  );
  const deployment = await azureTerraformCurrentDeployment(f.plan);
  const configurations = new Map([[f.hash(graph.original.binding.source), graph.original.binding.source]]);
  const original: PlanReceipt[] = [];
  for (const node of graph.nodes) {
    const prefix = `${f.plan.planId}-terraform-network-node-${node.node}`;
    for (const [stage, history] of [
      ['nic', node.nic],
      ['routing', node.routing],
    ] as const) {
      if (!history?.lastPacket) continue;
      const packet = (await f.store.read(`${prefix}${stage === 'routing' ? '-routing' : ''}-prepared.json`)) as {
        stage: { configuration: string; releasedConfiguration?: string };
      };
      for (const source of [packet.stage.configuration, packet.stage.releasedConfiguration])
        if (source) configurations.set(f.hash(source), source);
      for (const phase of ['mutation', 'release', 'final', 'current'] as const) {
        const receipt = (history.receipts as Partial<Record<typeof phase, PlanReceipt>>)[phase];
        if (receipt) original.push(receipt);
      }
    }
  }
  for (const name of Object.keys(graph.checkpoint.completionSha256ByName)) {
    const packet = (await f.store.read(name)) as { receipt: PlanReceipt };
    expect(packet.receipt.noChanges).toBe(true);
    if (!original.some((value) => canonicalSha256(value) === canonicalSha256(packet.receipt)))
      original.push(packet.receipt);
  }
  const commands: string[] = prior?.commands ?? [];
  let selected: PlanReceipt | undefined;
  const runner =
    prior?.runner ??
    new TerraformRunner(f.store.directory, async (request) => {
      commands.push(request.args[0]);
      let stdout = '{}';
      if (request.args[0] === 'version') stdout = JSON.stringify({ terraform_version: deployment.terraformVersion });
      if (request.args[0] === 'plan') {
        if (!selected) throw Error('exact fixture receipt missing');
        const bytes = Array.from({ length: 500 }, (_, i) => String(i + 1)).find(
          (value) => f.hash(value) === selected?.planSha256,
        );
        if (!bytes) throw Error('original fixture saved bytes unavailable');
        expect(f.hash(await readFile(join(request.cwd, 'main.tf.json'), 'utf8'))).toBe(selected.configurationSha256);
        await writeFile(join(request.cwd, 'saved.tfplan'), bytes, { mode: 0o600 });
      }
      if (request.args[0] === 'show') {
        if (!selected) throw Error('exact fixture plan missing');
        stdout = JSON.stringify({
          format_version: '1.2',
          terraform_version: deployment.terraformVersion,
          errored: false,
          complete: true,
          applyable: true,
          output_changes: {},
          resource_changes: selected.changes.map((change) => ({
            ...change,
            mode: 'managed',
            provider_name: change.type.startsWith('azapi_')
              ? 'registry.terraform.io/azure/azapi'
              : 'registry.terraform.io/hashicorp/azurerm',
            change: {
              actions: change.actions,
              before: null,
              after: null,
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          })),
        });
      }
      return { code: 0, stdout, executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } };
    });
  if (!prior) await runner.prepare({ ...deployment, configuration: graph.original.binding.source });
  const archiveReceipt =
    prior?.archiveReceipt ??
    (async (receipt: PlanReceipt, source: string) => {
      if ((await runner.readConfigurationSha256()) !== receipt.configurationSha256)
        await runner.reviseConfiguration(await runner.readConfigurationSha256(), source);
      selected = receipt;
      const observed = await runner.plan({});
      expect(observed).toEqual(receipt);
      if (!receipt.noChanges) await runner.apply(observed, {});
    });
  for (const receipt of original) {
    const source = configurations.get(receipt.configurationSha256);
    if (!source) throw Error('original graph configuration missing');
    await archiveReceipt(receipt, source);
  }
  const platform = {
    storage: async (owner: typeof f.store.owner) => {
      expect(owner).toEqual(f.store.owner);
      await f.store.verify();
      return f.store;
    },
  } as unknown as CePlatformService;
  const service = createCeTerraformService(async () => platform);
  const runHistory = (signal?: AbortSignal) =>
    readAzureTerraformNetworkMainRunnerHistory(
      f.plan,
      f.store,
      service,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  return {
    ...f,
    graph,
    deployment,
    commands,
    powerCommands: driver?.commands ?? [],
    vmPowerActions: driver?.vmPowerActions ?? [],
    runner,
    archiveReceipt,
    service,
    original,
    runHistory,
    appendPlan: async (receipt: PlanReceipt) => {
      if (prior) return prior.appendPlan(receipt);
      selected = receipt;
      return runner.plan({});
    },
    runnerDirectory: join(f.store.directory, deployment.deploymentId),
  };
}
