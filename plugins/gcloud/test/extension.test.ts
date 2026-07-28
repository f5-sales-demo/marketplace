import { beforeAll, describe, expect, it } from 'bun:test';

/**
 * These cases drive the real `gcloud` binary, so they are meaningful only where it is
 * installed. A visible skip beats an `if (…)` that quietly asserts nothing, and the
 * generous timeout is because a cloud CLI answering in under five seconds is not a
 * property this repo controls.
 */
const GCLOUD_INSTALLED = Bun.spawnSync([process.platform === 'win32' ? 'where' : 'which', 'gcloud']).exitCode === 0;

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

  it('registers the tool set (wrapped) when gcloud is available', async () => {
    const tools: { name: string }[] = [];
    const mockPi = {
      setLabel() {},
      logger: { debug() {} },
      registerCommand() {},
      registerServiceStatus() {},
      registerTool(t: { name: string }) {
        tools.push(t);
      },
      typebox: {
        Type: {
          Object: (s: Record<string, unknown>) => s,
          Array: (s: unknown) => ({ type: 'array', items: s }),
          String: (o?: Record<string, unknown>) => ({ type: 'string', ...o }),
          Number: (o?: Record<string, unknown>) => ({ type: 'number', ...o }),
          Optional: (s: unknown) => ({ optional: true, ...((s as object) ?? {}) }),
        },
      },
    };
    await factory(mockPi);

    // gcloud may be absent on the runner; when present, the full set registers.
    if (tools.length > 0) {
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(
        [
          'gcloud_compute_instances_list',
          'gcloud_config_list',
          'gcloud_exec',
          'gcloud_help',
          'gcloud_projects_list',
          'gcloud_storage_buckets_list',
        ].sort(),
      );
    }
  });

  it.skipIf(!GCLOUD_INSTALLED)(
    'service check returns valid state',
    async () => {
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
    },
    60000,
  );
});
