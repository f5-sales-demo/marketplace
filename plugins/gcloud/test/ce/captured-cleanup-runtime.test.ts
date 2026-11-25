/** Source qualification: shared session and durable files with synthetic cloud/Platform effects. */
import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { openGcpCapturedCleanupRuntime } from '../../src/ce/captured-cleanup-runtime';
import { fingerprint } from '../../src/ce/discovery';
import { capturedTeardownSourceFixture } from './captured-teardown-origin.test';

async function fixture() {
  const f = await capturedTeardownSourceFixture();
  const owner = {
    provider: 'gcp',
    engine: 'terraform',
    account: f.i.project,
    region: f.i.region,
    deploymentId: f.i.deploymentName,
  };
  let credential = 'initial-fixture',
    url = 'https://tenant.example.test';
  let storeDirectory = dirname(f.directory),
    available = true,
    closure = true;
  const store = {
    directory: storeDirectory,
    owner,
    verify: async () => {},
    read: async (name: string) => JSON.parse(await readFile(join(storeDirectory, name), 'utf8')),
    write: async (name: string, value: unknown) =>
      writeFile(join(storeDirectory, name), JSON.stringify(value), { mode: 0o600 }),
  };
  await store.write('gcp-terraform-input-identity.json', {
    intent: f.i,
    intentFingerprint: fingerprint(f.i),
    platformContext: f.i.platformContext,
  });
  const platform = {
    storage: async () => ({ ...store, directory: storeDirectory }),
    gcpObservations: async (value: unknown, context: string) => {
      expect(value).toEqual(owner);
      expect(context).toBe(f.i.platformContext);
      return {
        ...(available
          ? {
              terraformEnvironment: async () => ({ XCSH_API_URL: url, XCSH_API_TOKEN: credential }),
              teardown: f.runtime.observePlatform,
            }
          : {}),
      };
    },
  } as unknown as CePlatformService;
  const args = {
    ...f.common,
    reference: f.persisted.reference,
    source: f.source,
    platform,
    execute: f.inspection.execute,
    assertIndependentClosure: async () => {
      if (!closure) throw new Error('original reader group remains');
    },
  };
  return {
    ...f,
    args,
    store,
    change: (mode: string) => {
      if (mode === 'credential') credential = 'refreshed-fixture';
      if (mode === 'context') url = 'https://other.example.test';
      if (mode === 'storage') storeDirectory = dirname(storeDirectory);
      if (mode === 'unavailable') available = false;
      if (mode === 'closure') closure = false;
    },
  };
}

test('compiled cleanup opener resumes the original shared session without replay or substitute public journals', async () => {
  const f = await fixture(),
    failed = await readFile(join(f.lock, 'capture-unresolved.json'));
  const opened = await openGcpCapturedCleanupRuntime(f.args);
  try {
    const before = f.commands.length;
    expect((await opened.runtime.session.readStateIdentity?.())?.lineage).toBe(f.state.lineage);
    await expect(opened.runtime.session.apply(f.receipt, opened.runtime.environment)).rejects.toThrow();
    expect(f.commands.length).toBe(before);
    expect(opened.runtime.capturedTeardownOrigin?.executionAuthorized).toBe(false);
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(failed);
    expect(await Bun.file(join(dirname(f.directory), 'gcp-tf-deploy-original-authorization.json')).exists()).toBe(
      false,
    );
  } finally {
    opened.close();
  }
});

test('compiled cleanup uses fresh Platform credentials and retires the shared session on close', async () => {
  const f = await fixture(),
    opened = await openGcpCapturedCleanupRuntime(f.args);
  f.change('credential');
  await opened.runtime.session.readStateIdentity?.();
  expect(opened.runtime.environment.XCSH_API_TOKEN).toBe('refreshed-fixture');
  opened.close();
  await expect(opened.runtime.session.readStateIdentity?.()).rejects.toThrow('retired');
  await expect(
    opened.runtime.observePlatform(f.i.sites[0].name, `${f.i.sites[0].nodes[0].name}-token`),
  ).rejects.toThrow('retired');
});

for (const mode of ['context', 'storage', 'unavailable', 'closure'] as const)
  test(`compiled cleanup refuses invalid original bindings before cloud reads: ${mode}`, async () => {
    const f = await fixture(),
      before = f.apiCalls.length;
    f.change(mode);
    await expect(openGcpCapturedCleanupRuntime(f.args)).rejects.toThrow();
    expect(f.apiCalls.length).toBe(before);
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toBeDefined();
  });

for (const mode of ['context', 'storage', 'closure'] as const)
  test(`compiled cleanup stops an opened shared session when original bindings change: ${mode}`, async () => {
    const f = await fixture(),
      opened = await openGcpCapturedCleanupRuntime(f.args);
    try {
      const before = f.commands.length;
      f.change(mode);
      await expect(opened.runtime.session.readStateIdentity?.()).rejects.toThrow();
      expect(f.commands.length).toBe(before);
    } finally {
      opened.close();
    }
  });

test('cleanup admission snapshots the original API before asynchronous Platform preparation', async () => {
  const f = await fixture(),
    original = f.args.platform.gcpObservations;
  if (!original) throw new Error('Synthetic Platform observations required');
  f.args.platform.gcpObservations = async (...args) => {
    const value = await original(...args);
    f.args.api = {
      exec: async () => {
        throw new Error('mutated foreign API');
      },
    };
    return value;
  };
  const opened = await openGcpCapturedCleanupRuntime(f.args);
  try {
    expect(opened.runtime.api).toBe(f.api);
  } finally {
    opened.close();
  }
});

test('cleanup refuses mutation of its originally returned storage directory', async () => {
  const f = await fixture(),
    opened = await openGcpCapturedCleanupRuntime(f.args);
  try {
    Object.assign(opened.runtime.store, { directory: `${dirname(f.directory)}-foreign` });
    await expect(opened.runtime.session.readStateIdentity?.()).rejects.toThrow('storage');
  } finally {
    opened.close();
  }
});
