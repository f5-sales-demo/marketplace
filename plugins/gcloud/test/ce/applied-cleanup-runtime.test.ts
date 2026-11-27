/** Source qualification: original files/shared runner with synthetic cloud and Platform effects. */
import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { Executor } from '../../../terraform/src/runner';
import { openGcpAppliedCleanupRuntime } from '../../src/ce/applied-cleanup-runtime';
import { fingerprint } from '../../src/ce/discovery';
import { readPublicTerraformCleanupOwnership } from '../../src/ce/terraform-public-teardown';
import { appliedSourceDurableFixture } from './applied-source-durable-fixtures';

async function fixture() {
  const f = await appliedSourceDurableFixture();
  const owner = {
    provider: 'gcp',
    engine: 'terraform',
    account: f.i.project,
    region: f.i.region,
    deploymentId: f.i.deploymentName,
  };
  let url = 'https://tenant.example.test',
    credential = 'synthetic-initial',
    available = true;
  let storeDirectory = dirname(f.directory);
  const commands: Parameters<Executor>[0][] = [],
    reads: string[][] = [];
  const apiExec = f.runtime.api.exec;
  f.runtime.api.exec = async (...args) => {
    reads.push(args[1]);
    return apiExec(...args);
  };
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
      return available
        ? {
            terraformEnvironment: async () => ({ XCSH_API_URL: url, XCSH_API_TOKEN: credential }),
            teardown: f.runtime.observePlatform,
          }
        : {};
    },
  } as unknown as CePlatformService;
  const args = {
    ...f.args(),
    platform,
    execute: (async (request) => {
      commands.push(request);
      if (request.args[0] === 'version') return { code: 0, stdout: JSON.stringify({ terraform_version: '1.17.2' }) };
      throw new Error('Unqualified fixture command');
    }) as Executor,
  };
  return {
    ...f,
    args,
    store,
    commands,
    reads,
    change: (mode: string) => {
      if (mode === 'credential') credential = 'synthetic-refreshed';
      if (mode === 'context') url = 'https://foreign.example.test';
      if (mode === 'storage') storeDirectory = dirname(storeDirectory);
      if (mode === 'unavailable') available = false;
      if (mode === 'closure') f.readerLive();
    },
  };
}

test('successful cleanup runtime opens the original shared runner and issued origin without create replay or failed flags', async () => {
  const f = await fixture(),
    opened = await openGcpAppliedCleanupRuntime(f.args);
  try {
    expect(opened.mode).toBe('original');
    expect((await opened.runtime.session.readStateIdentity?.())?.lineage).toBe(f.state.lineage);
    expect((await readPublicTerraformCleanupOwnership(opened.runtime, f.i)).original).toEqual(f.persisted.original);
    await expect(opened.runtime.session.apply(f.receipt, opened.runtime.environment)).rejects.toThrow();
    expect(f.commands).toEqual([]);
    expect(opened.runtime.appliedSourceTeardownOrigin?.executionAuthorized).toBe(false);
    expect(await Bun.file(join(f.directory, '.terraform-executor-lock/capture-unresolved.json')).exists()).toBe(false);
    expect(await Bun.file(join(dirname(f.directory), 'gcp-tf-public-deployment.json')).exists()).toBe(false);
  } finally {
    opened.close();
  }
});
test('successful cleanup refreshes normal Platform credentials and retires all shared session operations on close', async () => {
  const f = await fixture(),
    opened = await openGcpAppliedCleanupRuntime(f.args);
  f.change('credential');
  await opened.runtime.session.readStateIdentity?.();
  expect(opened.runtime.environment.XCSH_API_TOKEN).toBe('synthetic-refreshed');
  opened.close();
  await expect(opened.runtime.session.readStateIdentity?.()).rejects.toThrow('retired');
  await expect(
    opened.runtime.observePlatform(f.i.sites[0].name, `${f.i.sites[0].nodes[0].name}-token`),
  ).rejects.toThrow('retired');
});
for (const mode of ['context', 'storage', 'unavailable', 'closure'] as const)
  test(`successful cleanup rejects invalid original binding before observations: ${mode}`, async () => {
    const f = await fixture(),
      before = f.reads.length;
    f.change(mode);
    await expect(openGcpAppliedCleanupRuntime(f.args)).rejects.toThrow();
    expect(f.reads).toHaveLength(before);
    expect(f.commands).toEqual([]);
  });
for (const mode of ['context', 'storage', 'closure'] as const)
  test(`successful cleanup stops an opened shared session when original binding changes: ${mode}`, async () => {
    const f = await fixture(),
      opened = await openGcpAppliedCleanupRuntime(f.args);
    try {
      f.change(mode);
      await expect(opened.runtime.session.readStateIdentity?.()).rejects.toThrow();
      expect(f.commands).toEqual([]);
    } finally {
      opened.close();
    }
  });
test('successful cleanup preserves the original API across asynchronous Platform preparation', async () => {
  const f = await fixture(),
    original = f.args.platform.gcpObservations;
  if (!original) throw new Error('Synthetic Platform observation required');
  f.args.platform.gcpObservations = async (...args) => {
    const result = await original(...args);
    f.args.api = {
      exec: async () => {
        throw new Error('Foreign API');
      },
    };
    return result;
  };
  const opened = await openGcpAppliedCleanupRuntime(f.args);
  try {
    expect(opened.runtime.api).toBe(f.runtime.api);
  } finally {
    opened.close();
  }
});
test('successful cleanup rejects mutation of the originally returned storage', async () => {
  const f = await fixture(),
    opened = await openGcpAppliedCleanupRuntime(f.args);
  try {
    Object.assign(opened.runtime.store, { directory: `${dirname(f.directory)}-foreign` });
    await expect(opened.runtime.session.readStateIdentity?.()).rejects.toThrow();
  } finally {
    opened.close();
  }
});
test('successful cleanup runtime resumes interrupted deletion without replaying its applying receipt', async () => {
  const f = await fixture(),
    { recorded, receipt } = await f.review();
  await f.remove();
  await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }));
  const opened = await openGcpAppliedCleanupRuntime({ ...f.args, reviewReference: recorded.reference });
  try {
    expect(opened.mode).toBe('partial-replan-required');
    expect(opened.requiresNewReviewedPlan).toBe(true);
    await expect(opened.runtime.session.apply(receipt, opened.runtime.environment)).rejects.toThrow();
    expect(f.commands).toEqual([]);
  } finally {
    opened.close();
  }
});
test('completed successful cleanup resumes twice without Terraform commands or rewriting its original applying checkpoint', async () => {
  const f = await fixture(),
    { recorded, receipt } = await f.review();
  await f.remove(true);
  await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }));
  const before = await readFile(join(f.directory, 'plan-receipt.json'));
  for (let n = 0; n < 2; n++) {
    const opened = await openGcpAppliedCleanupRuntime({ ...f.args, reviewReference: recorded.reference });
    try {
      expect(opened.mode).toBe('completed-readonly');
      expect(opened.absent).toHaveLength(21);
      await opened.runtime.session.readStateIdentity?.();
      await expect(opened.runtime.session.apply(receipt, opened.runtime.environment)).rejects.toThrow();
    } finally {
      opened.close();
    }
  }
  expect(f.commands).toEqual([]);
  expect(await readFile(join(f.directory, 'plan-receipt.json'))).toEqual(before);
});
test('normal GCloud exports its successful cleanup runtime', async () => {
  const module = await import('../../src/index');
  expect(typeof module.openGcpAppliedCleanupRuntime).toBe('function');
});

test('successful cleanup refuses create planning, lifecycle revision and create reconciliation without changing its checkpoint', async () => {
  const f = await fixture(),
    opened = await openGcpAppliedCleanupRuntime(f.args);
  const before = await readFile(join(f.directory, 'plan-receipt.json'));
  try {
    await expect(opened.runtime.session.plan(opened.runtime.environment)).rejects.toThrow('cannot prepare');
    await expect(
      opened.runtime.session.planAction({ schemaVersion: 1, operation: 'repair' } as never, opened.runtime.environment),
    ).rejects.toThrow('cannot prepare');
    await expect(opened.runtime.session.reviseConfiguration(f.receipt.configurationSha256, '{}')).rejects.toThrow(
      'cannot prepare',
    );
    await expect(opened.runtime.session.reconcileApplyFromEvidence(f.receipt, 'a'.repeat(64))).rejects.toThrow(
      'cannot replay',
    );
    expect(f.commands).toEqual([]);
    expect(await readFile(join(f.directory, 'plan-receipt.json'))).toEqual(before);
  } finally {
    opened.close();
  }
});

test('successful cleanup refreshes the selected credential for real shared-runner output invocations', async () => {
  const f = await fixture(),
    commands: Parameters<Executor>[0][] = [];
  f.args.execute = async (request) => {
    commands.push(request);
    return {
      code: 0,
      stdout: JSON.stringify(
        request.args[0] === 'version'
          ? { terraform_version: '1.17.2' }
          : { result: { sensitive: false, type: 'string', value: 'original-output' } },
      ),
    };
  };
  const opened = await openGcpAppliedCleanupRuntime(f.args);
  try {
    f.change('credential');
    expect(await opened.runtime.session.readOutputs(['result'], opened.runtime.environment)).toEqual({
      result: 'original-output',
    });
    expect(commands.map((row) => row.args[0])).toEqual(['version', 'output']);
    for (const row of commands) {
      expect(row.env.XCSH_API_URL).toBe('https://tenant.example.test');
      expect(row.env.XCSH_API_TOKEN).toBe('synthetic-refreshed');
      expect(row.cwd).toBe(f.directory);
    }
  } finally {
    opened.close();
  }
});

test('successful cleanup discards execution output and permanently refuses the session after an endpoint changes', async () => {
  const f = await fixture(),
    commands: string[] = [];
  f.args.execute = async (request) => {
    commands.push(request.args[0]);
    f.change('context');
    return { code: 0, stdout: JSON.stringify({ terraform_version: '1.17.2' }) };
  };
  const opened = await openGcpAppliedCleanupRuntime(f.args);
  try {
    await expect(opened.runtime.session.readOutputs(['result'], opened.runtime.environment)).rejects.toThrow();
    await expect(opened.runtime.session.readStateIdentity?.()).rejects.toThrow();
    expect(commands).toEqual(['version']);
  } finally {
    opened.close();
  }
});

test('successful cleanup blocks observation when storage changes during selected-context inspection', async () => {
  const f = await fixture(),
    observe = f.args.platform.gcpObservations;
  if (!observe) throw new Error('Original synthetic observations required');
  let armed = false,
    calls = 0;
  f.args.platform.gcpObservations = async (...args) => {
    const original = await observe(...args);
    const readEnvironment = original.terraformEnvironment,
      teardown = original.teardown;
    if (!readEnvironment || !teardown) throw new Error('Synthetic original observation required');
    return {
      ...original,
      terraformEnvironment: async () => {
        const selected = await readEnvironment();
        if (armed) f.change('storage');
        return selected;
      },
      teardown: async (...values) => {
        calls++;
        return teardown(...values);
      },
    };
  };
  const opened = await openGcpAppliedCleanupRuntime(f.args),
    before = calls;
  try {
    armed = true;
    await expect(
      opened.runtime.observePlatform(f.i.sites[0].name, `${f.i.sites[0].nodes[0].name}-token`),
    ).rejects.toThrow();
    expect(calls).toBe(before);
  } finally {
    opened.close();
  }
});

test('completed successful cleanup refuses reconciliation that would rewrite the retained applying checkpoint', async () => {
  const f = await fixture(),
    { recorded, receipt } = await f.review();
  await f.remove(true);
  await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }));
  const before = await readFile(join(f.directory, 'plan-receipt.json'));
  const opened = await openGcpAppliedCleanupRuntime({ ...f.args, reviewReference: recorded.reference });
  try {
    await expect(opened.runtime.session.reconcileApplyFromEvidence(receipt, 'a'.repeat(64))).rejects.toThrow(
      'cannot replay',
    );
    expect(await readFile(join(f.directory, 'plan-receipt.json'))).toEqual(before);
    expect(f.commands).toEqual([]);
  } finally {
    opened.close();
  }
});
