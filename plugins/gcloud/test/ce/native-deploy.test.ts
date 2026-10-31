import { expect, it } from 'bun:test';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { translateGcpNativeCompute } from '../../src/ce/compute-plan';
import { GCP_CE_API_RELEASE } from '../../src/ce/contract';
import { fingerprint } from '../../src/ce/discovery';
import { applyGcpNativeDeployment } from '../../src/ce/native-deploy';
import type { GcpQualificationGates } from '../../src/ce/qualification-gates';
import { intent } from './fixtures';

it('native orchestration rejects unavailable contract before storage or cloud mutations', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const p = translateGcpNativeCompute(i);
  let calls = 0;
  const platform = {
    storage: async () => {
      calls++;
      throw new Error('must not open');
    },
  } as unknown as CePlatformService;
  const gates = {
    schemaVersion: 1,
    project: i.project,
    region: i.region,
    engine: 'native',
    approvalPlanHash: p.sha256,
    apiContract: { publication: 'immutable-release', gcpMapping: 'unavailable', sha256: `sha256:${'a'.repeat(64)}` },
  } as GcpQualificationGates;
  await expect(
    applyGcpNativeDeployment(
      platform,
      {
        exec: async () => {
          calls++;
          throw new Error('must not run');
        },
      },
      i,
      p.sha256,
      gates,
    ),
  ).rejects.toThrow('qualified');
  expect(calls).toBe(0);
});

it('native funding drift fails before deployment storage, bootstrap checkout or cloud execution', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const p = translateGcpNativeCompute(i);
  let calls = 0;
  const funding = {
    schemaVersion: 1 as const,
    project: i.project,
    accountDomain: 'example.com',
    organizationDomain: 'example.com',
    billingAccountName: 'billingAccounts/000000-000000-000000',
    billingEnabled: true as const,
    policySha256: fingerprint('policy'),
    observedAt: new Date().toISOString(),
    sourceReceipts: Array.from({ length: 4 }, (_, n) => ({ source: String(n), sha256: fingerprint(n) })),
  };
  const gates: GcpQualificationGates = {
    schemaVersion: 1,
    project: i.project,
    region: i.region,
    engine: 'native',
    approvalPlanHash: p.sha256,
    apiContract: {
      publication: 'immutable-release',
      gcpMapping: 'available',
      sha256: GCP_CE_API_RELEASE.contractDigest,
    },
    policy: { identity: 'f5xc-ce-automation-policy/v2', sha256: fingerprint('policy'), verified: true },
    sharedRuntime: true,
    exactImageVerified: true,
    legalAcceptance: 'not-required',
    iamVerified: true,
    quotaVerified: true,
    organizationPolicyVerified: true,
    providerLocksVerified: false,
    fundingReceipt: funding,
  };
  const platform = {
    gcpLifecycle: {},
    storage: async () => {
      calls++;
      throw new Error('must not open');
    },
  } as unknown as CePlatformService;
  const api = {
    exec: async () => {
      calls++;
      throw new Error('must not execute');
    },
  };
  await expect(
    applyGcpNativeDeployment(platform, api, i, p.sha256, gates, undefined, async () => ({
      ...funding,
      billingAccountName: 'billingAccounts/111111-111111-111111',
    })),
  ).rejects.toThrow('funding receipt');
  await expect(
    applyGcpNativeDeployment(platform, api, i, p.sha256, gates, undefined, async () => ({
      ...funding,
      policySha256: fingerprint('changed-policy'),
    })),
  ).rejects.toThrow('policy changed');
  expect(calls).toBe(0);
});
