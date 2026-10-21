import { afterEach, expect, it, spyOn } from 'bun:test';
import ghosttyIntegration, { PLUGIN_VERSION } from '../plugins/ghostty/extensions/integration';

type ProbeResult = { state: string; reason?: string; value?: unknown };
let probe: () => Promise<ProbeResult>;
ghosttyIntegration({
  integrations: {
    register(definition: unknown) {
      probe = (definition as { probe(): Promise<ProbeResult> }).probe;
    },
  },
});
let spawn: ReturnType<typeof spyOn> | undefined;
afterEach(() => spawn?.mockRestore());

function result(value: unknown, exitCode = 0) {
  spawn = spyOn(Bun, 'spawnSync').mockReturnValue({
    exitCode,
    stdout: new TextEncoder().encode(JSON.stringify(value)),
  } as ReturnType<typeof Bun.spawnSync>);
}

it('reports a missing Python executable without swallowing unrelated errors', async () => {
  spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  });
  expect(await probe()).toMatchObject({ state: 'setup_required', reason: 'cli_missing' });
  spawn.mockImplementation(() => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  });
  await expect(probe()).rejects.toMatchObject({ code: 'EACCES' });
});

it('rejects malformed envelopes and retains parsed evidence', async () => {
  for (const value of [
    null,
    false,
    0,
    '',
    [],
    {},
    { state: 'ready', reason: 0 },
    { state: 'unexpected', guidance: 'Correct this exact field' },
  ]) {
    result(value);
    expect(await probe()).toEqual({ state: 'degraded', reason: 'invalid_setup_probe', value });
    spawn?.mockRestore();
  }
});

it('retains literal non-JSON corrective guidance as degraded evidence', async () => {
  const text = 'Correct this exact field; this output is not JSON';
  spawn = spyOn(Bun, 'spawnSync').mockReturnValue({
    exitCode: 1,
    stdout: new TextEncoder().encode(text),
  } as ReturnType<typeof Bun.spawnSync>);
  expect(await probe()).toEqual({ state: 'degraded', reason: 'invalid_setup_probe', value: text });
});

it('preserves complete valid observations and exact read-only invocation', async () => {
  for (const state of ['ready', 'setup_required', 'unavailable']) {
    const value = {
      state,
      reason: 'literal corrective guidance',
      count: 0,
      enabled: false,
      label: '',
      extra: { unknown: null },
    };
    result(value, state === 'ready' ? 0 : 1);
    expect(await probe()).toMatchObject({ state, value });
    expect(spawn).toHaveBeenCalledWith(
      ['python3', expect.stringContaining('ghostty-setup.py'), 'status', PLUGIN_VERSION],
      { stdout: 'pipe' },
    );
    spawn?.mockRestore();
  }
});

it('does not accept ready output from a failed process', async () => {
  result({ state: 'ready', reason: 'verification_failed' }, 1);
  expect(await probe()).toMatchObject({ state: 'setup_required', reason: 'verification_failed' });
});
