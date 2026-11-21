import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { withAwsNativeOperation } from '../../src/ce/native-operation';

const roots: string[] = [];
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'native-operation-'));
  roots.push(root);
  return CeDeploymentStore.open(root, {
    deploymentId: 'ce',
    provider: 'aws',
    engine: 'native',
    account: '123456789012',
    region: 'us-east-1',
  });
}
const cloud = 'a'.repeat(64),
  source = 'b'.repeat(64);
test('native mutation lease excludes competing apply and retirement while allowing only its exact cloud child', async () => {
  const store = await fixture();
  let calls = 0;
  await withAwsNativeOperation(store, { kind: 'retire', cloudPlanSha256: cloud }, async () => {
    await expect(
      withAwsNativeOperation(store, { kind: 'apply', planSha256: source, operation: 'deploy' }, async () => {
        calls++;
      }),
    ).rejects.toThrow('live process');
    await expect(
      withAwsNativeOperation(store, { kind: 'apply', planSha256: source, operation: 'teardown' }, async () => {
        calls++;
      }),
    ).rejects.toThrow('live process');
    await expect(
      withAwsNativeOperation(store, { kind: 'retire', cloudPlanSha256: cloud }, async () => {
        calls++;
      }),
    ).rejects.toThrow('live process');
    await withAwsNativeOperation(store, { kind: 'apply', planSha256: cloud, operation: 'teardown' }, async () => {
      calls++;
    });
  });
  expect(calls).toBe(1);
  await expect(readFile(join(store.directory, '.aws-native-operation-lock/claim.json'))).rejects.toThrow();
});
test('failed native operations release their own claim and retired application cannot create resources', async () => {
  const store = await fixture();
  await expect(
    withAwsNativeOperation(store, { kind: 'apply', planSha256: source, operation: 'deploy' }, async () => {
      throw Error('controlled failure');
    }),
  ).rejects.toThrow('controlled failure');
  await store.write('aws-native-lifecycle-retirement.json', { schemaVersion: 1, engine: 'native' });
  let calls = 0;
  await expect(
    withAwsNativeOperation(store, { kind: 'apply', planSha256: source, operation: 'deploy' }, async () => {
      calls++;
    }),
  ).rejects.toThrow('retiring or retired');
  expect(calls).toBe(0);
  await expect(readFile(join(store.directory, '.aws-native-operation-lock/claim.json'))).rejects.toThrow();
});
test('a deferred child cannot reuse a released native lease', async () => {
  const store = await fixture();
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let pending!: Promise<string>;
  let original = '';
  await withAwsNativeOperation(store, { kind: 'retire', cloudPlanSha256: cloud }, async () => {
    original = JSON.parse(await readFile(join(store.directory, '.aws-native-operation-lock/claim.json'), 'utf8')).token;
    pending = (async () => {
      await gate;
      return withAwsNativeOperation(
        store,
        { kind: 'apply', planSha256: cloud, operation: 'teardown' },
        async () =>
          JSON.parse(await readFile(join(store.directory, '.aws-native-operation-lock/claim.json'), 'utf8')).token,
      );
    })();
  });
  open();
  expect(await pending).not.toBe(original);
});
test('malformed plan hashes and foreign engines cannot acquire a native lease', async () => {
  const store = await fixture();
  let calls = 0;
  await expect(
    withAwsNativeOperation(store, { kind: 'retire', cloudPlanSha256: 'unresolved' }, async () => {
      calls++;
    }),
  ).rejects.toThrow();
  const root = await mkdtemp(join(tmpdir(), 'native-foreign-operation-'));
  roots.push(root);
  const foreign = await CeDeploymentStore.open(root, { ...store.owner, engine: 'terraform' });
  await expect(
    withAwsNativeOperation(foreign, { kind: 'retire', cloudPlanSha256: cloud }, async () => {
      calls++;
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});
