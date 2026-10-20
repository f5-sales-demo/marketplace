import { expect, it } from 'bun:test';
import {
  gcpRuntimeCommand,
  parseGcpRuntimeListing,
  projectGcpRuntimeInspection,
} from '../../src/ce/gcp-runtime-diagnostics';

const table =
  'CONTAINER IMAGE CREATED STATE NAME ATTEMPT POD ID POD\nabcdef123456 image-hash 2 hours ago Running coredns 0 123456abcdef coredns-abc';
const node = { nodeName: 'node-a', instanceId: '1' };
const ownershipFingerprint = `sha256:${'a'.repeat(64)}`;
function listing() {
  return {
    ...node,
    ownershipFingerprint,
    observedAt: '2026-10-19T18:00:00Z',
    containers: parseGcpRuntimeListing(table),
  };
}
const now = Date.parse('2026-10-19T18:00:10Z');
it('uses only the fixed commands and an exact node-bound current listing', () => {
  expect(gcpRuntimeCommand(node, ownershipFingerprint, { kind: 'list' })).toEqual(['crictl-ps-a']);
  expect(
    gcpRuntimeCommand(
      node,
      ownershipFingerprint,
      { kind: 'inspect', containerId: 'abcdef123456', listing: listing() },
      now,
    ),
  ).toEqual(['crictl-inspect', 'abcdef123456']);
  for (const containerId of ['$(id)', '../secret', ['abcdef123456', 'id'].join(';'), '--help', '123456abcdef'])
    expect(() =>
      gcpRuntimeCommand(node, ownershipFingerprint, { kind: 'inspect', containerId, listing: listing() }, now),
    ).toThrow();
  for (const changed of [
    { nodeName: 'node-b' },
    { instanceId: '2' },
    { ownershipFingerprint: `sha256:${'b'.repeat(64)}` },
    { observedAt: 'invalid' },
    { observedAt: '2026-10-19T17:00:00Z' },
    { observedAt: '2026-10-19T19:00:00Z' },
  ])
    expect(() =>
      gcpRuntimeCommand(
        node,
        ownershipFingerprint,
        { kind: 'inspect', containerId: 'abcdef123456', listing: { ...listing(), ...changed } },
        now,
      ),
    ).toThrow();
});
it('rejects malformed, wrapped, duplicate and prefix-ambiguous listings', () => {
  for (const value of [
    null,
    '',
    'error: forbidden',
    `${table}\ntruncated`,
    table.replace('Running', 'Ready'),
    table.replace('abcdef123456', '--help'),
    table.replace(' 0 ', ' 9007199254740992 '),
    `${table}\n${table.split('\n')[1]}`,
    `${table}\n${table.split('\n')[1].replace('abcdef123456', 'abcdef1234567890')}`,
    `\u001b[0m${table}`,
  ])
    expect(() => parseGcpRuntimeListing(value)).toThrow();
});
it('projects only matched identity and liveness, withholding sensitive inspection fields', () => {
  const row = listing().containers[0];
  const raw = {
    status: {
      id: 'abcdef1234567890',
      state: 'CONTAINER_RUNNING',
      metadata: { name: 'coredns', attempt: 0 },
      labels: { 'io.kubernetes.pod.name': 'coredns-abc', secret: 'PRIVATE' },
      env: { TOKEN: 'PRIVATE' },
    },
    info: { runtimeSpec: 'PRIVATE' },
  };
  const result = projectGcpRuntimeInspection(raw, row);
  expect(result.liveness).toBe('running');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(JSON.stringify(result)).not.toContain('abcdef123456');
  for (const changed of [
    { id: '123456abcdef' },
    { state: 'CONTAINER_EXITED' },
    { metadata: { name: 'foreign', attempt: 0 } },
    { metadata: { name: 'coredns', attempt: 1 } },
    { labels: { 'io.kubernetes.pod.name': 'foreign' } },
  ])
    expect(() => projectGcpRuntimeInspection({ ...raw, status: { ...raw.status, ...changed } }, row)).toThrow();
});
it('parses the live namespace column and requires that namespace in the inspection join', () => {
  const live = table.replace('POD ID POD\n', 'POD ID POD NAMESPACE\n') + ' kube-system\n';
  const row = parseGcpRuntimeListing(live)[0];
  expect(row.namespace).toBe('kube-system');
  const raw = {
    status: {
      id: 'abcdef1234567890',
      state: 'CONTAINER_RUNNING',
      metadata: { name: 'coredns', attempt: 0 },
      labels: { 'io.kubernetes.pod.name': 'coredns-abc', 'io.kubernetes.pod.namespace': 'kube-system' },
    },
  };
  expect(projectGcpRuntimeInspection(raw, row).liveness).toBe('running');
  raw.status.labels['io.kubernetes.pod.namespace'] = 'foreign';
  expect(() => projectGcpRuntimeInspection(raw, row)).toThrow();
  expect(() => parseGcpRuntimeListing(table + ' kube-system')).toThrow();
  expect(() => parseGcpRuntimeListing(live.replace(' kube-system', ''))).toThrow();
});
