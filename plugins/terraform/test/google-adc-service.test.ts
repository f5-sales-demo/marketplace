import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import type { Deployment, Invocation } from '../src/runner';
import { createCeTerraformService, type GoogleAdcPolicy, type TerraformSession } from '../src/service';

async function adcEnvironment(session: TerraformSession) {
  if (!session.googleAdcEnvironment) throw new Error('Trusted ADC session capability missing');
  return session.googleAdcEnvironment();
}
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'google-adc-service-'));
  roots.push(root);
  const owner: CeOwner = {
    deploymentId: 'ce-fixture',
    engine: 'terraform',
    provider: 'gcp',
    account: 'example-project',
    region: 'us-central1',
  };
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: owner.deploymentId,
    engine: 'terraform',
    scope: { cloud: 'gcp', account: owner.account, region: owner.region },
    terraformVersion: '1.16.6',
    configuration: '{}',
    providerLock: '# fixture',
    backendIdentity: 'local:ce-fixture',
  };
  const platform = { storage: (o: CeOwner) => CeDeploymentStore.open(root, o) } as CePlatformService;
  let acquired = 0;
  let latched = false;
  const calls: Invocation[] = [];
  const policy: GoogleAdcPolicy = {
    accountSha256: hash('principal@example.com'),
    audienceSha256: hash('fixture-client'),
    qualificationSha256: hash('reviewed-linux-expiry'),
    acquire: async ({ directory }) => {
      acquired++;
      const snapshotPath = join(directory, 'adc.private.json');
      const bytes = JSON.stringify({
        type: 'authorized_user',
        client_id: 'fixture-client',
        client_secret: 'synthetic-secret',
        refresh_token: 'synthetic-refresh',
      });
      await writeFile(snapshotPath, bytes, { mode: 0o400, flag: 'wx' });
      const verifiedAt = Date.now();
      return {
        schemaVersion: 1,
        kind: 'google-adc-snapshot',
        owner,
        snapshotPath,
        snapshotSha256: hash(bytes),
        accountSha256: policy.accountSha256,
        audienceSha256: policy.audienceSha256,
        qualificationSha256: policy.qualificationSha256,
        authenticationReceiptSha256: hash('fresh-auth'),
        verifiedAt,
        expiresNoEarlierThan: verifiedAt + 3600000,
        closeAfterExecutorExit: async () => {},
        assertOriginal: async () => {
          if (latched) throw new Error('latched original monitor');
        },
      };
    },
  };
  const execute = async (request: Invocation) => {
    calls.push(request);
    throw new Error('fixture execution stopped');
  };
  return {
    owner,
    deployment,
    platform,
    policy,
    execute,
    calls,
    acquired: () => acquired,
    latch: () => {
      latched = true;
    },
  };
}
test('selected trusted policy exposes one snapshot and rejects static caller credentials before execution', async () => {
  const f = await fixture();
  const service = createCeTerraformService(async () => f.platform, { execute: f.execute, googleAdc: f.policy });
  const session = await service.open(f.owner, f.deployment, false);
  expect(typeof session.googleAdcEnvironment).toBe('function');
  const [first, second] = await Promise.all([adcEnvironment(session), adcEnvironment(session)]);
  expect(first).toEqual(second);
  expect(f.acquired()).toBe(1);
  await expect(session.plan({ GOOGLE_OAUTH_ACCESS_TOKEN: 'synthetic-static' })).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});

test('trusted installed resolver selects and freezes a separate runtime for each owning session', async () => {
  const first = await fixture();
  const second = await fixture();
  second.owner.account = 'second-project';
  second.deployment.scope.account = 'second-project';
  const requested: string[] = [];
  const options = {
    resolveRuntime: async (request: { owner: CeOwner; deployment: Deployment; directory: string }) => {
      requested.push(request.owner.account);
      const selected = request.owner.account === first.owner.account ? first : second;
      request.owner.account = 'foreign-after-resolution';
      request.deployment.configuration = 'foreign-after-resolution';
      return { googleAdc: selected.policy, execute: selected.execute };
    },
  };
  const service = createCeTerraformService(async () => first.platform, options);
  options.resolveRuntime = async () => {
    throw new Error('substituted resolver');
  };
  const a = await service.open(first.owner, first.deployment, false);
  const b = await service.open(second.owner, second.deployment, false);
  const [one, two] = await Promise.all([adcEnvironment(a), adcEnvironment(b)]);
  expect(one.GOOGLE_APPLICATION_CREDENTIALS).not.toBe(two.GOOGLE_APPLICATION_CREDENTIALS);
  expect(requested).toEqual(['example-project', 'second-project']);
  expect(first.acquired()).toBe(1);
  expect(second.acquired()).toBe(1);
  expect(first.owner.account).toBe('example-project');
  expect(second.owner.account).toBe('second-project');
  expect(await a.readConfiguration(hash('{}'))).toBe('{}');
  expect(await b.readConfiguration(hash('{}'))).toBe('{}');
});

test('a resolved ADC policy requires its own executor before preparing a deployment', async () => {
  const f = await fixture();
  const service = createCeTerraformService(async () => f.platform, {
    resolveRuntime: async () => ({ googleAdc: f.policy }),
  });
  await expect(service.open(f.owner, f.deployment, false)).rejects.toThrow('qualified original-lifetime executor');
  expect(f.acquired()).toBe(0);
  expect(f.calls).toHaveLength(0);
});

test('owner validation precedes runtime resolution and legacy resolution retains static cleanup credentials', async () => {
  const f = await fixture();
  let selected = 0;
  const service = createCeTerraformService(async () => f.platform, {
    resolveRuntime: async () => {
      selected++;
      return { execute: f.execute };
    },
  });
  await expect(service.open({ ...f.owner, engine: 'native' }, f.deployment, true)).rejects.toThrow('ownership');
  expect(selected).toBe(0);
  const session = await service.open(f.owner, f.deployment, false);
  expect(session.googleAdcEnvironment).toBeUndefined();
  await expect(session.plan({ GOOGLE_OAUTH_ACCESS_TOKEN: 'legacy-static' })).rejects.toThrow(
    'fixture execution stopped',
  );
  expect(f.calls[0].env.GOOGLE_OAUTH_ACCESS_TOKEN).toBe('legacy-static');
});
test('original monitor is checked around actual execution and refuses later calls without resubmission', async () => {
  const f = await fixture();
  const service = createCeTerraformService(async () => f.platform, {
    googleAdc: f.policy,
    execute: async (request) => {
      f.calls.push(request);
      f.latch();
      return { code: 0, stdout: JSON.stringify({ terraform_version: '1.16.6' }) };
    },
  });
  const session = await service.open(f.owner, f.deployment, false);
  await expect(session.plan({})).rejects.toThrow();
  expect(f.calls).toHaveLength(1);
  await expect(session.plan({})).rejects.toThrow();
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].env.GOOGLE_APPLICATION_CREDENTIALS).toContain('adc.private.json');
});
test('policy selection cannot be redirected after service construction', async () => {
  const f = await fixture();
  const options = { execute: f.execute, googleAdc: { ...f.policy } };
  const service = createCeTerraformService(async () => f.platform, options);
  options.googleAdc.acquire = async () => {
    throw new Error('substituted factory');
  };
  options.googleAdc.qualificationSha256 = hash('foreign');
  const session = await service.open(f.owner, f.deployment, false);
  expect(await adcEnvironment(session)).toHaveProperty('GOOGLE_APPLICATION_CREDENTIALS');
  await expect(session.plan({})).rejects.toThrow('fixture execution stopped');
  expect(f.calls).toHaveLength(1);
});
test('ADC policy requires an explicit trusted executor and legacy service keeps its original capability', async () => {
  const f = await fixture();
  expect(() => createCeTerraformService(async () => f.platform, { googleAdc: f.policy })).toThrow();
  const service = createCeTerraformService(async () => f.platform, { execute: f.execute });
  const legacy = await service.open(f.owner, f.deployment, false);
  expect(legacy.googleAdcEnvironment).toBeUndefined();
  await expect(legacy.plan({ GOOGLE_OAUTH_ACCESS_TOKEN: 'synthetic-static' })).rejects.toThrow(
    'fixture execution stopped',
  );
  expect(f.calls[0].env.GOOGLE_OAUTH_ACCESS_TOKEN).toBe('synthetic-static');
});

async function closeAdc(session: TerraformSession) {
  if (!session.closeGoogleAdc) throw new Error('Trusted ADC close capability missing');
  await session.closeGoogleAdc();
}
test('close capability never acquires an unused credential lease or enables later commands', async () => {
  const f = await fixture();
  const service = createCeTerraformService(async () => f.platform, { googleAdc: f.policy, execute: f.execute });
  const session = await service.open(f.owner, f.deployment, false);
  await closeAdc(session);
  expect(f.acquired()).toBe(0);
  await expect(adcEnvironment(session)).rejects.toThrow();
  await expect(session.plan({})).rejects.toThrow();
  expect(f.acquired()).toBe(0);
  expect(f.calls).toHaveLength(0);
  expect(await session.readConfigurationSha256?.()).toMatch(/^[a-f0-9]{64}$/);
});
test('concurrent disposal cannot release an in-flight original invocation or admit another', async () => {
  const f = await fixture();
  let closures = 0;
  const originalAcquire = f.policy.acquire;
  f.policy.acquire = async (request) => ({
    ...(await originalAcquire(request)),
    closeAfterExecutorExit: async () => {
      closures++;
    },
  });
  let started: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let complete: (() => void) | undefined;
  const finished = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const service = createCeTerraformService(async () => f.platform, {
    googleAdc: f.policy,
    execute: async (request) => {
      f.calls.push(request);
      started?.();
      await finished;
      throw new Error('original fixture command completed');
    },
  });
  const session = await service.open(f.owner, f.deployment, false);
  const operation = session.plan({});
  const outcome = operation.then(
    () => new Error('original fixture unexpectedly succeeded'),
    (error) => error,
  );
  let fallbackReleased = false;
  const reserve = setTimeout(() => {
    fallbackReleased = true;
    complete?.();
  }, 1000);
  await Promise.race([
    entered,
    outcome.then((error) => {
      throw error;
    }),
  ]);
  try {
    await expect(closeAdc(session)).rejects.toThrow('in flight');
    expect(closures).toBe(0);
    await expect(adcEnvironment(session)).rejects.toThrow();
    await expect(session.plan({})).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
  } finally {
    complete?.();
    clearTimeout(reserve);
  }
  const failure = await outcome;
  expect(failure.message).toBe('original fixture command completed');
  expect(fallbackReleased).toBe(false);
  await Promise.all([closeAdc(session), closeAdc(session)]);
  expect(closures).toBe(1);
  expect(f.acquired()).toBe(1);
});
test('unresolved closure retains the original lease and retires further execution across retry', async () => {
  const f = await fixture();
  let closed = false;
  let closureChecks = 0;
  const originalAcquire = f.policy.acquire;
  f.policy.acquire = async (request) => ({
    ...(await originalAcquire(request)),
    closeAfterExecutorExit: async () => {
      closureChecks++;
      if (!closed) throw new Error('original group unresolved');
    },
  });
  const service = createCeTerraformService(async () => f.platform, { googleAdc: f.policy, execute: f.execute });
  const session = await service.open(f.owner, f.deployment, false);
  await adcEnvironment(session);
  await expect(closeAdc(session)).rejects.toThrow('unresolved');
  await expect(session.plan({})).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect(f.acquired()).toBe(1);
  closed = true;
  await Promise.all([closeAdc(session), closeAdc(session)]);
  expect(closureChecks).toBe(2);
  expect(f.acquired()).toBe(1);
});

test('failed ADC admission retains a closure path without reacquiring or submitting', async () => {
  const f = await fixture();
  let closures = 0;
  const originalAcquire = f.policy.acquire;
  f.policy.acquire = async (request) => ({
    ...(await originalAcquire(request)),
    audienceSha256: hash('foreign-client'),
    closeAfterExecutorExit: async () => {
      closures++;
    },
  });
  const service = createCeTerraformService(async () => f.platform, { googleAdc: f.policy, execute: f.execute });
  const session = await service.open(f.owner, f.deployment, false);
  await expect(adcEnvironment(session)).rejects.toThrow();
  await closeAdc(session);
  await closeAdc(session);
  expect(closures).toBe(1);
  expect(f.acquired()).toBe(1);
  expect(f.calls).toHaveLength(0);
});

test('both original execution and final verification failures remain attributed', async () => {
  const f = await fixture();
  const original = new Error('original execution failed');
  const service = createCeTerraformService(async () => f.platform, {
    googleAdc: f.policy,
    execute: async (request) => {
      f.calls.push(request);
      f.latch();
      throw original;
    },
  });
  const session = await service.open(f.owner, f.deployment, false);
  const outcome = await session.plan({}).catch((error) => error);
  expect(outcome).toBeInstanceOf(AggregateError);
  expect(outcome.errors[0]).toBe(original);
  expect(outcome.errors[1].message).toContain('verification failed');
  expect(f.calls).toHaveLength(1);
});
