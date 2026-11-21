import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import {
  assertAwsTerraformDeploymentActive,
  beginAwsTerraformRetirement,
  withAwsTerraformLifecycle,
} from '../../src/ce/terraform-lifecycle';
import { siteBindings } from '../../src/ce/topology';
import { admissionFixture } from './terraform-admission-fixture';

const directories: string[] = [];
afterEach(async () => {
  for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true });
});
async function fixture() {
  const { plan: base } = admissionFixture(false, false, true);
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, siteBindings(base)[0].binding.owner);
  const plan = {
    kind: 'aws-ce-terraform-pending-teardown',
    sourcePlanSha256: base.planSha256,
    planSha256: 'a'.repeat(64),
  };
  return { base, plan, storage };
}
test('one public lifecycle owner excludes concurrent execution, releases on failure and permits teardown recovery', async () => {
  const f = await fixture();
  let enter!: () => void, finish!: () => void;
  const entered = new Promise<void>((r) => (enter = r)),
    done = new Promise<void>((r) => (finish = r));
  const running = withAwsTerraformLifecycle(f.storage, undefined, async () => {
    enter();
    await done;
    throw Error('interrupted');
  });
  await entered;
  await expect(
    withAwsTerraformLifecycle(f.storage, undefined, async () => {
      throw Error('concurrent action reached');
    }),
  ).rejects.toThrow('live process');
  finish();
  await expect(running).rejects.toThrow('interrupted');
  await withAwsTerraformLifecycle(f.storage, undefined, async () => {
    await beginAwsTerraformRetirement(f.base, f.plan, f.storage);
  });
  await expect(assertAwsTerraformDeploymentActive(f.storage)).rejects.toThrow('retirement');
  await withAwsTerraformLifecycle(f.storage, undefined, async () => {
    await beginAwsTerraformRetirement(f.base, f.plan, f.storage);
  });
});
test('retirement marker rejects a different teardown or malformed marker without replacing it', async () => {
  const f = await fixture();
  await beginAwsTerraformRetirement(f.base, f.plan, f.storage);
  const original = await f.storage.read('aws-terraform-lifecycle-retirement.json');
  await expect(
    beginAwsTerraformRetirement(f.base, { ...f.plan, planSha256: 'b'.repeat(64) }, f.storage),
  ).rejects.toThrow('another immutable');
  expect(await f.storage.read('aws-terraform-lifecycle-retirement.json')).toEqual(original);
  await f.storage.write('aws-terraform-lifecycle-retirement.json', null);
  await expect(beginAwsTerraformRetirement(f.base, f.plan, f.storage)).rejects.toThrow('another immutable');
  await expect(assertAwsTerraformDeploymentActive(f.storage)).rejects.toThrow('retirement');
});
test('active deployment requires available state and cancellation never enters a lifecycle action', async () => {
  const f = await fixture();
  await assertAwsTerraformDeploymentActive(f.storage);
  await expect(
    withAwsTerraformLifecycle(f.storage, AbortSignal.abort(), async () => {
      throw Error('action reached');
    }),
  ).rejects.toThrow();
  await expect(
    assertAwsTerraformDeploymentActive({
      ...f.storage,
      verify: async () => {},
      read: async () => {
        throw Error('unavailable');
      },
    } as never),
  ).rejects.toThrow('unavailable');
});
