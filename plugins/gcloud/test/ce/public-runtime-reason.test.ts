import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { Deployment } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { assertGcpTerraformRequestReason } from '../../src/ce/request-reason';
import { GCP_LEGACY_TERRAFORM_ARTIFACTS } from '../../src/ce/terraform-public-artifacts';
import { openPublicTerraformRuntime } from '../../src/ce/terraform-public-runtime';
import { type GcpTerraformInputs, openGcpTerraformSession } from '../../src/ce/terraform-session';
import type { GcloudExecApi } from '../../src/gcloud/exec';
import { intent } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true });
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-public-reason-')));
  roots.push(root);
  const i = intent();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  const opened: Array<{ deployment: Deployment; resume: unknown }> = [];
  const unused = async (): Promise<never> => {
    throw new Error('Unexpected session capability');
  };
  const session: TerraformSession = {
    readConfiguration: unused,
    readPlannedResourceFields: unused,
    readPlannedResourceIds: unused,
    readOutputs: unused,
    reviseConfiguration: unused,
    reconcileApplyFromEvidence: unused,
    planDestroy: unused,
    planAction: unused,
    plan: async () => {
      throw new Error('Unexpected cloud planning');
    },
    apply: async () => {
      throw new Error('Unexpected cloud submission');
    },
    googleAdcEnvironment: async () => ({ GOOGLE_APPLICATION_CREDENTIALS: '/private/example-adc.json' }),
  };
  const service: CeTerraformService = {
    open: async (_owner, deployment, resume) => {
      opened.push({ deployment, resume });
      return session;
    },
  };
  const platform = {
    storage: (owner: CeOwner) => CeDeploymentStore.open(root, owner),
    gcpObservations: async () => ({
      teardown: {},
      terraformEnvironment: async () => ({
        XCSH_API_URL: 'https://tenant.example.com',
        XCSH_API_TOKEN: 'example-private-token',
      }),
    }),
  } as unknown as CePlatformService;
  const api = {
    exec: async () => {
      throw new Error('Unexpected cloud CLI');
    },
  } as unknown as GcloudExecApi;
  return { i, opened, service, platform, api };
}

test('new public sessions persist one reviewed provider reason and resume it without regeneration', async () => {
  const f = await fixture();
  const first = await openPublicTerraformRuntime(f.platform, f.api, f.i, undefined, f.service);
  const saved = (await first.store.read('gcp-terraform-session-inputs.json')) as { inputs: GcpTerraformInputs };
  assertGcpTerraformRequestReason(saved.inputs.requestReason, f.i, '8.10.0');
  const config = JSON.parse(f.opened[0].deployment.configuration);
  expect(config.provider.google[0].request_reason).toBe(saved.inputs.requestReason?.reason);
  const second = await openPublicTerraformRuntime(f.platform, f.api, f.i, undefined, f.service);
  expect(f.opened[1].resume).toBe('current');
  expect(f.opened[1].deployment.configuration).toBe(f.opened[0].deployment.configuration);
  expect(await second.store.read('gcp-terraform-session-inputs.json')).toEqual(saved);
});

test('legacy public sessions retain absent attribution and exact original provider bytes', async () => {
  const f = await fixture();
  if (!GCP_LEGACY_TERRAFORM_ARTIFACTS) throw new Error('Pinned public source artifacts required');
  await openGcpTerraformSession(f.platform, { ...GCP_LEGACY_TERRAFORM_ARTIFACTS, intent: f.i }, false, f.service);
  const old = f.opened[0].deployment.configuration;
  expect(f.opened[0].deployment.terraformVersion).toBe('1.16.6');
  expect(old).not.toContain('request_reason');
  const resumed = await openPublicTerraformRuntime(f.platform, f.api, f.i, undefined, f.service);
  expect(f.opened[1].deployment.configuration).toBe(old);
  expect(f.opened[1].deployment.terraformVersion).toBe('1.16.6');
  const saved = (await resumed.store.read('gcp-terraform-session-inputs.json')) as { inputs: GcpTerraformInputs };
  expect(saved.inputs.requestReason).toBeUndefined();
});

test('stored reason replacement cannot open another runtime or change the original identity receipt', async () => {
  const f = await fixture();
  const first = await openPublicTerraformRuntime(f.platform, f.api, f.i, undefined, f.service);
  const identity = await first.store.read('gcp-terraform-input-identity.json');
  const saved = (await first.store.read('gcp-terraform-session-inputs.json')) as { inputs: GcpTerraformInputs };
  const originalReason = saved.inputs.requestReason;
  assertGcpTerraformRequestReason(originalReason, f.i, '8.10.0');
  await first.store.write('gcp-terraform-session-inputs.json', {
    ...saved,
    inputs: {
      ...saved.inputs,
      requestReason: { ...originalReason, reason: 'xcsh-gcp-11111111-2222-4333-8444-555555555555' },
    },
  });
  await expect(openPublicTerraformRuntime(f.platform, f.api, f.i, undefined, f.service)).rejects.toThrow(
    'resume input identity',
  );
  expect(f.opened).toHaveLength(1);
  expect(await first.store.read('gcp-terraform-input-identity.json')).toEqual(identity);
});

test('caller intent mutation during storage acquisition cannot redirect the original request scope', async () => {
  const f = await fixture();
  const original = structuredClone(f.i);
  const storage = f.platform.storage;
  f.platform.storage = async (owner) => {
    f.i.platformContext = 'example-mutated-context';
    return storage(owner);
  };
  const runtime = await openPublicTerraformRuntime(f.platform, f.api, f.i, undefined, f.service);
  const saved = (await runtime.store.read('gcp-terraform-input-identity.json')) as {
    intent: typeof original;
    platformContext: string;
  };
  expect(saved.intent).toEqual(original);
  expect(saved.platformContext).toBe(original.platformContext);
  const inputs = (await runtime.store.read('gcp-terraform-session-inputs.json')) as { inputs: GcpTerraformInputs };
  assertGcpTerraformRequestReason(inputs.inputs.requestReason, original, '8.10.0');
});
