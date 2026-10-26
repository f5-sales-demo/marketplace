import { expect, it } from 'bun:test';
import { fingerprint } from '../../src/ce/discovery';
import {
  evaluateGcpOperationalHealth,
  GCP_OPERATIONAL_AUXILIARIES,
  GCP_OPERATIONAL_CORE_SEED,
  GCP_OPERATIONAL_DEPENDENCIES,
  matchesGcpOperationalPod,
  type OperationalBinding,
  type OperationalCollection,
  type OperationalProfile,
  qualifiedOperationalProfile,
  qualifiedOperationalRelease,
} from '../../src/ce/operational-health';

const hash = (n: number) => fingerprint({ n });
const now = Date.parse('2026-10-19T18:00:10Z');
export function operationalFixture() {
  const profile: OperationalProfile = {
    schemaVersion: 2,
    scope: 'original-three-node-operational-health',
    maximumAgeMs: 300000,
    minimumRoundIntervalMs: 45000,
    sourceHashes: { schema: hash(1), catalogue: hash(2) },
    parserVersions: { runtime: 'crictl/v1', site: 'site/v1' },
    inventoryServices: [...GCP_OPERATIONAL_CORE_SEED],
    verRunningStates: ['running'],
    roles: {
      control: {
        components: [...GCP_OPERATIONAL_CORE_SEED],
        containers: [...GCP_OPERATIONAL_CORE_SEED, ...GCP_OPERATIONAL_DEPENDENCIES].map((service) => ({
          service,
          name: service,
          podPrefix: `${service}-`,
          namespace: 'default',
          podShape: 'daemon' as const,
        })),
        diagnostics: ['peer-connectivity', 'required-domains'],
      },
    },
    exclusions: GCP_OPERATIONAL_AUXILIARIES.map((service) => ({
      service,
      evidenceSha256: hash(3),
      reason: 'auxiliary-outside-operational-scope',
    })),
    qualification: { evidenceSha256: hash(4), discoveryCleanupSha256: hash(5) },
  };
  const binding: OperationalBinding = {
    contextFingerprint: hash(7),
    ownershipFingerprint: hash(8),
    configurationIdentitySha256: hash(9),
    runtimeIdentitySha256: hash(10),
    siteName: 'site-a',
    nodes: ['a', 'b', 'c'].map((suffix, i) => ({
      nodeName: `node-${suffix}`,
      instanceId: String(i + 1),
      registrationIdentitySha256: hash(20 + i),
      tokenIdentitySha256: hash(30 + i),
      role: 'control',
      nics: [hash(40 + i * 2), hash(41 + i * 2)],
    })),
  };
  const read = (projection: unknown) => ({
    available: true,
    observedAt: '2026-10-19T18:00:00.500Z',
    projection,
    projectionFingerprint: fingerprint(projection),
  });
  const collection: OperationalCollection = {
    schemaVersion: 2,
    bindingBefore: structuredClone(binding),
    bindingAfter: structuredClone(binding),
    contractFingerprint: fingerprint(profile),
    qualificationFingerprint: fingerprint(profile.qualification),
    startedAt: '2026-10-19T18:00:00Z',
    finishedAt: '2026-10-19T18:00:01Z',
    nodes: binding.nodes.map((node, i) => ({
      nodeName: node.nodeName,
      registration: read({ state: 'ONLINE', identitySha256: node.registrationIdentitySha256 }),
      interfaces: read(node.nics),
      siteStatus: read({
        role: node.role,
        runtimeIdentitySha256: binding.runtimeIdentitySha256,
        verState: 'running',
        interfacesUp: [true, true],
        healthScore: 0,
      }),
      components: read(profile.roles.control.components.map((name) => ({ name, state: 'Ready' }))),
      inventory: read(profile.inventoryServices.map((service) => ({ service }))),
      runtime: read(
        profile.roles.control.containers.map((mapping, j) => ({
          containerIdentitySha256: hash(100 + 100 * i + j),
          name: mapping.name,
          pod: `${mapping.service}-abc12`,
          namespace: mapping.namespace,
          liveness: 'running',
        })),
      ),
      diagnostics: read({
        peers: binding.nodes
          .filter((peer) => peer !== node)
          .map((peer) => ({ nodeName: peer.nodeName, instanceId: peer.instanceId })),
        checks: { 'peer-connectivity': 'pass', 'required-domains': 'pass' },
        gatewayIcmp: 'fail',
      }),
    })),
  };
  return { profile, binding, collection };
}
function evaluate(f = operationalFixture()) {
  return evaluateGcpOperationalHealth(f.collection, f.binding, f.profile, fingerprint(f.profile), now);
}
function rewrite(
  f: ReturnType<typeof operationalFixture>,
  key: keyof OperationalCollection['nodes'][number],
  projection: unknown,
) {
  if (key === 'nodeName') throw new Error('Invalid fixture key');
  f.collection.nodes[0][key] = {
    available: true,
    observedAt: '2026-10-19T18:00:00.500Z',
    projection,
    projectionFingerprint: fingerprint(projection),
  };
}
it('requires every declared check for all originals and accurately states liveness coverage', () => {
  const result = evaluate();
  expect(result.status).toBe('healthy');
  expect(result.nodes).toHaveLength(3);
  expect(result.coverage.containers).toBe('liveness-only');
  expect(result.coverage.gatewayIcmp).toBe('informational');
  const { projectionFingerprint, ...projection } = result;
  expect(projectionFingerprint).toBe(fingerprint(projection));
});
it('rejects omitted core services, dependencies, smaller profiles and invented auxiliary exclusions', () => {
  for (const service of GCP_OPERATIONAL_CORE_SEED) {
    const f = operationalFixture();
    rewrite(
      f,
      'components',
      f.profile.roles.control.components.filter((name) => name !== service).map((name) => ({ name, state: 'Ready' })),
    );
    expect(evaluate(f).status).toBe('unknown');
  }
  for (const service of GCP_OPERATIONAL_DEPENDENCIES) {
    const f = operationalFixture();
    rewrite(
      f,
      'runtime',
      (f.collection.nodes[0].runtime.projection as Array<{ name: string }>).filter((r) => r.name !== service),
    );
    expect(evaluate(f).status).toBe('unknown');
    f.profile.roles.control.containers = f.profile.roles.control.containers.filter((r) => r.service !== service);
    expect(qualifiedOperationalProfile(f.profile, fingerprint(f.profile))).toBe(false);
  }
  const f = operationalFixture();
  f.profile.inventoryServices.pop();
  expect(qualifiedOperationalProfile(f.profile, fingerprint(f.profile))).toBe(false);
  f.profile.exclusions[0].service = 'coredns';
  expect(qualifiedOperationalProfile(f.profile, fingerprint(f.profile))).toBe(false);
});
it('normalizes identical repeated references and rejects conflicting inventory and duplicate status identities', () => {
  const f = operationalFixture();
  const rows = f.collection.nodes[0].inventory.projection as Array<{ service: string }>;
  rewrite(f, 'inventory', [...rows, rows[0], rows[0]]);
  expect(evaluate(f).status).toBe('healthy');
  expect(evaluate(f).nodes[0].repeatedInventoryReferences).toBe(2);
  rewrite(f, 'inventory', [...rows, { ...rows[0], changed: true }]);
  expect(evaluate(f).status).toBe('unknown');
  const components = f.collection.nodes[0].components.projection as unknown[];
  rewrite(f, 'components', [...components, components[0]]);
  expect(evaluate(f).status).toBe('unknown');
});
it('retains validated failures while missing or malformed required evidence yields unknown', () => {
  const f = operationalFixture();
  rewrite(
    f,
    'components',
    f.profile.roles.control.components.map((name) => ({ name, state: name === 'etcd' ? 'Failed' : 'Ready' })),
  );
  expect(evaluate(f).status).toBe('degraded');
  f.collection.nodes[0].runtime = { available: false, observedAt: '2026-10-19T18:00:00.500Z' };
  expect(evaluate(f).status).toBe('unknown');
  expect(evaluate(f).nodes[0].knownFailures).toContain('component:etcd');
  for (const key of [
    'registration',
    'interfaces',
    'siteStatus',
    'components',
    'inventory',
    'runtime',
    'diagnostics',
  ] as const)
    for (const invalid of [null, 'malformed', {}, []]) {
      const g = operationalFixture();
      rewrite(g, key, invalid);
      expect(evaluate(g).status).toBe('unknown');
    }
});
it('rejects changed identities, roles, NIC joins, peer joins, stale reads and profile fingerprints', () => {
  for (const field of ['instanceId', 'role', 'registrationIdentitySha256', 'tokenIdentitySha256'] as const) {
    const f = operationalFixture();
    if (f.collection.bindingAfter) f.collection.bindingAfter.nodes[0][field] = 'changed';
    expect(evaluate(f).status).toBe('unknown');
  }
  for (const key of [
    'contextFingerprint',
    'ownershipFingerprint',
    'configurationIdentitySha256',
    'runtimeIdentitySha256',
  ] as const) {
    const f = operationalFixture();
    if (f.collection.bindingAfter) f.collection.bindingAfter[key] = hash(999);
    expect(evaluate(f).status).toBe('unknown');
  }
  const f = operationalFixture();
  f.collection.nodes[0].nodeName = 'foreign';
  expect(evaluate(f).status).toBe('unknown');
  const g = operationalFixture();
  rewrite(g, 'interfaces', [hash(88), hash(89)]);
  expect(evaluate(g).status).toBe('unknown');
  const h = operationalFixture();
  rewrite(h, 'diagnostics', { peers: [], checks: { 'peer-connectivity': 'pass', 'required-domains': 'pass' } });
  expect(evaluate(h).status).toBe('unknown');
  const j = operationalFixture();
  j.collection.nodes[0].runtime.observedAt = '2026-10-19T17:00:00Z';
  expect(evaluate(j).status).toBe('unknown');
  expect(evaluateGcpOperationalHealth(j.collection, j.binding, j.profile, hash(99), now).status).toBe('unknown');
});
it('withholds arbitrary raw and sensitive projection fields from public hashes and output', () => {
  const f = operationalFixture();
  Object.assign(f.profile.exclusions[0], { privateEvidence: 'PRIVATE' });
  f.collection.contractFingerprint = fingerprint(f.profile);
  rewrite(f, 'registration', {
    state: 'ONLINE',
    identitySha256: f.binding.nodes[0].registrationIdentitySha256,
    token: 'PRIVATE',
    message: 'PRIVATE',
  });
  const output = evaluate(f);
  expect(output.status).toBe('healthy');
  expect(JSON.stringify(output)).not.toContain('PRIVATE');
});

it('requires requalification for component coverage drift and gives non-online registrations fixed reasons', () => {
  const f = operationalFixture();
  const rows = f.collection.nodes[0].components.projection as Array<{ name: string; state: string }>;
  rewrite(f, 'components', [...rows, { name: 'new-service', state: 'Ready' }]);
  expect(evaluate(f).status).toBe('unknown');
  const g = operationalFixture();
  rewrite(g, 'registration', { state: 'OFFLINE', identitySha256: g.binding.nodes[0].registrationIdentitySha256 });
  const result = evaluate(g);
  expect(result.status).toBe('degraded');
  expect(result.nodes[0].checks.find((c) => c.check === 'registration')?.reasonCode).toBe(
    'registration-not-online-or-invalid',
  );
});

it('qualifies frozen role-dependent placement without dropping required services from the actual node set', () => {
  const f = operationalFixture();
  const primary = structuredClone(f.profile.roles.control);
  f.profile.roles.primary = primary;
  f.profile.roles.control.components = f.profile.roles.control.components.filter((name) => name !== 'etcd');
  f.profile.roles.control.containers = f.profile.roles.control.containers.filter((c) => c.service !== 'etcd');
  f.binding.nodes[0].role = 'primary';
  f.collection.bindingBefore = structuredClone(f.binding);
  f.collection.bindingAfter = structuredClone(f.binding);
  f.collection.contractFingerprint = fingerprint(f.profile);
  const update = (index: number, key: 'siteStatus' | 'components' | 'inventory' | 'runtime', projection: unknown) => {
    f.collection.nodes[index][key].projection = projection;
    f.collection.nodes[index][key].projectionFingerprint = fingerprint(projection);
  };
  update(0, 'siteStatus', { ...(f.collection.nodes[0].siteStatus.projection as object), role: 'primary' });
  for (const index of [1, 2]) {
    update(
      index,
      'components',
      f.profile.roles.control.components.map((name) => ({ name, state: 'Ready' })),
    );
    update(
      index,
      'inventory',
      f.profile.roles.control.components.map((service) => ({ service })),
    );
    update(
      index,
      'runtime',
      (f.collection.nodes[index].runtime.projection as Array<{ name: string }>).filter((r) => r.name !== 'etcd'),
    );
  }
  expect(evaluate(f).status).toBe('healthy');
  f.binding.nodes[0].role = 'control';
  f.collection.bindingBefore = structuredClone(f.binding);
  f.collection.bindingAfter = structuredClone(f.binding);
  expect(evaluate(f).status).toBe('unknown');
  expect(evaluate(f).reasonCodes).toContain('required-service-placement-uncovered');
});
it('distinguishes daemon and deployment pods sharing a service prefix', () => {
  const daemon = { podPrefix: 'ver-', podShape: 'daemon' as const };
  const deployment = { podPrefix: 'ver-', podShape: 'deployment' as const };
  expect(matchesGcpOperationalPod('ver-abc12', daemon)).toBe(true);
  expect(matchesGcpOperationalPod('ver-55b8559b8-sfb88', daemon)).toBe(false);
  expect(matchesGcpOperationalPod('ver-55b8559b8-sfb88', deployment)).toBe(true);
  expect(matchesGcpOperationalPod('ver-abc12', deployment)).toBe(false);
});

it('accepts the observed VER enum and requires frozen pod shapes', () => {
  const f = operationalFixture();
  f.profile.verRunningStates = ['OPERATIONAL_READY'];
  for (const row of f.collection.nodes) {
    const site = row.siteStatus.projection as { verState: string };
    site.verState = 'OPERATIONAL_READY';
    row.siteStatus.projectionFingerprint = fingerprint(site);
  }
  f.collection.contractFingerprint = fingerprint(f.profile);
  expect(evaluate(f).status).toBe('healthy');
  delete f.profile.roles.control.containers[0].podShape;
  expect(qualifiedOperationalProfile(f.profile, fingerprint(f.profile))).toBe(false);
});
it('requires auxiliary placement across actual roles and unique checks for multiple service containers', () => {
  const f = operationalFixture();
  const auxiliary = 'kube-state-metrics';
  f.profile.exclusions = f.profile.exclusions.filter((e) => e.service !== auxiliary);
  f.profile.roles.primary = structuredClone(f.profile.roles.control);
  f.profile.roles.primary.containers.push({
    service: auxiliary,
    name: auxiliary,
    namespace: 'default',
    podPrefix: `${auxiliary}-`,
    podShape: 'daemon',
  });
  expect(qualifiedOperationalProfile(f.profile, fingerprint(f.profile))).toBe(true);
  f.collection.contractFingerprint = fingerprint(f.profile);
  expect(evaluate(f).reasonCodes).toContain('required-service-placement-uncovered');
  f.profile.exclusions.push({
    service: auxiliary,
    reason: 'auxiliary-outside-operational-scope',
    evidenceSha256: hash(3),
  });
  const second = { ...f.profile.roles.control.containers[0], name: 'secondary' };
  f.profile.roles.control.containers.push(second);
  for (const [i, row] of f.collection.nodes.entries()) {
    const runtime = row.runtime.projection as Array<Record<string, unknown>>;
    runtime.push({
      containerIdentitySha256: hash(500 + i),
      name: 'secondary',
      pod: `${second.podPrefix}abc12`,
      namespace: 'default',
      liveness: 'running',
    });
    row.runtime.projectionFingerprint = fingerprint(runtime);
  }
  f.collection.contractFingerprint = fingerprint(f.profile);
  const result = evaluate(f);
  expect(result.status).toBe('healthy');
  for (const node of result.nodes)
    expect(new Set(node.checks.map((check) => check.check)).size).toBe(node.checks.length);
});

it('keeps release qualification separate from the unchanged candidate contract', () => {
  const f = operationalFixture();
  const contractFingerprint = fingerprint(f.profile);
  const receipt = {
    schemaVersion: 2,
    contractFingerprint,
    bindingFingerprint: fingerprint(f.binding),
    healthyRoundFingerprints: [hash(800), hash(801)],
    evidenceSha256: hash(802),
    campaignCleanupSha256: hash(803),
    objectsAbsent: 18,
    emptyDestroy: true,
    stableState: true,
    repeatedResumeNoSubmission: true,
  };
  expect(qualifiedOperationalRelease(receipt, fingerprint(receipt), contractFingerprint)).toBe(true);
  expect(
    qualifiedOperationalRelease(f.profile.qualification, fingerprint(f.profile.qualification), contractFingerprint),
  ).toBe(false);
  expect(qualifiedOperationalRelease(receipt, hash(804), contractFingerprint)).toBe(false);
  expect(qualifiedOperationalRelease(receipt, fingerprint(receipt), hash(805))).toBe(false);
  for (const field of ['objectsAbsent', 'emptyDestroy', 'stableState', 'repeatedResumeNoSubmission']) {
    const candidate = { ...receipt, [field]: false };
    expect(qualifiedOperationalRelease(candidate, fingerprint(candidate), contractFingerprint)).toBe(false);
  }
  receipt.healthyRoundFingerprints[1] = receipt.healthyRoundFingerprints[0];
  expect(qualifiedOperationalRelease(receipt, fingerprint(receipt), contractFingerprint)).toBe(false);
  expect(fingerprint(f.profile)).toBe(contractFingerprint);
});

it('retains known component failures alongside unexpected workload placement', () => {
  const f = operationalFixture();
  rewrite(f, 'components', [
    ...f.profile.roles.control.components.map((name) => ({ name, state: name === 'etcd' ? 'Failed' : 'Ready' })),
    { name: 'unexpected', state: 'Ready' },
  ]);
  const result = evaluate(f);
  expect(result.status).toBe('unknown');
  expect(result.nodes[0].knownFailures).toContain('component:etcd');
});
it('requires fresh placement evidence and preserves liveness failures when a workload moves', () => {
  const f = operationalFixture();
  f.profile.roles.control.runtimeRole = 'k8s-master-primary';
  f.profile.placementCounts = Object.fromEntries(f.profile.roles.control.containers.map((c) => [c.service, 3]));
  f.collection.contractFingerprint = fingerprint(f.profile);
  for (const node of f.collection.nodes) {
    node.siteStatus.projection = { ...(node.siteStatus.projection as object), runtimeRole: 'k8s-master-primary' };
    node.siteStatus.projectionFingerprint = fingerprint(node.siteStatus.projection);
    node.runtime.projection = { schemaVersion: 2, placementState: 'unchanged', containers: node.runtime.projection };
    node.runtime.projectionFingerprint = fingerprint(node.runtime.projection);
  }
  expect(evaluate(f).status).toBe('healthy');
  const runtime = f.collection.nodes[0].runtime.projection as {
    placementState: string;
    containers: Array<{ name: string; liveness: string }>;
  };
  runtime.placementState = 'drift';
  runtime.containers.find((row) => row.name === 'etcd')!.liveness = 'not-running';
  f.collection.nodes[0].runtime.projectionFingerprint = fingerprint(runtime);
  const result = evaluate(f);
  expect(result.status).toBe('unknown');
  expect(result.nodes[0].knownFailures.some((check) => check.startsWith('container:etcd:'))).toBe(true);
  expect(result.nodes[0].checks.find((check) => check.check === 'runtime-placement')?.reasonCode).toBe(
    'runtime-placement-requalification-required',
  );
});
