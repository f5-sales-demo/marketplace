/** Transfer consistency only; these packets cannot provide original source authority. */
import { expect, test } from 'bun:test';
import { projectGcpGuestBinding } from '../src/gcp-guest-binding-projection';
import { assertOriginalGuestBindingTransfer } from '../src/installed-guest-binding';
import type { OriginalInputBinding } from '../src/original-input-monitor';

const raw = () =>
  projectGcpGuestBinding(
    {
      owner: {
        provider: 'gcp',
        engine: 'terraform',
        account: 'example-project',
        region: 'us-central1',
        deploymentId: 'example',
      },
      vm: {
        project: 'example-project',
        zone: 'us-central1-a',
        nodeName: 'node-a',
        siteName: 'site-a',
        instanceId: '123',
        interfaces: ['10.1.0.2', '10.2.0.2'],
        expiresAt: '2030-01-01T00:00:00Z',
        jwtSha256: 'a'.repeat(64),
        ownershipSha256: 'b'.repeat(64),
      },
      observer: {
        project: 'example-project',
        zone: 'us-central1-a',
        name: 'observer-a',
        instanceId: '456',
        externalAddress: '192.0.2.7',
      },
      target: {
        project: 'example-project',
        zone: 'us-central1-a',
        nodeName: 'node-a',
        instanceId: '123',
        address: '10.2.0.2',
        interfaceIndex: 1,
        role: 'sli',
      },
      paths: {
        observer_key: '/example/observer-key',
        ce_key: '/example/ce-key',
        observer_hosts: '/example/observer-hosts',
        ce_hosts: '/example/ce-hosts',
      },
    },
    1700000000000,
  ).binding;
const input = (path: string): OriginalInputBinding => ({
  path,
  sha256: 'c'.repeat(64),
  expectedIdentity: {
    dev: '1',
    ino: '2',
    uid: '1000',
    nlink: '1',
    mode: '33024',
    size: '64',
    mtimeNs: '1',
    ctimeNs: '1',
  },
  expectedParentIdentity: { dev: '1', ino: '1', uid: '1000', mode: '16832' },
});
const inputs = () => {
  const binding = raw();
  return Object.fromEntries(
    ['observer_key', 'ce_key', 'observer_hosts', 'ce_hosts', 'ssh'].map((name) => [
      name,
      input(name === 'ssh' ? '/example/ssh' : (binding[name as keyof typeof binding] as string)),
    ]),
  );
};
test('fresh equal host bytes retain the original key/executable identities and do not rewrite original binding', () => {
  const before = raw(),
    after = { ...before, observer_hosts: '/final/observer-hosts', ce_hosts: '/final/ce-hosts' };
  const original = inputs(),
    next = { ...original, observer_hosts: input(after.observer_hosts), ce_hosts: input(after.ce_hosts) };
  expect(() => assertOriginalGuestBindingTransfer(before, after, original, next)).not.toThrow();
  expect(before.observer_hosts).toBe('/example/observer-hosts');
});
test('new node/token/NIC, trust bytes and changed key/executable identity refuse transfer', () => {
  const before = raw();
  for (const change of [
    { instance_id: '999' },
    { token_sha256: 'd'.repeat(64) },
    { ownership_sha256: 'd'.repeat(64) },
    { original_interfaces: ['10.1.0.2', '10.2.0.9'] },
    { address: '10.2.0.9' },
  ])
    expect(() => assertOriginalGuestBindingTransfer(before, { ...before, ...change }, inputs(), inputs())).toThrow();
  for (const name of ['observer_key', 'ce_key', 'ssh', 'observer_hosts', 'ce_hosts']) {
    const original = inputs(),
      next = { ...original, [name]: { ...original[name], sha256: 'd'.repeat(64) } };
    expect(() => assertOriginalGuestBindingTransfer(before, before, original, next)).toThrow();
  }
});
