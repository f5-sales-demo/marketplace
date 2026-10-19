import { afterEach, expect } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { GCP_CE_API_RELEASE } from '../../src/ce/contract';
import type { GcpDeploymentSources } from '../../src/ce/deployment-review';
import { fingerprint } from '../../src/ce/discovery';
import {
  publicTerraformAddresses,
  publicTerraformCloudScope,
  publicTerraformSelections,
} from '../../src/ce/terraform-public-ownership';
import type { GcpTerraformTeardownRuntime } from '../../src/ce/terraform-teardown';
import { discovery, intent } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
export async function fixture() {
  const i = structuredClone(intent());
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  i.image.name += '-byol';
  i.image.selfLink += '-byol';
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'public-tf-test-')));
  roots.push(directory);
  const files = new Map<string, unknown>();
  const store = {
    directory,
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
  };
  const boundary = {
    release: GCP_CE_API_RELEASE,
    fingerprint: fingerprint('contract'),
    availability: 'unavailable' as const,
    reason: 'gcp_provider_requires_consumer_qualification' as const,
    singleNodeLifecycle: { availability: 'evidence_backed_single_node' },
  };
  const policy = {
    identity: 'f5xc-ce-automation-policy/v2' as const,
    url: 'https://example.test/policy',
    observedAt: new Date().toISOString(),
    normalizedSha256: fingerprint('policy'),
  };
  const funding = {
    schemaVersion: 1 as const,
    project: i.project,
    accountDomain: 'example.com',
    organizationDomain: 'example.com',
    billingAccountName: 'billingAccounts/000000-000000-000000',
    billingEnabled: true as const,
    policySha256: fingerprint('funding'),
    observedAt: new Date().toISOString(),
    sourceReceipts: Array.from({ length: 4 }, (_, n) => ({ source: String(n), sha256: fingerprint(n) })),
  };
  const byol = { authorizationHash: fingerprint('byol') };
  const sources: GcpDeploymentSources = {
    contract: async () => boundary,
    policy: async () => policy,
    discovery: async () => ({ ...discovery(), images: [i.image] }),
    funding: async () => funding,
    byol: async () => byol,
    preflight: async () => ({
      schemaVersion: 1,
      project: i.project,
      region: i.region,
      intentFingerprint: fingerprint(i),
      observedAt: new Date().toISOString(),
      receipts: [],
      checks: {
        iam: 'verified',
        quota: 'verified',
        organizationPolicy: 'verified',
        image: 'verified',
        machineNicLimit: 'verified',
        zone: 'verified',
        licenseUseFee: 'none',
        legalAcceptance: 'unknown',
        zoneCapacity: 'not-reserved',
      },
    }),
  };
  const addresses = publicTerraformAddresses(i),
    scope = publicTerraformCloudScope(i);
  const original: PlanReceipt = {
    schemaVersion: 1,
    deploymentId: i.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${i.deploymentName}`,
    configurationSha256: 'a'.repeat(64),
    providerLockSha256: 'b'.repeat(64),
    planSha256: 'c'.repeat(64),
    noChanges: false,
    changes: addresses.map((address) => ({ address, type: address.split('.')[0], actions: ['create'] })),
  };
  const complete: Record<string, Record<string, unknown> | null> = {};
  for (let n = 0; n < 6; n++) {
    const row = scope[n];
    const nic = i.sites[0].nodes[0].interfaces.find((nic) => row.selfLink.endsWith(`/${nic.subnet}`));
    complete[addresses[n]] = {
      name: row.selfLink.split('/').at(-1),
      project: i.project,
      self_link: row.selfLink,
      ...(n < 2 ? { zone: i.sites[0].nodes[0].zone } : {}),
      ...{
        instance: {
          instance_id: String(n + 10),
          'boot_disk.length': 1,
          'boot_disk.0.source': scope[1].selfLink,
          'boot_disk.0.auto_delete': false,
          'network_interface.length': 2,
          ...Object.fromEntries(
            [0, 1].flatMap((n) => [
              [`network_interface.${n}.network`, scope[2 + n * 2].selfLink],
              [`network_interface.${n}.subnetwork`, scope[3 + n * 2].selfLink],
            ]),
          ),
        },
        disk: { disk_id: String(n + 10) },
        network: { numeric_id: String(n + 10) },
        subnetwork: {
          subnetwork_id: String(n + 10),
          region: i.region,
          network: scope.find((r) => r.kind === 'network' && r.selfLink.endsWith(`/${nic?.network}`))?.selfLink,
          ip_cidr_range: nic?.cidr,
        },
      }[row.kind],
    };
  }
  complete[addresses[6]] = {
    name: i.sites[0].name,
    namespace: 'system',
    creation_identity_sha256: fingerprint('site-uid'),
  };
  complete[addresses[7]] = {
    name: `${i.sites[0].nodes[0].name}-token`,
    namespace: 'system',
    site_name: i.sites[0].name,
    creation_identity_sha256: fingerprint('token-uid'),
  };
  let fields = Object.fromEntries(addresses.map((a) => [a, null])) as typeof complete;
  let checkpoint: 'planned' | 'applying' | 'applied' = 'planned',
    applies = 0,
    reconciles = 0,
    followPlans = 0,
    fail: 'none' | 'success' | 'partial' | 'before' = 'none';
  const live = new Map<string, { id: string; selfLink: string }>();
  const session = {
    plan: async () => {
      if (checkpoint === 'planned' && !applies) return structuredClone(original);
      followPlans++;
      return {
        ...original,
        planSha256: 'd'.repeat(64),
        noChanges: true,
        changes: addresses.map((address) => ({ address, type: address.split('.')[0], actions: ['no-op'] })),
      };
    },
    readConfigurationSha256: async () => original.configurationSha256,
    readApplyCheckpoint: async (receipt: PlanReceipt) => {
      if (followPlans) throw new Error('superseded');
      if (fingerprint(receipt) !== fingerprint(original)) throw new Error('changed binary');
      return { schemaVersion: 1, planSha256: receipt.planSha256, state: checkpoint };
    },
    apply: async () => {
      if (fail === 'before') {
        fail = 'none';
        throw new Error('before submission');
      }
      applies++;
      checkpoint = 'applying';
      fields = structuredClone(complete);
      if (fail === 'partial') {
        for (const a of addresses.slice(0, 1).concat(addresses.slice(6))) fields[a] = null;
      }
      for (let n = 0; n < 6; n++)
        if (fields[addresses[n]]) live.set(scope[n].selfLink, { id: String(n + 10), selfLink: scope[n].selfLink });
      if (fail !== 'none') {
        fail = 'none';
        throw new Error('interrupted private-token-fixture');
      }
      checkpoint = 'applied';
    },
    readApplyAttemptResourceFields: async (receipt: PlanReceipt, selections: Record<string, string[]>) => {
      expect(selections).toEqual(publicTerraformSelections(i));
      if (checkpoint === 'planned' || followPlans) throw new Error('unsubmitted');
      return {
        schemaVersion: 1,
        planSha256: receipt.planSha256,
        applyState: checkpoint,
        stateSha256: fingerprint(fields).slice(7),
        lineage: 'owned-lineage',
        serial: 1,
        resources: structuredClone(fields),
      };
    },
    reconcileApplyFromEvidence: async () => {
      reconciles++;
      checkpoint = 'applied';
    },
  } as unknown as GcpTerraformTeardownRuntime['session'];
  const runtime: GcpTerraformTeardownRuntime = {
    store,
    session,
    environment: { XCSH_API_TOKEN: 'private-token-fixture' },
    api: {
      exec: async (_command, args) => {
        const name = args[args.indexOf('describe') + 1];
        const row = Array.from(live.values()).find((r) =>
          r.selfLink.endsWith(
            `/${args.includes('subnets') ? 'subnetworks' : args.includes('instances') ? 'instances' : args.includes('disks') ? 'disks' : 'networks'}/${name}`,
          ),
        );
        return row
          ? { exitCode: 0, stdout: JSON.stringify(row), stderr: '' }
          : { exitCode: 1, stdout: '', stderr: 'not found' };
      },
    },
    observePlatform: async () => ({
      siteName: i.sites[0].name,
      tokenName: `${i.sites[0].nodes[0].name}-token`,
      siteAbsent: !fields[addresses[6]],
      tokenAbsent: !fields[addresses[7]],
      siteIdentitySha256: fields[addresses[6]] ? fingerprint('site-uid') : undefined,
      tokenIdentitySha256: fields[addresses[7]] ? fingerprint('token-uid') : undefined,
    }),
  };
  const inputs = {
    schemaVersion: 1,
    inputs: {
      intent: i,
      configurationVersion: 2,
      versions: { terraform: '1.16.6', google: '8.7.0', xcsh: '15.12.2' },
      providerLock: 'fixed-lock',
      expectedLockSha256: `sha256:${original.providerLockSha256}`,
    },
  };
  files.set('gcp-terraform-session-inputs.json', inputs);
  files.set('gcp-terraform-input-identity.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
    configurationFingerprint: 'fixed',
    providerLockSha256: `sha256:${original.providerLockSha256}`,
  });
  return {
    i,
    files,
    runtime,
    sources,
    boundary,
    policy,
    funding,
    byol,
    original,
    live,
    complete,
    platform: { gcpObservations: async () => ({}) } as unknown as CePlatformService,
    applies: () => applies,
    reconciles: () => reconciles,
    followPlans: () => followPlans,
    setFail: (v: typeof fail) => {
      fail = v;
    },
    fields: () => fields,
  };
}
