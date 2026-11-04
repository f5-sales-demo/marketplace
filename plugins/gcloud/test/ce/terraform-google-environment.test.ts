import { expect, test } from 'bun:test';
import type { TerraformSession } from '../../../terraform/src/service';
import { googleTerraformEnvironment } from '../../src/ce/terraform-google-environment';
import type { GcloudExecApi } from '../../src/gcloud/exec';

test('explicit ADC capability removes ambient Google alternatives without a CLI token read', async () => {
  let called = 0;
  const api = {
    exec: async () => {
      called++;
      throw new Error('unexpected CLI fallback');
    },
  } as GcloudExecApi;
  const session = {
    googleAdcEnvironment: async () => ({ GOOGLE_APPLICATION_CREDENTIALS: '/owned/adc.private.json' }),
  } as TerraformSession;
  const ambient = {
    PATH: '/usr/bin',
    GOOGLE_OAUTH_ACCESS_TOKEN: 'synthetic-old-token',
    GOOGLE_CREDENTIALS: 'synthetic-other',
    GOOGLE_APPLICATION_CREDENTIALS: '/ambient/adc.json',
  };
  const environment = await googleTerraformEnvironment(
    session,
    api,
    { engine: 'terraform', project: 'fixture-project' },
    ambient,
  );
  expect(environment).toEqual({ PATH: '/usr/bin', GOOGLE_APPLICATION_CREDENTIALS: '/owned/adc.private.json' });
  expect(called).toBe(0);
  expect(ambient.GOOGLE_OAUTH_ACCESS_TOKEN).toBe('synthetic-old-token');
});
test('failed or malformed selected ADC never falls back to static authentication', async () => {
  let calls = 0;
  const api = {
    exec: async () => {
      calls++;
      return { exitCode: 0, stdout: 'synthetic-token', stderr: '' };
    },
  } as GcloudExecApi;
  for (const callback of [
    async () => {
      throw new Error('credential rotated');
    },
    async () => ({ GOOGLE_APPLICATION_CREDENTIALS: 'relative.json' }),
    async () => ({ GOOGLE_APPLICATION_CREDENTIALS: '/owned/adc.json', GOOGLE_OAUTH_ACCESS_TOKEN: 'synthetic-token' }),
  ]) {
    await expect(
      googleTerraformEnvironment(
        { googleAdcEnvironment: callback } as TerraformSession,
        api,
        { engine: 'terraform', project: 'fixture-project' },
        {},
      ),
    ).rejects.toThrow();
  }
  expect(calls).toBe(0);
});
test('legacy session retains exact project CLI access and explicit engine refusals', async () => {
  const calls: unknown[] = [];
  const api = {
    exec: async (...args: unknown[]) => {
      calls.push(args);
      return { exitCode: 0, stdout: 'synthetic-token\n', stderr: '' };
    },
  } as GcloudExecApi;
  const session = {} as TerraformSession;
  expect(
    await googleTerraformEnvironment(
      session,
      api,
      { engine: 'terraform', project: 'fixture-project' },
      { PATH: '/usr/bin' },
    ),
  ).toEqual({ PATH: '/usr/bin', GOOGLE_OAUTH_ACCESS_TOKEN: 'synthetic-token' });
  expect(calls).toHaveLength(1);
  expect((calls[0] as unknown[])[1]).toEqual(['auth', 'print-access-token', '--project=fixture-project', '--quiet']);
  await expect(
    googleTerraformEnvironment(session, api, { engine: 'native', project: 'fixture-project' }, {}),
  ).rejects.toThrow();
  expect(calls).toHaveLength(1);
});
