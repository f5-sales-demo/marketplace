import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GCP_TERRAFORM1171_ARTIFACTS } from '../../gcloud/src/ce/terraform-public-artifacts';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { originalGcpBootstrapSource } from '../../platform/src/ce/gcp-bootstrap-evidence';
import { createGcpLifecycleHttpPort } from '../../platform/src/ce/gcp-http';
import { openGcpLifecycleHttpCapture } from '../../platform/src/ce/gcp-http-capture';
import {
  collectOriginalGcpTerraformBootstrap,
  collectOriginalGcpTerraformBootstrapV2,
  readOriginalGcpTerraformBootstrapJwt,
} from '../src/gcp-bootstrap-evidence';
import type { AppliedResourceProjection, PlanReceipt } from '../src/runner';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
interface Json {
  metadata: { name: string; namespace: string; labels: Record<string, string> };
  system_metadata: { uid: string };
  spec: { gcp?: unknown; site_name?: string; type?: number; content?: string };
}
function resource(state: AppliedResourceProjection, address: string) {
  const value = state.resources[address];
  if (!value) throw new Error('Synthetic resource required');
  return value;
}
async function fixture(
  change: (values: { site: Json; token: Json; state: AppliedResourceProjection; plan: PlanReceipt }) => void = () => {},
) {
  if (!GCP_TERRAFORM1171_ARTIFACTS) throw new Error('Qualified artifact profile required');
  const owner = {
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'bootstrap-owner',
  };
  const binding = {
    owner,
    deploymentName: 'deploy-a',
    siteName: 'site-a',
    nodeName: 'node-a',
    tokenName: 'node-a-token',
  };
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
    Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    Buffer.from('synthetic-signature').toString('base64url'),
  ].join('.');
  const site: Json = {
    metadata: {
      name: 'site-a',
      namespace: 'system',
      labels: { 'xcsh-deployment': 'deploy-a', 'xcsh-engine': 'terraform', 'ves.io/provider': 'ves-io-GOOGLE' },
    },
    system_metadata: { uid: 'site-resource-original' },
    spec: { gcp: { not_managed: { node_list: [] } } },
  };
  const token: Json = {
    metadata: {
      name: 'node-a-token',
      namespace: 'system',
      labels: { 'xcsh-deployment': 'deploy-a', 'xcsh-engine': 'terraform', 'xcsh-node': 'node-a' },
    },
    system_metadata: { uid: 'token-resource-original' },
    spec: { site_name: 'site-a', type: 1, content: jwt },
  };
  const siteAddress = 'xcsh_securemesh_site_v2.site_a',
    tokenAddress = 'xcsh_token.node_a';
  const plan: PlanReceipt = {
    schemaVersion: 1,
    deploymentId: owner.deploymentId,
    engine: 'terraform',
    backendIdentity: `local:${owner.deploymentId}`,
    configurationSha256: hash('configuration'),
    providerLockSha256: hash(GCP_TERRAFORM1171_ARTIFACTS.providerLock),
    planSha256: hash('saved-plan'),
    changes: [
      { address: siteAddress, type: 'xcsh_securemesh_site_v2', actions: ['create'] },
      { address: tokenAddress, type: 'xcsh_token', actions: ['create'] },
    ],
    noChanges: false,
  };
  const state: AppliedResourceProjection = {
    schemaVersion: 1,
    planSha256: plan.planSha256,
    stateSha256: hash('original-applied-state'),
    lineage: 'original-lineage',
    serial: 3,
    resources: {
      [siteAddress]: {
        name: 'site-a',
        namespace: 'system',
        labels: { 'xcsh-deployment': 'deploy-a', 'xcsh-engine': 'terraform' },
        creation_identity_sha256: `sha256:${hash(site.system_metadata.uid)}`,
      },
      [tokenAddress]: {
        name: 'node-a-token',
        namespace: 'system',
        labels: token.metadata.labels,
        creation_identity_sha256: `sha256:${hash(token.system_metadata.uid)}`,
        site_name: 'site-a',
        type: 1,
      },
    },
  };
  change({ site, token, state, plan });
  const root = await mkdtemp(join(tmpdir(), 'gcp-terraform-bootstrap-'));
  const store = await CeDeploymentStore.open(root, owner);
  const capture = await openGcpLifecycleHttpCapture(store, async () => {}, {
    siteNames: ['site-a'],
    tokenNames: ['node-a-token'],
  });
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async (url) => Response.json(String(url).includes('/tokens/') ? token : site),
    capture,
  );
  const siteValue = await port.read('/api/config/namespaces/system/securemesh_site_v2s/site-a'),
    tokenValue = await port.read('/api/register/namespaces/system/tokens/node-a-token');
  if (!siteValue || !tokenValue) throw new Error('Original synthetic source values required');
  const siteBody = await capture.read(capture.evidenceFor(siteValue)),
    tokenBody = await capture.read(capture.evidenceFor(tokenValue));
  const calls: Array<{ receipt: PlanReceipt; selections: Record<string, string[]> }> = [];
  const input = {
    platform: originalGcpBootstrapSource,
    binding,
    receipt: plan,
    terraformVersion: '1.17.1',
    environment: {},
    site: siteBody,
    token: tokenBody,
    reader: {
      async readAppliedResourceFields(receipt: PlanReceipt, selections: Record<string, string[]>) {
        calls.push({ receipt, selections });
        return state;
      },
    },
  };
  return { input, state, jwt, calls };
}

it('joins original API UIDs through creation hashes while keeping provider-added labels and JWT private', async () => {
  const run = await fixture();
  const value = await collectOriginalGcpTerraformBootstrap(run.input);
  expect(value.creationOwnershipCorroborated).toBe(true);
  expect(value.gcpWireCorroborated).toBe(true);
  expect(value.bootstrapOwnershipQualified).toBe(false);
  expect(value.bootstrap.tokenUid).toBe('token-resource-original');
  expect(JSON.stringify(value)).not.toContain(run.jwt);
  expect(await readOriginalGcpTerraformBootstrapJwt(value)).toBe(run.jwt);
  expect(run.calls).toHaveLength(2);
  expect(run.calls[0].receipt).toEqual(run.input.receipt);
  expect(Object.values(run.calls[0].selections).flat()).not.toContain('uid');
  expect(Object.values(run.calls[0].selections).flat()).not.toContain('content');
  await expect(readOriginalGcpTerraformBootstrapJwt({ ...value })).rejects.toThrow('Original');
});

it('rejects replaced API identities, missing creation hashes and credential material used as identity', async () => {
  for (const change of [
    (x: { site: Json }) => {
      x.site.system_metadata.uid = 'replacement';
    },
    (x: { token: Json }) => {
      x.token.system_metadata.uid = 'replacement';
    },
    (x: { state: AppliedResourceProjection }) => {
      resource(x.state, 'xcsh_token.node_a').creation_identity_sha256 = null;
    },
    (x: { state: AppliedResourceProjection; token: Json }) => {
      resource(x.state, 'xcsh_token.node_a').creation_identity_sha256 = `sha256:${hash(String(x.token.spec.content))}`;
    },
  ]) {
    const run = await fixture(change);
    await expect(collectOriginalGcpTerraformBootstrap(run.input)).rejects.toThrow('creation');
  }
});

it('requires all owned labels and the exact Google platform marker without accepting foreign labels', async () => {
  for (const change of [
    (x: { site: Json }) => {
      x.site.metadata.labels['ves.io/provider'] = 'ves-io-AZURE';
    },
    (x: { site: Json }) => {
      delete x.site.metadata.labels['ves.io/provider'];
    },
    (x: { site: Json }) => {
      x.site.metadata.labels['foreign-owner'] = 'foreign';
    },
    (x: { token: Json }) => {
      x.token.metadata.labels['xcsh-node'] = 'foreign';
    },
    (x: { state: AppliedResourceProjection }) => {
      resource(x.state, 'xcsh_securemesh_site_v2.site_a').labels = {
        'xcsh-deployment': 'foreign',
        'xcsh-engine': 'terraform',
      };
    },
  ]) {
    const run = await fixture(change);
    await expect(collectOriginalGcpTerraformBootstrap(run.input)).rejects.toThrow();
  }
});

it('refuses managed or malformed GCP wire forms rather than inferring GCP from labels alone', async () => {
  for (const gcp of [
    { managed: {} },
    { not_managed: {} },
    { not_managed: { node_list: 'invalid' } },
    { not_managed: { node_list: [] }, managed: {} },
  ]) {
    const run = await fixture((x) => {
      x.site.spec.gcp = gcp;
    });
    await expect(collectOriginalGcpTerraformBootstrap(run.input)).rejects.toThrow('GCP');
  }
});

it('refuses stale plan/state joins, absent resources and unknown provider profiles', async () => {
  for (const change of [
    (x: { state: AppliedResourceProjection }) => {
      x.state.planSha256 = hash('different-plan');
    },
    (x: { state: AppliedResourceProjection }) => {
      x.state.resources['xcsh_token.node_a'] = null;
    },
    (x: { plan: PlanReceipt }) => {
      x.plan.deploymentId = 'foreign-owner';
    },
    (x: { plan: PlanReceipt }) => {
      x.plan.providerLockSha256 = hash('unqualified-provider-lock');
    },
  ]) {
    const run = await fixture(change);
    await expect(collectOriginalGcpTerraformBootstrap(run.input)).rejects.toThrow();
  }
});

it('retains original body capabilities, strict JWT expiry and reader failure refusal', async () => {
  const run = await fixture();
  await expect(collectOriginalGcpTerraformBootstrap({ ...run.input, site: { ...run.input.site } })).rejects.toThrow(
    'Original',
  );
  const expired = await fixture((x) => {
    x.token.spec.content = [
      Buffer.from('{}').toString('base64url'),
      Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) })).toString('base64url'),
      Buffer.from('synthetic-signature').toString('base64url'),
    ].join('.');
  });
  await expect(collectOriginalGcpTerraformBootstrap(expired.input)).rejects.toThrow('JWT');
  await expect(
    collectOriginalGcpTerraformBootstrap({
      ...run.input,
      reader: {
        async readAppliedResourceFields() {
          throw new Error('original state unavailable');
        },
      },
    }),
  ).rejects.toThrow('state unavailable');
});

it('refuses applied state replacement during original bootstrap collection', async () => {
  const run = await fixture();
  let calls = 0;
  const reader = {
    async readAppliedResourceFields() {
      calls++;
      const value = structuredClone(run.state);
      if (calls > 1) {
        value.stateSha256 = hash('replacement-state');
        value.serial++;
      }
      return value;
    },
  };
  await expect(collectOriginalGcpTerraformBootstrap({ ...run.input, reader })).rejects.toThrow('state changed');
});

it('rechecks JWT freshness after the final original state read', async () => {
  const originalNow = Date.now;
  const run = await fixture((x) => {
    x.token.spec.content = [
      Buffer.from('{}').toString('base64url'),
      Buffer.from(JSON.stringify({ exp: Math.floor(originalNow() / 1000) + 120 })).toString('base64url'),
      Buffer.from('synthetic-signature').toString('base64url'),
    ].join('.');
  });
  let calls = 0;
  const reader = {
    async readAppliedResourceFields() {
      calls++;
      if (calls > 1) Date.now = () => originalNow() + 70000;
      return structuredClone(run.state);
    },
  };
  try {
    await expect(collectOriginalGcpTerraformBootstrap({ ...run.input, reader })).rejects.toThrow('JWT');
  } finally {
    Date.now = originalNow;
  }
});

it('missing historical Platform source methods refuse before original state reads', async () => {
  const run = await fixture();
  await expect(
    collectOriginalGcpTerraformBootstrap({ ...run.input, platform: {} as typeof originalGcpBootstrapSource }),
  ).rejects.toThrow('Verified Platform bootstrap source unavailable');
  expect(run.calls).toHaveLength(0);
});

it('preserves legacy bootstrap evidence and versions the published 15.16.2 mapping', async () => {
  const legacy = await fixture();
  const old = await collectOriginalGcpTerraformBootstrap(legacy.input);
  expect(old.schemaVersion).toBe(1);
  expect(old.xcshProviderVersion).toBe('15.15.7');
  const latest = await fixture(({ plan }) => {
    plan.providerLockSha256 = '05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc';
  });
  latest.input.terraformVersion = '1.17.2';
  await expect(collectOriginalGcpTerraformBootstrap(latest.input)).rejects.toThrow('mapping');
  const current = await collectOriginalGcpTerraformBootstrapV2(latest.input);
  expect(current.schemaVersion).toBe(2);
  expect(current.xcshProviderVersion).toBe('15.16.2');
  expect(current.planSha256).toBe(latest.input.receipt.planSha256);
  expect(current.bootstrapOwnershipQualified).toBe(false);
  expect(await readOriginalGcpTerraformBootstrapJwt(current)).toBe(latest.jwt);
  await expect(readOriginalGcpTerraformBootstrapJwt({ ...current })).rejects.toThrow('Original');
  expect(old.schemaVersion).toBe(1);
  expect(old.xcshProviderVersion).toBe('15.15.7');
});

it('latest bootstrap mapping still rejects replacement identities and changed state', async () => {
  for (const target of ['site', 'token'] as const) {
    const run = await fixture((values) => {
      values.plan.providerLockSha256 = '05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc';
      values[target].system_metadata.uid = 'replacement-creation';
    });
    run.input.terraformVersion = '1.17.2';
    await expect(collectOriginalGcpTerraformBootstrapV2(run.input)).rejects.toThrow('creation');
  }
});

it('version 2 rejects legacy profiles and changing applied state without migrating evidence', async () => {
  const legacy = await fixture();
  await expect(collectOriginalGcpTerraformBootstrapV2(legacy.input)).rejects.toThrow('mapping');
  const latest = await fixture(({ plan }) => {
    plan.providerLockSha256 = '05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc';
  });
  latest.input.terraformVersion = '1.17.2';
  let reads = 0;
  const reader = {
    async readAppliedResourceFields() {
      return { ...latest.state, serial: latest.state.serial + (reads++ ? 1 : 0) };
    },
  };
  await expect(collectOriginalGcpTerraformBootstrapV2({ ...latest.input, reader })).rejects.toThrow('state changed');
});
