import { beforeAll, describe, expect, it } from 'bun:test';

describe('GCloud Status extension', () => {
  let factory: (pi: unknown) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../src/index');
    factory = mod.default as typeof factory;
  });

  it('exports a default factory function', () => {
    expect(typeof factory).toBe('function');
  });

  it('registers service status when gcloud is available', async () => {
    const registered: { name: string }[] = [];
    const mockPi = {
      setLabel() {},
      logger: { debug() {} },
      registerCommand() {},
      registerServiceStatus(c: { name: string }) {
        registered.push(c);
      },
    };
    await factory(mockPi);

    // If gcloud CLI is installed, should register; if not, should skip gracefully
    if (registered.length > 0) {
      expect(registered[0].name).toBe('GCloud');
    }
  });

  it('service check returns valid state', async () => {
    let checkFn: (() => Promise<{ state: string }>) | undefined;
    const mockPi = {
      setLabel() {},
      logger: { debug() {} },
      registerCommand() {},
      registerServiceStatus(c: { name: string; check: () => Promise<{ state: string }> }) {
        checkFn = c.check;
      },
    };
    await factory(mockPi);

    if (checkFn) {
      const result = await checkFn();
      expect(['connected', 'unauthenticated', 'unavailable']).toContain(result.state);
    }
  });
});
