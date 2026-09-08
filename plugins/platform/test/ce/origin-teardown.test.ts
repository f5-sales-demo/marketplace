import { expect, test } from 'bun:test';
import { CeOriginTeardown } from '../../src/ce/origin-teardown';
import { CeApiError } from '../../src/ce/runtime';

const owner = {
  deploymentId: 'ce-test',
  engine: 'terraform' as const,
  provider: 'aws' as const,
  account: 'demo',
  region: 'us-east-1',
};
const origin = { name: 'ce-origin', namespace: 'default', uid: 'origin-uid' };
const listeners = [{ name: 'ce-listener', namespace: 'default' }];
function fixture() {
  const state = {
    present: true,
    listener: false,
    deletes: 0,
    uid: origin.uid,
    port: 80,
    version: 'v1',
    engine: 'terraform' as 'terraform' | 'native',
    lost: false,
    pending: false,
    forbidden: false,
    foreign: false,
  };
  const api = new CeOriginTeardown(
    {
      get engine() {
        return state.engine;
      },
      async request(path, init) {
        if (path.includes('http_loadbalancers')) {
          if (state.listener) return {};
          throw new CeApiError('not-found');
        }
        if (init?.method === 'DELETE') {
          state.deletes++;
          if (state.forbidden) throw new CeApiError('authorization');
          if (!state.pending) state.present = false;
          if (state.lost) throw new CeApiError('transient');
          return {};
        }
        if (!state.present) throw new CeApiError('not-found');
        return {
          metadata: {
            name: origin.name,
            namespace: origin.namespace,
            labels: {
              'xcsh-ce-deployment': state.foreign ? 'other-deployment' : owner.deploymentId,
              'xcsh-ce-engine': owner.engine,
              'xcsh-ce-provider': owner.provider,
              'xcsh-ce-account': owner.account,
              'xcsh-ce-region': owner.region,
            },
          },
          system_metadata: { uid: state.uid },
          resource_version: state.version,
          spec: { port: state.port },
        };
      },
    },
    'verified-api-fingerprint',
  );
  return { api, state };
}
test('origin teardown collects configuration identity and reconciles a lost delete without repeating mutation', async () => {
  const { api, state } = fixture();
  const snapshot = await api.observe(owner, origin);
  expect(snapshot.specSha256).toMatch(/^[a-f0-9]{64}$/);
  state.lost = true;
  expect((await api.delete(snapshot, listeners)).status).toBe('deleted');
  expect((await api.delete(snapshot, listeners)).status).toBe('deleted');
  expect(state.deletes).toBe(1);
});
test('origin teardown refuses active listeners, changed configuration, foreign ownership and wrong engine', async () => {
  for (const mode of ['listener', 'uid', 'port', 'version', 'engine', 'foreign'] as const) {
    const { api, state } = fixture();
    const snapshot = await api.observe(owner, origin);
    if (mode === 'listener') state.listener = true;
    if (mode === 'uid') state.uid = 'replaced';
    if (mode === 'port') state.port = 8080;
    if (mode === 'version') state.version = 'v2';
    if (mode === 'engine') state.engine = 'native';
    if (mode === 'foreign') state.foreign = true;
    await expect(api.delete(snapshot, listeners)).rejects.toThrow();
    expect(state.deletes).toBe(0);
  }
});
test('origin teardown reports pending, propagates authorization and cancellation, and validates scope before IO', async () => {
  const { api, state } = fixture();
  const snapshot = await api.observe(owner, origin);
  state.pending = true;
  expect((await api.delete(snapshot, listeners)).status).toBe('pending');
  state.forbidden = true;
  await expect(api.delete(snapshot, listeners)).rejects.toMatchObject({ category: 'authorization' });
  const deletes = state.deletes;
  await expect(api.delete(snapshot, listeners, AbortSignal.abort())).rejects.toThrow();
  await expect(api.delete(snapshot, [])).rejects.toThrow();
  await expect(api.delete(snapshot, [{ name: '../escape', namespace: 'default' }])).rejects.toThrow();
  await expect(api.delete({ ...snapshot, contractFingerprint: 'other' }, listeners)).rejects.toThrow();
  expect(state.deletes).toBe(deletes);
});
