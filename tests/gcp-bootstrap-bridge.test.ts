import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GCP_TERRAFORM1171_ARTIFACTS } from '../plugins/gcloud/src/ce/terraform-public-artifacts';
import { CeDeploymentStore } from '../plugins/platform/src/ce/deployment-store';
import type { CePlatformService } from '../plugins/platform/src/ce/service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function fixture() {
  if (!GCP_TERRAFORM1171_ARTIFACTS) throw new Error('Qualified artifacts required');
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
    providerLockSha256: hash(GCP_TERRAFORM1171_ARTIFACTS.providerLock),
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
  expect(typeof service?.gcpBootstrapObservation).toBe('function');
  const source = service?.gcpBootstrapSource?.();
  expect(source?.assertBody).toBe(run.platform.assertOriginalGcpPlatformHttpBody);
  expect(source?.inspect).toBe(run.platform.inspectOriginalGcpBootstrap);
  expect(source?.readJwt).toBe(run.platform.readOriginalGcpBootstrapJwt);
});

it('compiled version 2 keeps Platform body authority in its issuer and preserves the legacy API', async () => {
  const run = await fixture();
  const input = {
    ...run.input,
    terraformVersion: '1.17.2',
    receipt: {
      ...run.input.receipt,
      providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
    },
  };
  await expect(run.terraform.collectOriginalGcpTerraformBootstrap(input)).rejects.toThrow('mapping');
  const value = await run.terraform.collectOriginalGcpTerraformBootstrapV2(input);
  expect(value.schemaVersion).toBe(2);
  expect(value.xcshProviderVersion).toBe('15.17.3');
  expect(value.bootstrapOwnershipQualified).toBe(false);
  expect(await run.terraform.readOriginalGcpTerraformBootstrapJwt(value)).toBe(run.jwt);
  await expect(
    run.terraform.collectOriginalGcpTerraformBootstrapV2({ ...input, site: { ...input.site } }),
  ).rejects.toThrow('Original');
  await expect(run.terraform.readOriginalGcpTerraformBootstrapJwt({ ...value })).rejects.toThrow('Original');
});

it('compiled grant publication refuses serialized authority before checkout or execution', async () => {
  const runtime = await import(join(import.meta.dir, '../plugins/terraform/runtime/index.js'));
  expect(typeof runtime.publishOriginalGcpBootstrapGrant).toBe('function');
  let executions = 0;
  await expect(
    runtime.publishOriginalGcpBootstrapGrant(
      { packet: { schemaVersion: 2, kind: 'prepared-original-creation-scope' }, token: {}, evidence: {}, store: {} },
      {
        executorFactory: () => {
          executions++;
          throw new Error('must not execute');
        },
      },
    ),
  ).rejects.toThrow('Trusted');
  expect(executions).toBe(0);
});

it('compiled Platform observation supplies original bodies to the actual compiled Terraform consumer', async () => {
  const run = await fixture();
  const root = await mkdtemp(join(tmpdir(), 'compiled-original-observation-'));
  const owner = run.input.binding.owner;
  const store = await CeDeploymentStore.open(root, owner);
  let requests = 0;
  const observation = await run.platform.openOriginalGcpBootstrapObservation(
    {
      store,
      origin: 'https://tenant.example.test',
      credential: 'fixture',
      targets: [
        { type_name: 'xcsh_securemesh_site_v2', name: 'site-a', namespace: 'system' },
        { type_name: 'xcsh_token', name: 'node-a-token', namespace: 'system' },
      ],
      assertOriginal: async () => {},
    },
    {
      fetcher: async (url: URL) => {
        requests++;
        const original = url.pathname.includes('/tokens/') ? run.input.token : run.input.site;
        return new Response(Buffer.from(original.bytes), { headers: { 'Content-Type': 'application/json' } });
      },
    },
  );
  try {
    const site = await observation.read({ type_name: 'xcsh_securemesh_site_v2', name: 'site-a', namespace: 'system' });
    const token = await observation.read({ type_name: 'xcsh_token', name: 'node-a-token', namespace: 'system' });
    const candidate = await run.terraform.collectOriginalGcpTerraformBootstrap({ ...run.input, site, token });
    expect(await run.terraform.readOriginalGcpTerraformBootstrapJwt(candidate)).toBe(run.jwt);
    expect(candidate.bootstrapOwnershipQualified).toBe(false);
    expect(requests).toBe(2);
    await observation.close();
    await expect(run.terraform.readOriginalGcpTerraformBootstrapJwt(candidate)).rejects.toThrow('retired');
  } finally {
    await observation.close();
    await (await import('node:fs/promises')).rm(root, { recursive: true, force: true });
  }
});

it('compiled bootstrap stage refuses copied scope before reader or publisher execution', async () => {
  const runtime = await import(join(import.meta.dir, '../plugins/terraform/runtime/index.js'));
  expect(typeof runtime.openInstalledBootstrapCapture).toBe('function');
  let executions = 0;
  const factory = () => {
    executions++;
    throw new Error('must not execute');
  };
  await expect(
    runtime.openInstalledBootstrapCapture(
      {
        context: {},
        packet: { schemaVersion: 2, kind: 'prepared-original-creation-scope' },
        nodes: [],
        platform: {},
        store: {},
        platformContext: 'example',
      },
      { reader: { executorFactory: factory }, publication: { executorFactory: factory } },
    ),
  ).rejects.toThrow('Trusted');
  expect(executions).toBe(0);
});

it('compiled authenticated inventory retains original disk evidence and rejects copied references', async () => {
  const runtime = await import(join(import.meta.dir, '../plugins/terraform/runtime/index.js'));
  expect(typeof runtime.openGcpCloudSerialReader).toBe('function');
  const root = await mkdtemp(join(tmpdir(), 'compiled-inventory-'));
  const credential = {
    type: 'authorized_user',
    client_id: 'synthetic-client',
    client_secret: 'synthetic-secret',
    refresh_token: 'synthetic-refresh',
    quota_project_id: 'example-project',
  };
  const info = {
    email: 'principal@example.com',
    verified_email: true,
    audience: credential.client_id,
    issued_to: credential.client_id,
    expires_in: 3599,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };
  const disk = {
    kind: 'compute#disk',
    id: '4996011480491275425',
    name: 'example-disk',
    zone: 'https://www.googleapis.com/compute/v1/projects/example-project/zones/us-central1-a',
    selfLink: 'https://www.googleapis.com/compute/v1/projects/example-project/zones/us-central1-a/disks/example-disk',
    creationTimestamp: '2026-11-09T00:00:00Z',
  };
  const fetcher = async (url: string) => {
    const path = new URL(url).pathname;
    if (path === '/token')
      return Response.json({ access_token: 'synthetic-access', token_type: 'Bearer', expires_in: 3599 });
    if (path === '/oauth2/v2/tokeninfo') return Response.json(info);
    if (path === '/v1/projects/example-project')
      return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
    return Response.json(disk);
  };
  try {
    const reader = await runtime.openGcpCloudSerialReader(
      {
        root,
        region: 'us-central1',
        authentication: {
          credentialBytes: Buffer.from(JSON.stringify(credential)),
          project: 'example-project',
          accountSha256: hash(info.email),
          audienceSha256: hash(credential.client_id),
          assertOriginal: async () => {},
        },
      },
      undefined,
      fetcher,
    );
    const evidence = await reader.resource({ kind: 'disk', name: 'example-disk', zone: 'us-central1-a' });
    expect(evidence.value.id).toBe(disk.id);
    expect(evidence.creationOwnershipQualified).toBe(false);
    expect((await reader.readResourceEvidence(evidence)).raw.toString()).toBe(JSON.stringify(disk));
    await expect(reader.readResourceEvidence({ ...evidence })).rejects.toThrow('original');
  } finally {
    await (await import('node:fs/promises')).rm(root, { recursive: true, force: true });
  }
});

it('compiled inventory scope rejects fabricated packets before exposing targets', async () => {
  const runtime = await import(join(import.meta.dir, '../plugins/terraform/runtime/index.js'));
  expect(typeof runtime.inspectOriginalGcpInventoryScope).toBe('function');
  await expect(
    runtime.inspectOriginalGcpInventoryScope({ schemaVersion: 1, kind: 'original-gcp-inventory-scope' }),
  ).rejects.toThrow('Original');
});

it('compiled Platform presence preserves attributed absence and retires issuer authority on closure', async () => {
  const run = await fixture();
  const root = await mkdtemp(join(tmpdir(), 'compiled-presence-'));
  const store = await CeDeploymentStore.open(root, run.input.binding.owner);
  const target = { type_name: 'xcsh_token' as const, name: 'node-a-token', namespace: 'system' as const };
  const observation = await run.platform.openOriginalGcpBootstrapObservation(
    {
      store,
      origin: 'https://tenant.example.test',
      credential: 'fixture',
      targets: [target],
      assertOriginal: async () => {},
    },
    { fetcher: async () => Response.json({ error: 'synthetic missing token' }, { status: 404 }) },
  );
  const presence = await observation.readPresence(target);
  expect(presence.present).toBe(false);
  expect(presence.creationOwnershipQualified).toBe(false);
  expect(presence.body.evidence.status).toBe(404);
  expect(presence.body.bytes.toString()).toBe(JSON.stringify({ error: 'synthetic missing token' }));
  await observation.assertPresence(presence);
  await run.platform.assertOriginalGcpPlatformHttpBody(presence.body);
  await expect(observation.assertPresence({ ...presence })).rejects.toThrow('Original');
  const closure = observation.close();
  expect(observation.close()).toBe(closure);
  await closure;
  await expect(observation.assertPresence(presence)).rejects.toThrow('retired');
  await expect(run.platform.assertOriginalGcpPlatformHttpBody(presence.body)).rejects.toThrow('retired');
});

it('compiled initial inventory refuses serialized scope before authentication or Platform reads', async () => {
  const runtime = await import(join(import.meta.dir, '../plugins/terraform/runtime/index.js'));
  expect(typeof runtime.openInstalledInitialInventory).toBe('function');
  let reads = 0;
  await expect(
    runtime.openInstalledInitialInventory(
      {
        context: {},
        scope: { schemaVersion: 1, kind: 'original-gcp-inventory-scope' },
        store: {},
        platform: {},
      },
      {
        fetcher: async () => {
          reads++;
          return Response.json({});
        },
      },
    ),
  ).rejects.toThrow('Original');
  expect(reads).toBe(0);
});
