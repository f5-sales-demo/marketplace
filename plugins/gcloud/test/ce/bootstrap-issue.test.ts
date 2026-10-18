import { expect, it } from 'bun:test';
import { issueGcpBootstrap } from '../../src/ce/bootstrap-issue';
import { fingerprint } from '../../src/ce/discovery';

function fixture() {
  const owner = {
    project: 'test-project',
    deploymentName: 'demo-ce',
    siteName: 'site-a',
    nodeName: 'node-a',
    engine: 'native' as const,
  };
  const body = {
    schemaVersion: 1 as const,
    owner,
    tokenName: 'node-a-token',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    contractDigest: `sha256:${'a'.repeat(64)}`,
  };
  const plan = { ...body, sha256: fingerprint(body) };
  const files = new Map<string, unknown>();
  const store = {
    read: async (n: string) => {
      if (!files.has(n)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(n));
    },
    write: async (n: string, v: unknown) => {
      files.set(n, structuredClone(v));
    },
    exclusive: async <T>(fn: () => Promise<T>) => fn(),
  };
  const response = {
    metadata: {
      name: plan.tokenName,
      namespace: 'system',
      labels: { 'xcsh-deployment': owner.deploymentName, 'xcsh-engine': 'native', 'xcsh-node': owner.nodeName },
    },
    spec: { type: 1, site_name: owner.siteName, content: 'fixtureheader.fixturepayload.fixturesignature' },
  };
  return { plan, store, response, files };
}
it('issues a bound token once and returns only sanitized issuance evidence', async () => {
  const f = fixture();
  let calls = 0;
  const driver = {
    assertSiteOwnership: async () => {},
    readToken: async () => null,
    createToken: async () => {
      calls++;
      return f.response;
    },
  };
  const result = await issueGcpBootstrap(f.store, f.plan, f.plan.sha256, f.plan.contractDigest, driver);
  expect(result.issued).toBe(true);
  expect(JSON.stringify(result)).not.toContain('fixturepayload');
  await issueGcpBootstrap(f.store, f.plan, f.plan.sha256, f.plan.contractDigest, driver);
  expect(calls).toBe(1);
});
it('reconciles a lost create response without issuing a second token', async () => {
  const f = fixture();
  let calls = 0;
  let existing: unknown | null = null;
  const driver = {
    assertSiteOwnership: async () => {},
    readToken: async () => existing,
    createToken: async () => {
      calls++;
      existing = f.response;
      throw new Error('lost response');
    },
  };
  await expect(issueGcpBootstrap(f.store, f.plan, f.plan.sha256, f.plan.contractDigest, driver)).rejects.toThrow(
    'lost response',
  );
  await issueGcpBootstrap(f.store, f.plan, f.plan.sha256, f.plan.contractDigest, driver);
  expect(calls).toBe(1);
});
it('rejects foreign preexisting tokens and wrong approval before token mutation', async () => {
  const f = fixture();
  let calls = 0;
  const driver = {
    assertSiteOwnership: async () => {},
    readToken: async () => f.response,
    createToken: async () => {
      calls++;
      return f.response;
    },
  };
  await expect(issueGcpBootstrap(f.store, f.plan, 'wrong', f.plan.contractDigest, driver)).rejects.toThrow(
    'authorization',
  );
  await expect(issueGcpBootstrap(f.store, f.plan, f.plan.sha256, f.plan.contractDigest, driver)).rejects.toThrow(
    'Existing',
  );
  expect(calls).toBe(0);
});
