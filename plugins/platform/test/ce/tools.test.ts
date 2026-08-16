import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CeV2Driver, CeV2SiteConfig } from '../../src/ce/driver';
import { createF5xcCeV2BootstrapTool } from '../../src/tools/f5xc-ce-v2-bootstrap';
import { createF5xcCeV2CapabilitiesTool } from '../../src/tools/f5xc-ce-v2-capabilities';
import { createF5xcCeV2SiteTool, createSitePlan } from '../../src/tools/f5xc-ce-v2-site';
import { createF5xcCeV2StatusTool } from '../../src/tools/f5xc-ce-v2-status';
import type { PlatformToolApi } from '../../src/types';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const Type = {
  Object: (value: unknown) => value,
  String: (value?: unknown) => ({ type: 'string', ...((value as object) ?? {}) }),
  Optional: (value: unknown) => ({ optional: true, ...((value as object) ?? {}) }),
  Boolean: () => ({ type: 'boolean' }),
  Number: () => ({ type: 'number' }),
  Array: (value: unknown) => ({ type: 'array', items: value }),
  Union: (value: unknown) => ({ union: value }),
  Literal: (value: unknown) => ({ const: value }),
  Unknown: () => ({}),
};
const pi: PlatformToolApi = { typebox: { Type } };

function driver(overrides: Partial<CeV2Driver> = {}): CeV2Driver {
  return {
    capabilities: async () => ({
      smsv2ContractVersion: 'v2',
      supportedProviders: ['aws', 'azure'],
      bootstrapDrivers: ['api'],
      providerNetworkingProfiles: {
        aws: ['direct-eni', 'nlb-ingress', 'tgw-static'],
        azure: ['direct-nic', 'route-server-bgp'],
      },
      awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
    }),
    site: async (_action, request) => ({
      metadata: { name: request.siteName, namespace: request.namespace },
      spec: request.config ?? {},
      etag: '1',
    }),
    checkoutBootstrap: async () => ({ token: 'fixture-secret-value', driver: 'api' }),
    status: async () => ({
      siteState: 'ONLINE',
      nodes: [
        {
          name: 'ce-1',
          registration: 'REGISTERED',
          provisioning: 'READY',
          health: 'HEALTHY',
          interfaces: [],
          routes: [],
        },
      ],
      bgp: { established: true, peers: 2, learnedRoutes: 4 },
    }),
    ...overrides,
  };
}

const siteConfig = {
  provider: 'aws' as const,
  haMode: 'one-node' as const,
  vrfs: [{ index: 0, name: 'default' }],
  interfaces: [
    {
      index: 0,
      role: 'slo' as const,
      vrf: 'default',
      addressing: { mode: 'dhcp' as const, addresses: [] },
    },
  ],
  bgpPeers: [],
  providerNetwork: { profile: 'direct-eni', metadata: { vpcId: 'vpc-example' } },
};

function ctx(hasUI = true) {
  return {
    hasUI,
    ui: { confirm: async () => true },
    sessionManager: { getSessionId: () => 'session-a', saveArtifact: async () => '1' },
  };
}

describe('f5xc_ce_v2_bootstrap', () => {
  it('returns only an opaque reference and never the driver token', async () => {
    const root = await mkdtemp(join(tmpdir(), 'platform-ce-tools-test-'));
    roots.push(root);
    const tool = createF5xcCeV2BootstrapTool(pi, () => driver(), root);
    const result = await tool.execute(
      'id',
      { namespace: 'system', siteName: 'ce-demo', nodeName: 'ce-1', expiresInSeconds: 60 },
      undefined,
      undefined,
      ctx(),
    );
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).not.toContain('fixture-secret-value');
    expect(result.details.reference).toMatch(/^f5xc-ce:\/\/session-a\//);
  });

  it('fails closed headlessly when only console fallback is available', async () => {
    const root = await mkdtemp(join(tmpdir(), 'platform-ce-tools-test-'));
    roots.push(root);
    let called = false;
    const tool = createF5xcCeV2BootstrapTool(
      pi,
      () =>
        driver({
          capabilities: async () => ({
            ...(await driver().capabilities()),
            bootstrapDrivers: ['console'],
          }),
          checkoutBootstrap: async () => {
            called = true;
            return { token: 'secret', driver: 'console' };
          },
        }),
      root,
    );
    const result = await tool.execute(
      'id',
      { namespace: 'system', siteName: 'ce-demo', nodeName: 'ce-1', expiresInSeconds: 60 },
      undefined,
      undefined,
      ctx(false),
    );
    expect(result.isError).toBe(true);
    expect(called).toBe(false);
  });

  it('does not expose a token embedded in a driver error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'platform-ce-tools-test-'));
    roots.push(root);
    const tool = createF5xcCeV2BootstrapTool(
      pi,
      () =>
        driver({
          checkoutBootstrap: async () => {
            throw new Error('upstream leaked fixture-secret-value');
          },
        }),
      root,
    );
    const result = await tool.execute(
      'id',
      { namespace: 'system', siteName: 'ce-demo', nodeName: 'ce-1', expiresInSeconds: 60 },
      undefined,
      undefined,
      ctx(),
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('fixture-secret-value');
  });
});

describe('f5xc_ce_v2_site', () => {
  it('creates byte-identical plans and requires their exact hash for mutation', async () => {
    const request = {
      action: 'create' as const,
      namespace: 'system',
      siteName: 'ce-demo',
      config: siteConfig,
    };
    expect(JSON.stringify(createSitePlan(request))).toBe(JSON.stringify(createSitePlan(request)));
    const tool = createF5xcCeV2SiteTool(pi, () => driver());
    const invalid = await tool.execute('id', { ...request, planSha256: '0'.repeat(64) }, undefined, undefined, ctx());
    expect(invalid.isError).toBe(true);
    const plan = createSitePlan(request);
    const applied = await tool.execute('id', { ...request, planSha256: plan.planSha256 }, undefined, undefined, ctx());
    expect(applied.isError).not.toBe(true);
  });

  it('rejects untyped and non-symmetric provider configurations', () => {
    expect(() =>
      createSitePlan({
        action: 'create',
        namespace: 'system',
        siteName: 'ce-demo',
        config: { bgp: { localAsn: 65010 }, interfaces: [{ index: 4, role: 'slo' }] } as unknown as CeV2SiteConfig,
      }),
    ).toThrow(/provider-neutral/i);
    expect(() =>
      createSitePlan({
        action: 'create',
        namespace: 'system',
        siteName: 'ce-demo',
        config: { ...siteConfig, interfaces: [{ ...siteConfig.interfaces[0], index: 1 }] },
      }),
    ).toThrow(/ordered/i);
  });

  it('rejects secret-bearing plans and redacts tenant response fields', async () => {
    expect(() =>
      createSitePlan({
        action: 'create',
        namespace: 'system',
        siteName: 'ce-demo',
        config: { bootstrap_token: 'fixture-secret-value' } as unknown as CeV2SiteConfig,
      }),
    ).toThrow(/secret-free/);
    const tool = createF5xcCeV2SiteTool(pi, () =>
      driver({
        site: async () => ({
          metadata: { name: 'ce-demo' },
          bootstrap_token: 'fixture-secret-value',
          nested: { password: 'also-secret' },
        }),
      }),
    );
    const result = await tool.execute(
      'id',
      { action: 'read', namespace: 'system', siteName: 'ce-demo' },
      undefined,
      undefined,
      ctx(),
    );
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).not.toContain('fixture-secret-value');
    expect(JSON.stringify(result)).not.toContain('also-secret');
  });
});

describe('f5xc_ce_v2_capabilities', () => {
  it('returns canonical non-secret capability evidence', async () => {
    const tool = createF5xcCeV2CapabilitiesTool(pi, () => driver());
    const result = await tool.execute('id', {}, undefined, undefined, ctx());
    expect(result.isError).not.toBe(true);
    expect(result.details.capabilities).toEqual({
      smsv2ContractVersion: 'v2',
      supportedProviders: ['aws', 'azure'],
      bootstrapDrivers: ['api'],
      providerNetworkingProfiles: {
        aws: ['direct-eni', 'nlb-ingress', 'tgw-static'],
        azure: ['direct-nic', 'route-server-bgp'],
      },
      awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
    });
    expect(JSON.stringify(result)).not.toMatch(/token|password|secret/i);
  });
});

describe('f5xc_ce_v2_status', () => {
  it('returns only allowlisted non-secret evidence', async () => {
    const tool = createF5xcCeV2StatusTool(pi, () => driver());
    const result = await tool.execute('id', { namespace: 'system', siteName: 'ce-demo' }, undefined, undefined, ctx());
    expect(result.isError).not.toBe(true);
    expect(result.details.evidence?.bgp.established).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/token|password|secret/i);
  });
});
