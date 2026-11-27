import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { compileAzureCePlan } from '../../src/ce/planner';
import {
  qualifyAzureTerraformTeardownStageHistory,
  recheckAzureTerraformTeardownStageHistory,
} from '../../src/ce/terraform-teardown-stage-history';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

for (const fault of [
  'none',
  'clone',
  'foreign-request',
  'foreign-store',
  'foreign-context',
  'changed-result',
  'changed-owner',
  'changed-read',
  'changed-verify',
  'late-source',
  'late-stage',
  'directory-replaced',
  'cancelled',
  'expired',
  'ignored-cancellation',
] as const) {
  test(`genuine private stage history recheck ${fault}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'azure-stage-native-recheck-'));
    try {
      const selected = structuredClone(intent);
      selected.engine = 'terraform';
      const plan = compileAzureCePlan(selected, structuredClone(observation));
      const store = await CeDeploymentStore.open(root, azureUpgradeBinding(plan).owner),
        stageRoot = join(store.directory, 'terraform-stages');
      await mkdir(stageRoot, { mode: 0o700 });
      let blocked = false,
        writes = 0;
      const verify = store.verify,
        write = store.write;
      if (fault === 'ignored-cancellation')
        store.verify = async () => {
          if (blocked) await new Promise<void>(() => {});
          else await verify.call(store);
        };
      const controller = new AbortController(),
        qualificationSignal = fault === 'expired' ? AbortSignal.timeout(500) : controller.signal;
      const history = await qualifyAzureTerraformTeardownStageHistory(plan, store, qualificationSignal);
      let witness: unknown = history,
        request = plan,
        currentStore = store,
        context: Parameters<typeof qualifyAzureTerraformTeardownStageHistory>[3];
      if (fault === 'clone') witness = structuredClone(history);
      if (fault === 'foreign-request') request = structuredClone(plan);
      if (fault === 'foreign-store') currentStore = await CeDeploymentStore.open(root, azureUpgradeBinding(plan).owner);
      if (fault === 'foreign-context') context = {} as NonNullable<typeof context>;
      if (fault === 'changed-result') history.stages.push('foreign');
      if (fault === 'changed-owner') store.owner.deploymentId = 'foreign';
      if (fault === 'changed-read') store.read = store.read.bind(store);
      if (fault === 'changed-verify') store.verify = store.verify.bind(store);
      if (fault === 'late-source') await write.call(store, `azure-ce-failover-${'f'.repeat(24)}.json`, {});
      if (fault === 'late-stage') await mkdir(join(stageRoot, 'foreign-stage'), { mode: 0o700 });
      if (fault === 'directory-replaced') {
        await rename(stageRoot, join(root, 'old-stage-root'));
        await mkdir(stageRoot, { mode: 0o700 });
      }
      if (fault === 'cancelled') controller.abort(Error('original qualification cancelled'));
      if (fault === 'expired' && !qualificationSignal.aborted)
        await new Promise<void>((resolve) =>
          qualificationSignal.addEventListener('abort', () => resolve(), { once: true }),
        );
      if (fault === 'ignored-cancellation') blocked = true;
      store.write = async () => {
        writes++;
        throw Error('read-only stage recheck attempted write');
      };
      const signal = fault === 'ignored-cancellation' ? AbortSignal.timeout(25) : undefined,
        start = Date.now();
      if (fault === 'none')
        expect(await recheckAzureTerraformTeardownStageHistory(witness, request, currentStore, signal, context)).toBe(
          history,
        );
      else
        await expect(
          recheckAzureTerraformTeardownStageHistory(witness, request, currentStore, signal, context),
        ).rejects.toThrow();
      if (fault === 'ignored-cancellation') expect(Date.now() - start).toBeLessThan(1000);
      expect(writes).toBe(0);
    } finally {
      await rm(root, { recursive: true });
    }
  });
}
