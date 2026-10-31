import { expect, test } from 'bun:test';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readAzureTerraformNetworkCompletedPowerRetirement } from '../../src/ce/terraform-network-power-completed-retirement';
import { readAzureTerraformNetworkPowerRunnerHistory } from '../../src/ce/terraform-network-power-runner-history';
import { readAzureTerraformNetworkRetirementGraph } from '../../src/ce/terraform-network-retirement-graph';
import { terraformNetworkLineageFixture } from './terraform-network-lineage-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

for (const fault of ['none', 'serialized', 'changed-native-packet', 'changed-retired-marker'] as const)
  test(`read-only borrowed graph retains actual proof or rejects ${fault}`, async () => {
    const existingRoots = new Set(nicExecutionRoots),
      controller = new AbortController(),
      timer = setTimeout(() => controller.abort(Error('bounded borrowed-graph test')), 150000);
    try {
      const f = await terraformNetworkLineageFixture(false, 2, controller.signal);
      const graph = await readAzureTerraformNetworkRetirementGraph(
        f.plan,
        f.first.store,
        f.first.loaders,
        f.first.site,
        f.first.dependencies.qualifyAcceptance,
        controller.signal,
      );
      const commands = [...f.first.commands],
        actions = f.drivers.flatMap((driver) => driver.vmPowerActions),
        names = (await readdir(f.first.store.directory)).sort();
      const witness = fault === 'serialized' ? structuredClone(graph) : graph;
      if (fault === 'changed-native-packet')
        await f.first.store.remove(`${f.plan.planId}-terraform-network-node-1-preflight.json`);
      if (fault === 'changed-retired-marker') {
        const deployment = graph.powerDeployments[0];
        if (!deployment.stage) throw Error('power stage missing');
        const path = join(
          f.first.store.directory,
          'terraform-stages',
          deployment.stage,
          deployment.deploymentId,
          'artifact-retirement.json',
        );
        await writeFile(path, `${await readFile(path, 'utf8')}\n`, { mode: 0o600 });
      }
      const power = () =>
        readAzureTerraformNetworkPowerRunnerHistory(
          f.plan,
          f.first.store,
          f.second.service,
          f.first.loaders,
          f.first.site,
          f.first.dependencies.qualifyAcceptance,
          controller.signal,
          undefined,
          witness,
        );
      const completed = () =>
        readAzureTerraformNetworkCompletedPowerRetirement(
          f.plan,
          1,
          'deallocate',
          f.second.service,
          f.first.store,
          f.first.loaders,
          f.first.site,
          f.first.dependencies.qualifyAcceptance,
          controller.signal,
          undefined,
          witness,
        );
      if (fault === 'none') {
        const normal = await readAzureTerraformNetworkPowerRunnerHistory(
          f.plan,
          f.first.store,
          f.second.service,
          f.first.loaders,
          f.first.site,
          f.first.dependencies.qualifyAcceptance,
          controller.signal,
        );
        const start = performance.now(),
          borrowed = await power();
        console.info('BORROWED POWER MS', performance.now() - start);
        expect(borrowed).toEqual(normal);
        expect(borrowed.rows.every((row) => row.status === 'retired')).toBe(true);
        expect((await completed()).runnerRetirementQualified).toBe(true);
        expect(borrowed.parentRetirementQualified).toBe(false);
      } else {
        await expect(power()).rejects.toThrow();
        await expect(completed()).rejects.toThrow();
      }
      expect(f.first.commands).toEqual(commands);
      expect(f.drivers.flatMap((driver) => driver.vmPowerActions)).toEqual(actions);
      if (fault !== 'changed-native-packet') expect((await readdir(f.first.store.directory)).sort()).toEqual(names);
      for (const root of nicExecutionRoots.filter((root) => !existingRoots.has(root))) {
        await rm(root, { recursive: true });
        nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
      }
    } finally {
      clearTimeout(timer);
      controller.abort(Error('borrowed graph settled'));
    }
  }, 180000);
