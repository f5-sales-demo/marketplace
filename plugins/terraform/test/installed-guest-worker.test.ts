import { expect, test } from 'bun:test';
import sourcePins from '../src/gcp-capture-source-pins.json';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import { inspectOriginalGuestCompletion, openInstalledGuestWorker } from '../src/installed-guest-worker';
import pins from '../src/installed-runtime-pins.json';
import type { OriginalInputBinding } from '../src/original-input-monitor';

function fixture() {
  const input = (name: string, sha256: string): OriginalInputBinding => ({
    path: `/example/${name}`,
    sha256,
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
  const inputs = { adc: input('adc', 'a'.repeat(64)), platform: input('platform', 'b'.repeat(64)) };
  const context = createInstalledCaptureContext({
    owner: {
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'us-central1',
      deploymentId: 'fixture',
    },
    executionDirectory: '/example',
    budget: { start: 1000, deadline: 7201000 },
    inputs,
    environment: {
      GOOGLE_APPLICATION_CREDENTIALS: '/example/adc',
      XCSH_API_URL: 'https://example.test',
      XCSH_API_TOKEN: 'EXAMPLE_ONLY',
    },
    authentication: {
      accountSha256: 'c'.repeat(64),
      audienceSha256: 'd'.repeat(64),
      snapshotSha256: inputs.adc.sha256,
    },
    assertInputs: async () => {},
    assertWithinDeadline: async () => {},
    readProviderInputs: async () => ({}),
  });
  const supplied: Record<string, OriginalInputBinding> = {
    ...inputs,
    python: input('python', pins.pythonSha256),
    ssh: input('ssh', 'e'.repeat(64)),
  };
  for (const [name, digest] of Object.entries(sourcePins.files))
    supplied[`script:${name}`] = input(`scripts/${name}`, digest);
  const binding: Record<string, unknown> = { project: 'example-project', region: 'us-central1' };
  for (const name of ['observer_key', 'ce_key', 'observer_hosts', 'ce_hosts']) {
    supplied[name] = input(name, 'f'.repeat(64));
    binding[name] = supplied[name].path;
  }
  return {
    context,
    inputs: supplied,
    binding,
    guards: { inputs: async () => {}, original: async () => {}, trust: async () => {} },
  };
}

test('installed source bridge rejects wrong original request scope before filesystem or execution', async () => {
  const f = fixture();
  await expect(
    openInstalledGuestWorker({ ...f, binding: { ...f.binding, project: 'foreign-project' } }),
  ).rejects.toThrow(/context/);
});
test('installed source bridge rejects replacing an admitted context input before execution', async () => {
  const f = fixture();
  await expect(
    openInstalledGuestWorker({ ...f, inputs: { ...f.inputs, adc: { ...f.inputs.adc, sha256: '0'.repeat(64) } } }),
  ).rejects.toThrow(/input/);
});
test('installed source bridge requires every exact shipped source including its entrypoint', async () => {
  const f = fixture();
  for (const name of Object.keys(sourcePins.files)) {
    await expect(
      openInstalledGuestWorker({
        ...f,
        inputs: { ...f.inputs, [`script:${name}`]: { ...f.inputs[`script:${name}`], sha256: '0'.repeat(64) } },
      }),
    ).rejects.toThrow(/source|input/);
  }
});
test('installed source bridge cannot replace its qualified original interpreter', async () => {
  const f = fixture();
  await expect(
    openInstalledGuestWorker({ ...f, inputs: { ...f.inputs, python: { ...f.inputs.python, sha256: '0'.repeat(64) } } }),
  ).rejects.toThrow(/source|input/);
});

test('original completion can prove later closure without rewriting the initial failed capture', () => {
  const identity = { pid: 123, group: 123, start: '456', boot: '00000000-0000-4000-8000-000000000001' };
  const initial = {
    identity,
    pid: 123,
    originalDeadlineMs: 7201000,
    actualExitCode: null,
    originalGroupClosed: false,
    signalsSent: false as const,
  };
  const completed = { ...initial, actualExitCode: 0, originalGroupClosed: true, captureClosed: true, submitted: true };
  expect(inspectOriginalGuestCompletion(completed, initial, identity)).toEqual(completed);
  expect(initial.actualExitCode).toBeNull();
  expect(initial.originalGroupClosed).toBe(false);
  for (const change of [
    { pid: 999 },
    { identity: { ...identity, start: '789' } },
    { originalDeadlineMs: 7201001 },
    { originalGroupClosed: false },
    { signalsSent: true },
    { actualExitCode: null },
  ]) {
    expect(() => inspectOriginalGuestCompletion({ ...completed, ...change }, initial, identity)).toThrow();
  }
});
