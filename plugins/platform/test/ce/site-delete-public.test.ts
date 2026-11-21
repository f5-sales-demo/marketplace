import { afterEach, expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import type { CePlatformService } from '../../src/ce/service';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import { createF5xcCeV2SiteTool } from '../../src/tools/f5xc-ce-v2-site';
import type { PlatformToolApi } from '../../src/types';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contractFixture from '../fixtures/smsv2-contract-v7.json';
import schemaCompact from '../fixtures/smsv2-create-schema.json';
import replaceSchemaCompact from '../fixtures/smsv2-replace-schema.json';

const schema = resolveCeSchemaFixture(schemaCompact);
const replaceSchema = resolveCeSchemaFixture(replaceSchemaCompact);
type FixtureConstructor = new (
  commit: string,
  fingerprint: string,
  contract: Record<string, unknown>,
  schemas: Record<string, unknown>,
  networking: undefined,
  publication: 'published-release',
) => VerifiedCeContract;
const originalMutations = process.env.XCSH_CE_HEADLESS_MUTATIONS;
const originalDestroy = process.env.XCSH_CE_ALLOW_DESTROY;
afterEach(() => {
  if (originalMutations === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
  else process.env.XCSH_CE_HEADLESS_MUTATIONS = originalMutations;
  if (originalDestroy === undefined) delete process.env.XCSH_CE_ALLOW_DESTROY;
  else process.env.XCSH_CE_ALLOW_DESTROY = originalDestroy;
});

type Mode = 'pending' | 'deleted' | 'lost-response' | 'foreign-uid' | 'foreign-owner' | 'forbidden';
function fixture(
  provider: 'aws' | 'azure',
  engine: 'native' | 'terraform',
  mode: Mode,
  readOptions: {
    uid?: unknown;
    version?: unknown;
    status?: number;
    malformed?: boolean;
    siteName?: string;
    ha?: boolean;
  } = {},
) {
  const binding: SiteBinding = {
    owner: {
      deploymentId: readOptions.siteName ?? 'ce-example',
      engine,
      provider,
      account: 'example-account',
      region: 'example-region',
    },
    siteName: readOptions.siteName ?? 'ce-example',
    nodes: readOptions.ha ? ['node-example-one', 'node-example-two', 'node-example-three'] : ['node-example'],
  };
  const labels = Object.fromEntries(
    Object.entries(binding.owner).map(([key, value]) => [
      `xcsh-ce-${key === 'deploymentId' ? 'deployment' : key}`,
      value,
    ]),
  );
  if (mode === 'foreign-owner') labels['xcsh-ce-deployment'] = 'example-foreign-deployment';
  const Constructor = VerifiedCeContract as unknown as FixtureConstructor;
  const contract = new Constructor(
    schema.provenance.commit,
    `sha256:${'f'.repeat(64)}`,
    contractFixture,
    { ...schema.schemas, ...replaceSchema.schemas },
    undefined,
    'published-release',
  );
  let present = true;
  const calls: Array<{ transport: 'rest' | 'resource-state'; method: string; path: string }> = [];
  const records: unknown[] = [];
  const handle = (init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'DELETE') {
      if (mode === 'forbidden') return new Response('{}', { status: 403 });
      if (mode !== 'pending') present = false;
      return new Response('{}', { status: mode === 'lost-response' ? 503 : 200 });
    }
    if (!present) return new Response('{}', { status: 404 });
    if (readOptions.status) return new Response('{}', { status: readOptions.status });
    if (readOptions.malformed) return new Response('{', { status: 200 });
    return Response.json({
      metadata: { name: binding.siteName, namespace: 'system', labels },
      system_metadata: {
        uid: Object.hasOwn(readOptions, 'uid')
          ? readOptions.uid
          : mode === 'foreign-uid'
            ? 'example-other-uid'
            : readOptions.siteName
              ? `${readOptions.siteName}-uid`
              : 'example-site-uid',
      },
      resource_version: Object.hasOwn(readOptions, 'version') ? readOptions.version : 'example-version',
    });
  };
  const runtime = new CeRuntime(
    contract,
    engine,
    'https://tenant.example.test',
    'example-test-credential',
    async (url, init) => {
      const path = new URL(url).pathname;
      calls.push({ transport: 'rest', method: init?.method ?? 'GET', path });
      return handle(init);
    },
    async (owner, path, init) => {
      expect(owner).toEqual(binding.owner);
      calls.push({ transport: 'resource-state', method: init.method ?? 'GET', path });
      const response = handle(init);
      if (!response.ok) throw new Error('example resource-state request rejected');
      return await response.json();
    },
  );
  const service = {
    capabilities: async () => ({ tenantOrigin: 'https://tenant.example.test' }),
    runtime: async (selectedEngine: string) => {
      expect(selectedEngine).toBe(engine);
      return runtime;
    },
    storage: async (owner: unknown) => {
      expect(owner).toEqual(binding.owner);
      return {
        write: async (_name: string, value: unknown) => {
          records.push(value);
        },
      };
    },
  } as unknown as CePlatformService;
  const tool = createF5xcCeV2SiteTool({ typebox: { Type } } as unknown as PlatformToolApi, () => service);
  const params = {
    action: 'delete' as const,
    namespace: 'system',
    siteName: binding.siteName,
    binding,
    expectedUid: readOptions.siteName ? `${readOptions.siteName}-uid` : 'example-site-uid',
  };
  const context = {
    hasUI: false,
    ui: { confirm: async () => true },
    sessionManager: { getSessionId: () => 'example-session', saveArtifact: async () => 'example-artifact' },
  };
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  process.env.XCSH_CE_ALLOW_DESTROY = '1';
  return {
    binding,
    calls,
    records,
    tool,
    params,
    context,
    release: () => {
      present = false;
    },
  };
}

for (const provider of ['aws', 'azure'] as const)
  for (const engine of ['native', 'terraform'] as const) {
    for (const mode of ['pending', 'deleted', 'lost-response', 'foreign-uid', 'foreign-owner', 'forbidden'] as const)
      test(`public logical site deletion preserves ${mode} through real runtime (${provider}/${engine})`, async () => {
        const f = fixture(provider, engine, mode);
        const plan = await f.tool.execute('id', f.params, undefined, undefined, f.context);
        expect(plan.isError).toBeUndefined();
        expect(f.calls).toHaveLength(0);
        if (!plan.details.plan) throw new Error('missing public deletion plan');
        const execution = { ...f.params, planSha256: plan.details.plan.planSha256 };
        const result = await f.tool.execute('id', execution, undefined, undefined, f.context);
        if (
          ['foreign-uid', 'foreign-owner', 'forbidden'].includes(mode) ||
          (mode === 'lost-response' && provider === 'aws' && engine === 'terraform')
        ) {
          expect(result.isError).toBe(true);
          if (mode.startsWith('foreign')) expect(f.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
          return;
        }
        expect(result.isError).toBeUndefined();
        const details = result.details as Record<string, unknown>;
        expect(details.status).toBe(mode === 'pending' ? 'pending' : 'deleted');
        expect(details.deletion).toMatchObject({
          status: mode === 'pending' ? 'pending' : 'deleted',
          owner: f.binding.owner,
          siteUid: 'example-site-uid',
        });
        const mutations = f.calls.filter((call) => call.method === 'DELETE');
        expect(mutations).toHaveLength(1);
        expect(mutations[0].transport).toBe(provider === 'aws' && engine === 'terraform' ? 'resource-state' : 'rest');
        expect(f.records).toHaveLength(1);
        if (mode === 'pending') {
          expect(result.content[0].text).not.toContain('completed');
          f.release();
          const resumed = await f.tool.execute('id', execution, undefined, undefined, f.context);
          expect(resumed.isError).toBeUndefined();
          expect((resumed.details as Record<string, unknown>).status).toBe('deleted');
          expect(f.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
        } else expect(result.content[0].text).toContain('Logical site deletion');
      });
  }

for (const provider of ['aws', 'azure'] as const)
  for (const engine of ['native', 'terraform'] as const)
    for (const profile of ['single-site', 'independent-sites', 'three-node-ha'] as const)
      for (const state of [
        'healthy',
        'missing-site',
        'foreign-owner',
        'missing-uid',
        'empty-uid',
        'whitespace-uid',
        'malformed-uid',
        'unexpected-uid',
        'malformed-version',
        'forbidden',
        'unavailable',
        'malformed-payload',
      ] as const)
        test(`public read preserves owned identity and rejects ${state} (${provider}/${engine}/${profile})`, async () => {
          const components = profile === 'independent-sites' ? [1, 2, 3] : [1];
          const observedUids: unknown[] = [];
          for (const component of components) {
            const readOptions: {
              uid?: unknown;
              version?: unknown;
              status?: number;
              malformed?: boolean;
              siteName: string;
              ha: boolean;
            } = {
              siteName: `ce-example-${component}`,
              ha: profile === 'three-node-ha',
            };
            if (state === 'missing-uid') readOptions.uid = undefined;
            if (state === 'empty-uid') readOptions.uid = '';
            if (state === 'whitespace-uid') readOptions.uid = '   ';
            if (state === 'malformed-uid') readOptions.uid = { value: 'example-uid' };
            if (state === 'unexpected-uid') readOptions.uid = 'example-replaced-uid';
            if (state === 'malformed-version') readOptions.version = { value: 'example-untrusted-version' };
            if (state === 'forbidden') readOptions.status = 403;
            if (state === 'unavailable') readOptions.status = 503;
            if (state === 'malformed-payload') readOptions.malformed = true;
            const f = fixture(provider, engine, state === 'foreign-owner' ? 'foreign-owner' : 'deleted', readOptions);
            if (state === 'missing-site') f.release();
            delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
            delete process.env.XCSH_CE_ALLOW_DESTROY;
            const result = await f.tool.execute('id', { ...f.params, action: 'read' }, undefined, undefined, f.context);
            expect(f.calls).toHaveLength(1);
            expect(f.calls[0]).toMatchObject({ method: 'GET', transport: 'rest' });
            expect(f.calls[0].path).toContain(f.binding.siteName);
            expect(f.records).toHaveLength(0);
            if (state === 'healthy') {
              expect(result.isError).toBeUndefined();
              const details = result.details as Record<string, unknown>;
              expect(details.siteUid).toBe(f.params.expectedUid);
              expect(details.resourceVersion).toBe('example-version');
              observedUids.push(details.siteUid);
            } else {
              expect(result.isError).toBe(true);
              expect(result.content[0].text).not.toContain('Read ');
              expect((result.details as Record<string, unknown>).siteUid).toBeUndefined();
            }
          }
          if (state === 'healthy') expect(new Set(observedUids).size).toBe(components.length);
        });
