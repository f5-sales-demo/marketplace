import { expect, it } from 'bun:test';
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
