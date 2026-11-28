import { expect, it } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import { inspectOriginalGcpBootstrap, readOriginalGcpBootstrapJwt } from '../../src/ce/gcp-bootstrap-evidence';
import { createGcpLifecycleHttpPort } from '../../src/ce/gcp-http';
import { openGcpLifecycleHttpCapture } from '../../src/ce/gcp-http-capture';

interface FixtureResponse {
  metadata: { name: string; namespace: string; labels: Record<string, string> };
  system_metadata: { uid: string };
  spec: { site_name?: string; type?: number; content?: string };
}
type FixtureData = { site: FixtureResponse; token: FixtureResponse };
function testJwt(claims: Record<string, unknown>) {
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    Buffer.from('synthetic-test-signature').toString('base64url'),
  ].join('.');
}

async function fixture(change: (value: FixtureData) => void = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'gcp-bootstrap-source-'));
  const owner = {
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'owner-id',
  };
  const expected = {
    owner,
    deploymentName: 'deploy-alpha',
    siteName: 'site-a',
    siteUid: 'site-original-uid',
    nodeName: 'node-a',
    tokenName: 'node-a-token',
    tokenUid: 'token-original-uid',
  };
  const store = await CeDeploymentStore.open(root, owner),
    capture = await openGcpLifecycleHttpCapture(store, async () => {}, {
      siteNames: ['site-a'],
      tokenNames: ['node-a-token'],
    });
  const jwt = testJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  const site: FixtureResponse = {
    metadata: {
      name: 'site-a',
      namespace: 'system',
      labels: { 'xcsh-deployment': 'deploy-alpha', 'xcsh-engine': 'terraform' },
    },
    system_metadata: { uid: 'site-original-uid' },
    spec: {},
  };
  const token: FixtureResponse = {
    metadata: {
      name: 'node-a-token',
      namespace: 'system',
      labels: { 'xcsh-deployment': 'deploy-alpha', 'xcsh-engine': 'terraform', 'xcsh-node': 'node-a' },
    },
    system_metadata: { uid: 'token-original-uid' },
    spec: { site_name: 'site-a', type: 1, content: jwt },
  };
  change({ site, token });
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async (url: unknown) => Response.json(String(url).includes('/tokens/') ? token : site),
    capture,
  );
  const siteValue = await port.read('/api/config/namespaces/system/securemesh_site_v2s/site-a'),
    tokenValue = await port.read('/api/register/namespaces/system/tokens/node-a-token');
  if (!siteValue || !tokenValue) throw new Error('Original source values required');
  const siteBody = await capture.read(capture.evidenceFor(siteValue)),
    tokenBody = await capture.read(capture.evidenceFor(tokenValue));
  return { expected, siteBody, tokenBody, jwt };
}
it('bootstrap source joins exact owned site/token/node and retains JWT only privately', async () => {
  const run = await fixture();
  const value = await inspectOriginalGcpBootstrap(run.siteBody, run.tokenBody, run.expected);
  expect(value.siteUid).toBe('site-original-uid');
  expect(value.tokenUid).toBe('token-original-uid');
  expect(value.metadataCorroborated).toBe(true);
  expect(value.bootstrapOwnershipQualified).toBe(false);
  expect(JSON.stringify(value)).not.toContain(run.jwt);
  expect(await readOriginalGcpBootstrapJwt(value)).toBe(run.jwt);
  await expect(readOriginalGcpBootstrapJwt({ ...value })).rejects.toThrow('Original');
});
it('wrong engine, foreign node, UID replacement, and wrong site binding refuse', async () => {
  for (const change of [
    (x: FixtureData) => {
      x.token.metadata.labels['xcsh-engine'] = 'native';
    },
    (x: FixtureData) => {
      x.token.metadata.labels['xcsh-node'] = 'foreign';
    },
    (x: FixtureData) => {
      x.site.system_metadata.uid = 'replaced';
    },
    (x: FixtureData) => {
      x.token.system_metadata.uid = 'replaced';
    },
    (x: FixtureData) => {
      x.token.spec.site_name = 'foreign';
    },
  ]) {
    const run = await fixture(change);
    await expect(inspectOriginalGcpBootstrap(run.siteBody, run.tokenBody, run.expected)).rejects.toThrow('ownership');
  }
});
it('expired, malformed or absent JWT claims cannot supply bootstrap material', async () => {
  for (const change of [
    (x: FixtureData) => {
      x.token.spec.content = testJwt({ exp: Math.floor(Date.now() / 1000) });
    },
    (x: FixtureData) => {
      x.token.spec.content = 'invalid';
    },
    (x: FixtureData) => {
      x.token.spec.content = testJwt({});
    },
  ]) {
    const run = await fixture(change);
    await expect(inspectOriginalGcpBootstrap(run.siteBody, run.tokenBody, run.expected)).rejects.toThrow('JWT');
  }
});
it('copied bodies or different original recorder contexts cannot be joined', async () => {
  const first = await fixture(),
    second = await fixture();
  await expect(inspectOriginalGcpBootstrap({ ...first.siteBody }, first.tokenBody, first.expected)).rejects.toThrow(
    'Original',
  );
  await expect(inspectOriginalGcpBootstrap(first.siteBody, second.tokenBody, first.expected)).rejects.toThrow(
    'context',
  );
});

it('private diagnostic inspection retains original JWT after expiry without fresh bootstrap admission', async () => {
  const run = await fixture();
  const value = await inspectOriginalGcpBootstrap(run.siteBody, run.tokenBody, run.expected);
  const realNow = Date.now;
  Date.now = () => realNow() + 7200000;
  try {
    expect(await readOriginalGcpBootstrapJwt(value)).toBe(run.jwt);
    await expect(inspectOriginalGcpBootstrap(run.siteBody, run.tokenBody, run.expected)).rejects.toThrow('stale');
  } finally {
    Date.now = realNow;
  }
});
