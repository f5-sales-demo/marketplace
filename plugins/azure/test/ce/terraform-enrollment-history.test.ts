import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'azure-enrollment-history-'));
  roots.push(root);
  const plan = compileAzureCePlan({ ...structuredClone(intent), engine: 'terraform' }, structuredClone(observation));
  const store = await CeDeploymentStore.open(root, azureUpgradeBinding(plan).owner);
  const tokenName = `${plan.deploymentName.slice(0, 40)}-1-${'a'.repeat(12)}`;
  const token = {
    tokenName,
    siteName: plan.siteName,
    node: `${plan.deploymentName}-1`,
    jwt: 'fixture.payload.signature',
  };
  await store.write(`${tokenName}.json`, token);
  return { plan, store, tokenName, token };
}
async function collector() {
  return (await import('../../src/ce/terraform-enrollment-history')).collectAzureHistoricalEnrollmentTokens;
}
test('historical enrollment retains issued identities and returns no JWT material', async () => {
  const f = await fixture();
  const rows = await (await collector())(f.plan, f.store);
  expect(rows).toEqual([{ node: f.token.node, name: f.tokenName }]);
  expect(JSON.stringify(rows)).not.toContain(f.token.jwt);
});
for (const fault of ['node', 'site', 'name', 'jwt', 'extra', 'malformed'] as const) {
  test(`historical enrollment rejects ${fault} instead of omitting the issued record`, async () => {
    const f = await fixture();
    const changed: Record<string, unknown> = { ...f.token };
    if (fault === 'node') changed.node = 'foreign-node';
    if (fault === 'site') changed.siteName = 'foreign-site';
    if (fault === 'name') changed.tokenName = 'foreign-token';
    if (fault === 'jwt') changed.jwt = 'unresolved';
    if (fault === 'extra') changed.extra = true;
    await f.store.write(`${f.tokenName}.json`, fault === 'malformed' ? null : changed);
    await expect((await collector())(f.plan, f.store)).rejects.toThrow();
  });
}
test('historical enrollment rejects foreign owner and expired cancellation before reading', async () => {
  const f = await fixture();
  const collect = await collector();
  await expect(
    collect(f.plan, { ...f.store, owner: { ...f.store.owner, account: 'example-foreign' } } as never),
  ).rejects.toThrow();
  let reads = 0;
  const read = f.store.read.bind(f.store);
  f.store.read = async (name) => {
    reads++;
    return read(name);
  };
  await expect(collect(f.plan, f.store, AbortSignal.abort(Error('expired original deadline')))).rejects.toThrow();
  expect(reads).toBe(0);
});
test('historical enrollment rejects a symlink at a recognized issued-token path', async () => {
  const f = await fixture();
  const file = join(f.store.directory, `${f.tokenName}.json`),
    other = join(f.store.directory, 'copied-token.json');
  await writeFile(other, JSON.stringify(f.token), { mode: 0o600 });
  await rm(file);
  await symlink(other, file);
  await expect((await collector())(f.plan, f.store)).rejects.toThrow();
});
test('historical enrollment rejects a changed record across its independent final read', async () => {
  const f = await fixture();
  const read = f.store.read.bind(f.store);
  let count = 0;
  f.store.read = async (name) => {
    if (name === `${f.tokenName}.json` && ++count === 2)
      await f.store.write(name, { ...f.token, jwt: 'changed.payload.signature' });
    return read(name);
  };
  await expect((await collector())(f.plan, f.store)).rejects.toThrow();
});

for (const stage of ['verify', 'read'] as const) {
  test(`historical enrollment cancels a pending ${stage} without waiting for its callback`, async () => {
    const f = await fixture();
    const collect = await collector();
    let entered = false;
    f.store[stage] = (() => {
      entered = true;
      return new Promise(() => {});
    }) as never;
    const controller = new AbortController();
    const cancellation = Error('original enrollment operation canceled');
    const work = collect(f.plan, f.store, controller.signal);
    const abortTimer = setInterval(() => {
      if (entered) controller.abort(cancellation);
    }, 5);
    let limit: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        work.then(
          () => 'unexpected success',
          (error) => error,
        ),
        new Promise((resolve) => {
          limit = setTimeout(() => resolve('callback remained pending'), 150);
        }),
      ]);
      expect(entered).toBe(true);
      expect(outcome).toBe(cancellation);
    } finally {
      clearInterval(abortTimer);
      clearTimeout(limit);
      controller.abort(cancellation);
    }
  });
}

test('historical enrollment rejects namespace changes during the independent final read', async () => {
  const f = await fixture();
  const read = f.store.read.bind(f.store);
  let count = 0;
  f.store.read = async (name) => {
    if (name === `${f.tokenName}.json` && ++count === 2)
      await f.store.write('new-unclassified-entry.json', { unexpected: true });
    return read(name);
  };
  await expect((await collector())(f.plan, f.store)).rejects.toThrow();
});
