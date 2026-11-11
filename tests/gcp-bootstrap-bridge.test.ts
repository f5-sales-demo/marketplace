import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GCP_PUBLIC_TERRAFORM_ARTIFACTS } from '../plugins/gcloud/src/ce/terraform-public-artifacts';
import { CeDeploymentStore } from '../plugins/platform/src/ce/deployment-store';
import type { CePlatformService } from '../plugins/platform/src/ce/service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function fixture() {
  if (!GCP_PUBLIC_TERRAFORM_ARTIFACTS) throw new Error('Qualified artifacts required');
  const platform = await import(join(import.meta.dir, '../plugins/platform/runtime/index.js'));
  const terraform = await import(join(import.meta.dir, '../plugins/terraform/runtime/index.js'));
  const root = await mkdtemp(join(tmpdir(), 'compiled-bootstrap-bridge-'));
  const owner = {
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'compiled-source-only',
  };
  const binding = {
    owner,
    deploymentName: 'deploy-a',
    siteName: 'site-a',
    nodeName: 'node-a',
    tokenName: 'node-a-token',
  };
  const jwt = [
    Buffer.from('{}').toString('base64url'),
    Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    Buffer.from('synthetic-signature').toString('base64url'),
  ].join('.');
  const labels = { 'xcsh-deployment': 'deploy-a', 'xcsh-engine': 'terraform' };
  const site = {
    metadata: { name: 'site-a', namespace: 'system', labels: { ...labels, 'ves.io/provider': 'ves-io-GOOGLE' } },
    system_metadata: { uid: 'site-resource-original' },
    spec: { gcp: { not_managed: { node_list: [] } } },
  };
  const token = {
    metadata: { name: 'node-a-token', namespace: 'system', labels: { ...labels, 'xcsh-node': 'node-a' } },
    system_metadata: { uid: 'token-resource-original' },
    spec: { site_name: 'site-a', type: 1, content: jwt },
  };
  const store = await CeDeploymentStore.open(root, owner);
  const capture = await platform.openGcpLifecycleHttpCapture(store, async () => {}, {
    siteNames: ['site-a'],
    tokenNames: ['node-a-token'],
  });
  // Synthetic compiled ABI regression; no live or installed acceptance is claimed.
  const port = platform.createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async (url: URL) => Response.json(url.pathname.includes('/tokens/') ? token : site),
    capture,
  );
  const siteValue = await port.read('/api/config/namespaces/system/securemesh_site_v2s/site-a');
  const tokenValue = await port.read('/api/register/namespaces/system/tokens/node-a-token');
  const siteBody = await capture.read(capture.evidenceFor(siteValue)),
    tokenBody = await capture.read(capture.evidenceFor(tokenValue));
  const receipt = {
    schemaVersion: 1,
    deploymentId: owner.deploymentId,
    engine: 'terraform',
    backendIdentity: `local:${owner.deploymentId}`,
    configurationSha256: hash('configuration'),
    providerLockSha256: hash(GCP_PUBLIC_TERRAFORM_ARTIFACTS.providerLock),
    planSha256: hash('saved-plan'),
    changes: [],
    noChanges: false,
  };
  const state = {
    schemaVersion: 1,
    planSha256: receipt.planSha256,
    stateSha256: hash('state'),
    lineage: 'original-lineage',
    serial: 3,
    resources: {
      'xcsh_securemesh_site_v2.site_a': {
        name: 'site-a',
        namespace: 'system',
        labels,
        creation_identity_sha256: `sha256:${hash(site.system_metadata.uid)}`,
      },
      'xcsh_token.node_a': {
        name: 'node-a-token',
        namespace: 'system',
        labels: token.metadata.labels,
        creation_identity_sha256: `sha256:${hash(token.system_metadata.uid)}`,
        site_name: 'site-a',
        type: 1,
      },
    },
  };
  const authority = {
    assertBody: platform.assertOriginalGcpPlatformHttpBody,
    inspect: platform.inspectOriginalGcpBootstrap,
    readJwt: platform.readOriginalGcpBootstrapJwt,
  };
  const input = {
    binding,
    receipt,
    terraformVersion: '1.17.1',
    environment: {},
    site: siteBody,
    token: tokenBody,
    platform: authority,
    reader: {
      async readAppliedResourceFields() {
        return structuredClone(state);
      },
    },
  };
  return { platform, terraform, input, jwt };
}

it('compiled Terraform consumes actual Platform-issued bodies and delegates private JWT inspection to their issuer', async () => {
  const run = await fixture();
  const value = await run.terraform.collectOriginalGcpTerraformBootstrap(run.input);
  expect(value.bootstrapOwnershipQualified).toBe(false);
  expect(value.creationOwnershipCorroborated).toBe(true);
  expect(JSON.stringify(value)).not.toContain(run.jwt);
  expect(await run.terraform.readOriginalGcpTerraformBootstrapJwt(value)).toBe(run.jwt);
  await expect(run.terraform.readOriginalGcpTerraformBootstrapJwt({ ...value })).rejects.toThrow('Original');
});

it('compiled producer authority still rejects copied, foreign-session and modified body references', async () => {
  const run = await fixture(),
    foreign = await fixture();
  await expect(
    run.terraform.collectOriginalGcpTerraformBootstrap({ ...run.input, site: { ...run.input.site } }),
  ).rejects.toThrow('Original');
  await expect(
    run.terraform.collectOriginalGcpTerraformBootstrap({ ...run.input, token: foreign.input.token }),
  ).rejects.toThrow('context');
  const value = await run.terraform.collectOriginalGcpTerraformBootstrap(run.input);
  const before = run.input.token.bytes[0];
  run.input.token.bytes[0] ^= 1;
  try {
    await expect(run.terraform.readOriginalGcpTerraformBootstrapJwt(value)).rejects.toThrow('Original');
  } finally {
    run.input.token.bytes[0] = before;
  }
});

it('actual registered Platform service provides the issuing module verifier without requiring a context or granting bootstrap', async () => {
  const run = await fixture();
  let handler: ((data: unknown) => void) | undefined;
  const events = {
    on(_channel: string, callback: (data: unknown) => void) {
      handler = callback;
      return () => {};
    },
    emit(_channel: string, data: unknown) {
      handler?.(data);
    },
  };
  await run.platform.default({
    events,
    setLabel: () => {},
    integrations: { register: () => {} },
    presentation: { withPresentation: (tool: unknown) => tool },
  });
  let service: CePlatformService | undefined;
  events.emit('xcsh:ce-platform:v2:service', {
    version: 2,
    resolve(value: CePlatformService) {
      service = value;
    },
  });
  expect(typeof service?.gcpBootstrapSource).toBe('function');
  const source = service?.gcpBootstrapSource?.();
  expect(source?.assertBody).toBe(run.platform.assertOriginalGcpPlatformHttpBody);
  expect(source?.inspect).toBe(run.platform.inspectOriginalGcpBootstrap);
  expect(source?.readJwt).toBe(run.platform.readOriginalGcpBootstrapJwt);
});
