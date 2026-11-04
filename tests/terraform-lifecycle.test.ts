import { describe, expect, it, spyOn } from 'bun:test';
import terraformIntegration, { terraformRuntimeInstallArgv } from '../plugins/terraform/extensions/integration';

function definition() {
  let integration: { probe(): Promise<{ state: string; reason?: string }> } | undefined;
  terraformIntegration({
    integrations: {
      register(value: unknown) {
        integration = value as typeof integration;
      },
    },
  });
  if (!integration) throw new Error('Terraform integration was not registered');
  return integration;
}

describe('Terraform lifecycle probe', () => {
  it('reports setup required when the executable is absent', async () => {
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
      throw Object.assign(new Error('fixture missing executable'), { code: 'ENOENT' });
    });
    try {
      expect(await definition().probe()).toEqual({ state: 'setup_required', reason: 'cli_missing' });
    } finally {
      spawn.mockRestore();
    }
  });

  it('keeps nonzero exit unavailable and zero exit ready', async () => {
    const spawn = spyOn(Bun, 'spawnSync').mockReturnValue({ exitCode: 1 } as ReturnType<typeof Bun.spawnSync>);
    try {
      expect(await definition().probe()).toEqual({ state: 'setup_required', reason: 'cli_missing' });
      spawn.mockReturnValue({ exitCode: 0 } as ReturnType<typeof Bun.spawnSync>);
      expect(await definition().probe()).toEqual({ state: 'ready' });
      expect(spawn.mock.calls).toEqual([
        [['terraform', 'version']],
        [['terraform', 'version']],
        ...(process.platform === 'linux' ? [[[...terraformRuntimeInstallArgv(), '--check']]] : []),
      ]);
    } finally {
      spawn.mockRestore();
    }
  });

  it('preserves unexpected failures instead of suggesting installation', async () => {
    for (const failure of [
      Object.assign(new Error('fixture access denied'), { code: 'EACCES' }),
      null,
      'fixture failure',
    ]) {
      const spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
        throw failure;
      });
      try {
        await expect(definition().probe()).rejects.toBe(failure);
      } finally {
        spawn.mockRestore();
      }
    }
  });

  it.skipIf(process.platform !== 'linux')(
    'reports the runtime prerequisite after a successful Terraform probe',
    async () => {
      for (const result of [
        { exitCode: 1 },
        Object.assign(new Error('fixture missing interpreter'), { code: 'ENOENT' }),
      ]) {
        let calls = 0;
        const spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
          if (++calls === 1) return { exitCode: 0 } as ReturnType<typeof Bun.spawnSync>;
          if (result instanceof Error) throw result;
          return result as ReturnType<typeof Bun.spawnSync>;
        });
        try {
          expect(await definition().probe()).toEqual({
            state: 'setup_required',
            reason: 'observer_runtime_missing_or_unverified',
          });
          expect(calls).toBe(2);
        } finally {
          spawn.mockRestore();
        }
      }
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'retains unexpected runtime probe errors without suggesting a CLI install',
    async () => {
      const failure = Object.assign(new Error('fixture runtime access denied'), { code: 'EACCES' });
      let calls = 0;
      const spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
        if (++calls === 1) return { exitCode: 0 } as ReturnType<typeof Bun.spawnSync>;
        throw failure;
      });
      try {
        await expect(definition().probe()).rejects.toBe(failure);
      } finally {
        spawn.mockRestore();
      }
    },
  );
});
