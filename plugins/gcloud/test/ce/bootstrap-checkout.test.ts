import { expect, it } from 'bun:test';
import { checkoutGcpBootstrap, storeGcpBootstrap } from '../../src/ce/bootstrap-checkout';

const owner = {
  project: 'test-project',
  deploymentName: 'ce-test',
  siteName: 'site-test',
  nodeName: 'node-test',
  engine: 'native' as const,
};
const binding = {
  ...owner,
  jwt: ['fixtureheader', 'fixturepayload', 'fixturesignature'].join('.'),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};
function store() {
  let record: unknown;
  let tail = Promise.resolve();
  return {
    async read() {
      if (!record) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(record);
    },
    async write(_name: string, value: unknown) {
      record = structuredClone(value);
    },
    async exclusive<T>(fn: () => Promise<T>): Promise<T> {
      const before = tail;
      let release = () => {};
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await before;
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}
it('concurrent checkout permits one use and removes stored token before returning', async () => {
  const s = store();
  await storeGcpBootstrap(s, owner, binding);
  const outcomes = await Promise.allSettled([checkoutGcpBootstrap(s, owner), checkoutGcpBootstrap(s, owner)]);
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(((await s.read()) as { jwt: string }).jwt).toBe('');
  await expect(storeGcpBootstrap(s, owner, binding)).rejects.toThrow('already issued');
});
it('wrong deployment/site/node/engine and expired material cannot consume checkout', async () => {
  const s = store();
  await storeGcpBootstrap(s, owner, binding);
  for (const change of [
    { project: 'other-project' },
    { siteName: 'other-site' },
    { nodeName: 'other-node' },
    { engine: 'terraform' as const },
  ]) {
    await expect(checkoutGcpBootstrap(s, { ...owner, ...change })).rejects.toThrow();
  }
  await expect(checkoutGcpBootstrap(s, owner, Date.now() + 120_000)).rejects.toThrow('expiry');
  expect(((await s.read()) as { state: string }).state).toBe('issued');
});
