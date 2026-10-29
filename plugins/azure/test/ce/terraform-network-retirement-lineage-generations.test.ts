import { expect, test } from 'bun:test';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';
import { lineageCleanupEvidence, terraformNetworkLineageFixture } from './terraform-network-lineage-fixture';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

for (const ha of [false, true])
  test(
    `three-generation ${ha ? 'HA six-interface' : 'single two-interface'} shared-main lineage retains actual custody`,
    async () => {
      const existingRoots = new Set(nicExecutionRoots);
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(Error('bounded lineage qualification cancellation')),
        ha ? 540000 : 150000,
      );
      try {
        const f = await terraformNetworkLineageFixture(ha, 3, controller.signal);
        const commands = [...f.first.commands],
          actions = f.drivers.flatMap((driver) => driver.vmPowerActions);
        const start = performance.now(),
          witness = await f.read(controller.signal),
          history = await f.main(witness);
        const observerMs = performance.now() - start;
        console.info('LINEAGE OBSERVER MS', ha ? 'HA' : 'single', observerMs);
        expect(observerMs).toBeLessThanOrEqual(180000);
        expect(
          witness.rows
            .filter((row) => row.execution === 'staged-network')
            .map((row) => row.planSha256)
            .sort(),
        ).toEqual(f.plans.map((plan) => plan.planSha256).sort());
        expect(history.originalPublishedJournalsQualified).toBe(true);
        expect(history.terminalPublishedJournalsQualified).toBe(true);
        expect(history.lineageSha256).toBe(canonicalSha256(witness));
        expect(history.parentRetirementQualified).toBe(false);
        expect(history.currentOperationalAcceptanceQualified).toBe(false);
        const physical = f.histories.map((generation) =>
          Object.fromEntries(
            Object.entries(generation.inventory.nodes).map(([node, vm]) => [
              node,
              {
                resourceId: vm.resourceId,
                vmId: vm.vmId,
                nics: Object.fromEntries(
                  Object.entries(vm.nics).map(([index, nic]) => [index, { resourceId: nic.resourceId, mac: nic.mac }]),
                ),
              },
            ]),
          ),
        );
        expect(physical[1]).toEqual(physical[0]);
        expect(physical[2]).toEqual(physical[0]);
        expect(
          new Set(
            Object.values(f.histories[2].inventory.nodes).flatMap((vm) => Object.values(vm.nics).map((nic) => nic.mac)),
          ).size,
        ).toBe(ha ? 6 : 2);
        for (const driver of f.drivers) {
          expect(driver.stages.size).toBe(ha ? 6 : 2);
          for (const [stage, entry] of driver.stages) {
            const marker = JSON.parse(
              await readFile(
                join(
                  f.first.store.directory,
                  'terraform-stages',
                  stage,
                  entry.deployment.deploymentId,
                  'artifact-retirement.json',
                ),
                'utf8',
              ),
            );
            expect(marker.status).toBe('runner-artifacts-retired');
          }
        }
        expect(f.first.commands).toEqual(commands);
        expect(f.drivers.flatMap((driver) => driver.vmPowerActions)).toEqual(actions);
        for (const root of nicExecutionRoots.filter((root) => !existingRoots.has(root))) {
          await rm(root, { recursive: true });
          nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
        }
      } finally {
        clearTimeout(timer);
        controller.abort(Error('qualification ended'));
      }
    },
    ha ? 600000 : 180000,
  );

test('independently authentic staged forks cannot authorize each other shared-main configuration', async () => {
  const existingRoots = new Set(nicExecutionRoots);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(Error('bounded fork diagnostic cancellation')), 150000);
  try {
    const f = await terraformNetworkLineageFixture(false, 2, controller.signal);
    const fork = compileAzureTerraformNetworkUpdatePlan(f.birth.plan, f.plan, f.birth.original);
    f.sources.set(fork.planSha256, fork);
    const before = structuredClone(f.histories[0].inventory);
    before.planSha256 = fork.planSha256;
    for (const vm of Object.values(before.nodes))
      for (const [index, nic] of Object.entries(vm.nics)) {
        const target = fork.nics[Number(index)].subnet;
        nic.targetSubnetId = `${f.birth.vnet.id}/subnets/${target.name}`;
        nic.targetSubnetCidr = target.cidr as string;
      }
    const seed = { ...f.seed, plan: fork, inventory: before, source: f.histories[0].finalSource, store: f.first.store };
    const driver = await terraformNetworkSerialPowerFixture(
      false,
      async (request) => lineageCleanupEvidence(request, '1.16.5'),
      seed,
    );
    await driver.run(controller.signal);
    await terraformNetworkMainRunnerFixture(false, seed, driver, false, f.second);
    await savePlanArtifact(f.publicSession, fork, f.birth.current);
    await expect(f.read(controller.signal)).rejects.toThrow('staged public lineage forks');
    for (const root of nicExecutionRoots.filter((root) => !existingRoots.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  } finally {
    clearTimeout(timer);
    controller.abort(Error('fork test ended'));
  }
}, 180000);
