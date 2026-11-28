import { expect, it } from 'bun:test';
import type { GcpOperationalContract } from '../../src/ce/contract';
import { fingerprint } from '../../src/ce/discovery';
import { observeGcpOwnedDeployment } from '../../src/ce/owned-status';
import { recordGcpResource } from '../../src/ce/ownership';
import { intent } from './fixtures';
import { operationalFixture } from './operational-health.test';

async function fixture() {
  const f = operationalFixture(),
    i = intent();
  i.engine = 'terraform';
  i.sites[0].name = f.binding.siteName;
  i.sites[0].nodes = f.binding.nodes.map((node, index) => ({
    ...i.sites[0].nodes[0],
    name: node.nodeName,
    zone: `northamerica-northeast1-${['a', 'b', 'c'][index]}`,
  }));
  const files = new Map<string, unknown>();
  const store = {
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
  };
  await store.write('gcp-terraform-input-identity.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
  });
  for (const [index, node] of i.sites[0].nodes.entries())
    await recordGcpResource(store, {
      id: String(index + 1),
      kind: 'instance',
      project: i.project,
      deploymentName: i.deploymentName,
      engine: 'terraform',
      siteName: i.sites[0].name,
      nodeName: node.name,
      selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/${node.zone}/instances/${node.name}`,
    });
  const owned = {
    complete: true,
    intentFingerprint: fingerprint(i),
    platform: {
      [`xcsh_securemesh_site_v2.${f.binding.siteName.replaceAll('-', '_')}`]: f.binding.configurationIdentitySha256,
      ...Object.fromEntries(
        f.binding.nodes.map((node) => [`xcsh_token.${node.nodeName.replaceAll('-', '_')}`, node.tokenIdentitySha256]),
      ),
    },
  };
  f.binding.ownershipFingerprint = fingerprint(owned);
  f.collection.bindingBefore = structuredClone(f.binding);
  f.collection.bindingAfter = structuredClone(f.binding);
  const startedAt = Date.now() - 1000;
  f.collection.startedAt = new Date(startedAt).toISOString();
  f.collection.finishedAt = new Date(startedAt + 500).toISOString();
  for (const node of f.collection.nodes)
    for (const key of [
      'registration',
      'interfaces',
      'siteStatus',
      'components',
      'inventory',
      'runtime',
      'diagnostics',
    ] as const)
      node[key].observedAt = new Date(startedAt + 250).toISOString();
  const contractFingerprint = fingerprint(f.profile);
  const qualification = {
    schemaVersion: 2 as const,
    contractFingerprint,
    bindingFingerprint: fingerprint(f.binding),
    healthyRoundFingerprints: [fingerprint({ round: 1 }), fingerprint({ round: 2 })] as [string, string],
    evidenceSha256: fingerprint({ qualification: true }),
    campaignCleanupSha256: fingerprint({ cleaned: true }),
    objectsAbsent: 18 as const,
    emptyDestroy: true as const,
    stableState: true as const,
    repeatedResumeNoSubmission: true as const,
  };
  const contract: GcpOperationalContract = {
    profile: f.profile,
    contractFingerprint,
    qualification,
    qualificationFingerprint: fingerprint(qualification),
  };
  await store.write('gcp-tf-public-ownership.json', owned);
  await store.write('gcp-operational-original-binding.json', { contractFingerprint, binding: f.binding });
  const source = () => ({
    cloud: async () => {
      throw new Error('PRIVATE cloud unavailable');
    },
    configuration: async () => ({}),
    registrations: async () => ({}),
    health: async () => ({}),
    operationalHealthContract: contract,
    operationalHealth: async () => ({ binding: f.binding, collection: f.collection }),
  });
  return { ...f, i, store, contract, source, files };
}
it('public status returns v2 with complete original operational coverage', async () => {
  const f = await fixture();
  const result = await observeGcpOwnedDeployment(f.store, f.i, f.source);
  expect(result.schemaVersion).toBe(2);
  expect(result.operationalHealth?.status).toBe('healthy');
  expect(result.operationalHealth?.sites[0].coverage.containers).toBe('liveness-only');
  expect(result.operationalHealth?.sites[0].nodes).toHaveLength(3);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('unavailable collection preserves the v2 scope and requires fresh evidence', async () => {
  const f = await fixture();
  const result = await observeGcpOwnedDeployment(f.store, f.i, () => ({
    ...f.source(),
    operationalHealth: async () => {
      throw new Error('PRIVATE unavailable');
    },
  }));
  expect(result.operationalHealth?.status).toBe('unknown');
  expect(result.operationalHealth?.sites[0].nodes).toHaveLength(3);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('unavailable pinned qualification returns scoped v2 unknown without using the v1 collector', async () => {
  const f = await fixture();
  let reads = 0;
  const result = await observeGcpOwnedDeployment(f.store, f.i, () => ({
    ...f.source(),
    operationalHealthContract: undefined,
    operationalHealthExpected: {
      contractFingerprint: f.contract.contractFingerprint,
      qualificationFingerprint: f.contract.qualificationFingerprint,
    },
    haHealth: async () => {
      reads++;
      throw new Error('v1 fallback forbidden');
    },
    operationalHealth: async () => {
      reads++;
      throw new Error('unqualified collector forbidden');
    },
  }));
  expect(result.schemaVersion).toBe(2);
  expect(result.operationalHealth?.status).toBe('unknown');
  expect(result.operationalHealth?.sites[0].nodes).toHaveLength(3);
  expect(result.operationalHealth?.sites[0].contractFingerprint).toBe(f.contract.contractFingerprint);
  expect(result.operationalHealth?.sites[0].releaseQualificationFingerprint).toBe(f.contract.qualificationFingerprint);
  expect(reads).toBe(0);
  expect(result.ha).toBeUndefined();
});
it('foreign returned binding and changed release fingerprints cannot qualify', async () => {
  for (const change of ['foreign', 'qualification']) {
    const f = await fixture();
    if (change === 'qualification') f.contract.qualificationFingerprint = fingerprint({ changed: true });
    const result = await observeGcpOwnedDeployment(f.store, f.i, () => ({
      ...f.source(),
      operationalHealth: async () => ({
        collection: f.collection,
        binding:
          change === 'foreign' ? { ...f.binding, runtimeIdentitySha256: fingerprint({ replaced: true }) } : f.binding,
      }),
    }));
    expect(result.operationalHealth?.status).toBe('unknown');
  }
});
it('keeps a required component failure when another required runtime read is unavailable', async () => {
  const f = await fixture();
  const projection = f.collection.nodes[0].components.projection as Array<{ name: string; state: string }>;
  projection[0].state = 'Failed';
  f.collection.nodes[0].components.projectionFingerprint = fingerprint(projection);
  f.collection.nodes[1].runtime.available = false;
  const result = await observeGcpOwnedDeployment(f.store, f.i, f.source);
  expect(result.operationalHealth?.status).toBe('unknown');
  expect(result.operationalHealth?.sites[0].nodes[0].knownFailures.length).toBeGreaterThan(0);
});
