import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../platform/src/ce/service';
import { cancelUnsubmittedF5Resource } from '../src/f5-cancellation';
import { executeF5TerraformResource } from '../src/f5-resources';
import { retireF5TerraformStage } from '../src/f5-retirement';
import type { Deployment, PlanReceipt } from '../src/runner';
import type { CeTerraformService } from '../src/service';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const owner = {
  deploymentId: 'ce',
  engine: 'terraform' as const,
  provider: 'aws' as const,
  account: '123456789012',
  region: 'us-east-1',
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'f5-retirement-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, owner);
  await store.write('terraform-authorization.json', {
    schemaVersion: 1,
    engine: 'terraform',
    mutations: true,
    planSha256: 'a'.repeat(64),
    f5StateOwner: 'terraform',
  });
  let configuration = '',
    plans = 0,
    retirements = 0,
    interrupted = false;
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: 'ce',
    backendIdentity: 'local:ce:stage:f5-resources',
    configurationSha256: '',
    providerLockSha256: '',
    noChanges: true,
    changes: [],
    planSha256: 'c'.repeat(64),
  } as PlanReceipt;
  const service = {
    open: async (_owner: unknown, deployment: Deployment, resume: unknown) => {
      expect(_owner).toEqual(owner);
      expect(deployment.stage).toBe('f5-resources');
      expect(resume).toBe('current');
      configuration = deployment.configuration;
      receipt.configurationSha256 = sha(configuration);
      receipt.providerLockSha256 = sha(deployment.providerLock);
      return {
        readConfigurationSha256: async () => receipt.configurationSha256,
        plan: async () => {
          plans++;
          return structuredClone(receipt);
        },
        retireArtifacts: async (r: PlanReceipt, digest: string) => {
          expect(r).toEqual(receipt);
          expect(digest).toBe('b'.repeat(64));
          retirements++;
          if (interrupted) {
            interrupted = false;
            throw Error('interrupted removal');
          }
          return {
            status: 'runner-artifacts-retired',
            evidenceSha256: digest,
            finalPlanSha256: r.planSha256,
            manifestSha256: 'd'.repeat(64),
            inventorySha256: 'e'.repeat(64),
            retiredArtifacts: 9,
          };
        },
      };
    },
  } as unknown as CeTerraformService;
  const platform = {
    storage: async () => store,
    providerEnvironment: async () => {
      throw Error('No credentials permitted');
    },
  } as unknown as CePlatformService;
  // Initialize the exact empty bookkeeping from the owning deployment template.
  const { f5StageDeployment } = await import('../src/f5-retirement');
  const deployment = await f5StageDeployment(owner);
  await store.write('terraform-f5-resources.json', {
    schemaVersion: 1,
    owner,
    resources: {},
    configurationSha256: sha(deployment.configuration),
  });
  return {
    store,
    platform,
    service,
    receipt,
    counts: () => ({ plans, retirements }),
    interrupt: () => {
      interrupted = true;
    },
  };
}
test('F5 stage retirement persists bound checkpoint before removal and resumes without replanning', async () => {
  const f = await fixture();
  f.interrupt();
  await expect(
    retireF5TerraformStage(f.platform, f.service, owner, 'a'.repeat(64), 'b'.repeat(64), {}),
  ).rejects.toThrow('interrupted');
  const checkpoint = (await f.store.read('terraform-f5-stage-retirement.json')) as Record<string, unknown>;
  expect(checkpoint.status).toBe('retiring');
  expect(f.counts()).toEqual({ plans: 1, retirements: 1 });
  const result = await retireF5TerraformStage(f.platform, f.service, owner, 'a'.repeat(64), 'b'.repeat(64), {});
  expect(result.status).toBe('runner-artifacts-retired');
  expect(f.counts()).toEqual({ plans: 1, retirements: 2 });
  await retireF5TerraformStage(f.platform, f.service, owner, 'a'.repeat(64), 'b'.repeat(64), {});
  expect(f.counts().plans).toBe(1);
  await expect(
    retireF5TerraformStage(f.platform, f.service, owner, 'a'.repeat(64), 'f'.repeat(64), {}),
  ).rejects.toThrow();
});
test('F5 stage retirement rejects populated, pending, foreign, malformed or changed bookkeeping before planning', async () => {
  for (const mode of [
    'resource',
    'pending',
    'owner',
    'hash',
    'missing',
    'cancellation',
    'authorization',
    'digest',
    'aborted',
  ]) {
    const f = await fixture();
    const book = (await f.store.read('terraform-f5-resources.json')) as Record<string, unknown>;
    if (mode === 'resource') book.resources = { private: {} };
    if (mode === 'pending') book.pending = {};
    if (mode === 'owner') book.owner = { ...owner, account: 'example-foreign-account' };
    if (mode === 'hash') book.configurationSha256 = 'f'.repeat(64);
    if (mode === 'missing') book.resources = undefined;
    await f.store.write('terraform-f5-resources.json', book);
    if (mode === 'cancellation') await f.store.write('terraform-f5-cancellation-pending.json', {});
    if (mode === 'authorization') await f.store.write('terraform-authorization.json', { mutations: true });
    await expect(
      retireF5TerraformStage(
        f.platform,
        f.service,
        owner,
        'a'.repeat(64),
        mode === 'digest' ? 'unresolved' : 'b'.repeat(64),
        {},
        mode === 'aborted' ? AbortSignal.abort() : undefined,
      ),
    ).rejects.toThrow();
    expect(f.counts()).toEqual({ plans: 0, retirements: 0 });
  }
});
test('F5 writes and reconciliation reject terminal stage checkpoint before credentials or provider open', async () => {
  const f = await fixture();
  f.interrupt();
  await expect(
    retireF5TerraformStage(f.platform, f.service, owner, 'a'.repeat(64), 'b'.repeat(64), {}),
  ).rejects.toThrow();
  for (const method of ['DELETE', 'RECONCILE', 'RECONCILE_OBSERVED', 'CANCEL_UNSUBMITTED'])
    await expect(
      executeF5TerraformResource(f.platform, f.service, owner, '/api/config/namespaces/system/securemesh_site_v2s/ce', {
        method,
      }),
    ).rejects.toThrow('retirement');
});

test('F5 retirement rejects mutating or unbound final plans and changed bookkeeping before checkpoint', async () => {
  for (const mode of ['changes', 'operation', 'configuration', 'provider', 'backend', 'partial', 'changed-book']) {
    const f = await fixture();
    if (mode === 'changes') f.receipt.changes = [{}] as never;
    if (mode === 'operation') f.receipt.operation = 'destroy';
    if (mode === 'backend') f.receipt.backendIdentity = 'local:foreign';
    if (mode === 'partial') f.receipt.noChanges = false;
    const open = f.service.open.bind(f.service);
    f.service.open = async (...args) => {
      const session = await open(...args);
      const plan = session.plan.bind(session);
      session.plan = async (...params) => {
        const receipt = await plan(...params);
        if (mode === 'configuration') receipt.configurationSha256 = 'f'.repeat(64);
        if (mode === 'provider') receipt.providerLockSha256 = 'f'.repeat(64);
        if (mode === 'changed-book') await f.store.write('terraform-f5-resources.json', {});
        return receipt;
      };
      return session;
    };
    await expect(
      retireF5TerraformStage(f.platform, f.service, owner, 'a'.repeat(64), 'b'.repeat(64), {}),
    ).rejects.toThrow();
    expect(f.counts().retirements).toBe(0);
    await expect(f.store.read('terraform-f5-stage-retirement.json')).rejects.toThrow();
  }
});

test('F5 retirement refuses forged checkpoint before opening a provider session', async () => {
  const f = await fixture();
  f.interrupt();
  await expect(
    retireF5TerraformStage(f.platform, f.service, owner, 'a'.repeat(64), 'b'.repeat(64), {}),
  ).rejects.toThrow();
  const checkpoint = (await f.store.read('terraform-f5-stage-retirement.json')) as Record<string, unknown>;
  await f.store.write('terraform-f5-stage-retirement.json', { ...checkpoint, evidenceSha256: 'f'.repeat(64) });
  f.service.open = async () => {
    throw Error('FORBIDDEN_PROVIDER_OPEN');
  };
  await expect(
    retireF5TerraformStage(f.platform, f.service, owner, 'a'.repeat(64), 'b'.repeat(64), {}),
  ).rejects.toThrow('checkpoint differs');
});

test('direct F5 cancellation cannot bypass retirement execution barrier', async () => {
  const f = await fixture();
  await f.store.write('terraform-f5-stage-retirement.json', { status: 'retiring' });
  await expect(cancelUnsubmittedF5Resource(f.platform, f.service, owner)).rejects.toThrow('retirement');
  expect(f.counts()).toEqual({ plans: 0, retirements: 0 });
});
