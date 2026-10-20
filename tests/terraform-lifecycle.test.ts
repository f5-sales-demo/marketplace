import { describe, expect, it, spyOn } from 'bun:test';
import terraformIntegration from '../plugins/terraform/extensions/integration';

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
      expect(spawn.mock.calls).toEqual([[['terraform', 'version']], [['terraform', 'version']]]);
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
});
