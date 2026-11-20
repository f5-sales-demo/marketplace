import { expect, it } from 'bun:test';
import { fingerprint } from '../../src/ce/discovery';
import { observeGcpOwnedDeployment } from '../../src/ce/owned-status';
import { recordGcpResource } from '../../src/ce/ownership';
import { intent } from './fixtures';

function store() {
  const files = new Map<string, unknown>();
  return {
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
  };
}
it('requires exact complete ledger topology before any external observation', async () => {
  const s = store(),
    i = intent();
  let calls = 0;
  const source = () => {
    calls++;
    throw new Error('must not read');
  };
  await expect(observeGcpOwnedDeployment(s, i, source)).rejects.toThrow();
  await s.write('gcp-deployment-intent.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
  });
  await recordGcpResource(s, {
    id: '123',
    kind: 'instance',
    project: i.project,
    deploymentName: i.deploymentName,
    engine: i.engine,
    siteName: i.sites[0].name,
    nodeName: 'node-a',
    selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/us-central1-a/instances/node-a`,
  });
  await expect(observeGcpOwnedDeployment(s, i, source)).rejects.toThrow('identity differs');
  expect(calls).toBe(0);
});
it('collects cloud provisioning from exact ledger identities without inferring absent platform evidence', async () => {
  const s = store(),
    i = intent();
  const zone = i.sites[0].nodes[0].zone;
  await s.write('gcp-deployment-intent.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
  });
  await recordGcpResource(s, {
    id: '123',
    kind: 'instance',
    project: i.project,
    deploymentName: i.deploymentName,
    engine: i.engine,
    siteName: i.sites[0].name,
    nodeName: 'node-a',
    selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/${zone}/instances/node-a`,
  });
  const evidence = await observeGcpOwnedDeployment(s, i, (node, observedZone) => {
    expect(node).toBe('node-a');
    expect(observedZone).toBe(zone);
    return {
      cloud: async () => ({
        id: '123',
        name: node,
        zone: `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/${zone}`,
        status: 'RUNNING',
      }),
      configuration: async () => {
        throw new Error('PRIVATE');
      },
      registrations: async () => {
        throw new Error('must not read');
      },
      health: async () => {
        throw new Error('must not read');
      },
    };
  });
  expect(evidence.nodes[0].cloudProvisioning).toBe('running');
  expect(evidence.nodes[0].platformHealth).toBe('unknown');
  expect(evidence.haHealth).toBe('not-established');
  expect(evidence.absence).toBe('not-established');
  expect(JSON.stringify(evidence)).not.toContain('PRIVATE');
});

it('rejects caller topology or F5 context drift before external observation', async () => {
  const s = store(),
    i = intent();
  await s.write('gcp-deployment-intent.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
  });
  const changed = structuredClone(i);
  changed.platformContext = 'another-context';
  let reads = 0;
  await expect(
    observeGcpOwnedDeployment(s, changed, () => {
      reads++;
      throw new Error('must not read');
    }),
  ).rejects.toThrow('persisted deployment');
  expect(reads).toBe(0);
});

it('public HA status reports a versioned unknown result when scoped service evidence is unavailable', async () => {
  const s = store(),
    i = intent();
  i.engine = 'terraform';
  i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
    ...i.sites[0].nodes[0],
    name: `node-${suffix}`,
    zone: `northamerica-northeast1-${suffix}`,
  }));
  await s.write('gcp-terraform-input-identity.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
  });
  for (const [n, node] of i.sites[0].nodes.entries())
    await recordGcpResource(s, {
      id: String(n + 1),
      kind: 'instance',
      project: i.project,
      deploymentName: i.deploymentName,
      engine: i.engine,
      siteName: i.sites[0].name,
      nodeName: node.name,
      selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/${node.zone}/instances/${node.name}`,
    });
  const result = await observeGcpOwnedDeployment(s, i, () => ({
    cloud: async () => {
      throw new Error('PRIVATE');
    },
    configuration: async () => ({}),
    registrations: async () => ({}),
    health: async () => ({}),
    haHealth: async () => {
      throw new Error('PRIVATE');
    },
  }));
  expect(result.ha?.schemaVersion).toBe(1);
  expect(result.ha?.status).toBe('unknown');
  expect(result.ha?.sites[0].nodes).toHaveLength(3);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('rejects ledger mutation during reads without returning stale successful status', async () => {
  const s = store(),
    i = intent();
  await s.write('gcp-deployment-intent.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
  });
  await recordGcpResource(s, {
    id: '1',
    kind: 'instance',
    project: i.project,
    deploymentName: i.deploymentName,
    engine: i.engine,
    siteName: i.sites[0].name,
    nodeName: 'node-a',
    selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/${i.sites[0].nodes[0].zone}/instances/node-a`,
  });
  await expect(
    observeGcpOwnedDeployment(s, i, () => ({
      cloud: async () => {
        await s.write('gcp-resources.json', {});
        return {};
      },
      configuration: async () => ({}),
      registrations: async () => ({}),
      health: async () => ({}),
    })),
  ).rejects.toThrow('ledger');
});
