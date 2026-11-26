import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGcpCaptureCleanupCli, gcpCaptureCleanupReadCommands } from '../../gcloud/src/ce/capture-cleanup-cli';
import { observerOwnershipFixture } from '../../gcloud/test/ce/observer-ownership-fixtures';
import { createInstalledCleanupExecutor } from '../src/installed-cleanup-executor';

const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
type Kind = 'gcloud' | 'terraform';
async function fixture(kind: Kind) {
  const root = await mkdtemp(join(tmpdir(), 'cleanup-identity-boundaries-'));
  const directory = join(root, 'original'),
    diagnosticsDirectory = join(root, 'diagnostics');
  await mkdir(directory, { mode: 0o700 });
  await mkdir(diagnosticsDirectory, { mode: 0o700 });
  const executable = join(root, 'fixture-command');
  await writeFile(
    executable,
    `#!${python}\nimport time\nfrom pathlib import Path\ntime.sleep(0.35)\nPath('completed').write_text('original')\nprint('{}')\n`,
    { mode: 0o700 },
  );
  const retained = join(directory, 'failed.private.json');
  await writeFile(retained, 'original-failed-capture', { mode: 0o400 });
  const binding = { path: executable, sha256: hash(await readFile(executable)) };
  const interpreter = { path: python, sha256: hash(await readFile(python)) };
  let identityCalls = 0,
    fullBefore = 0,
    fullAfter = 0;
  let refusal: 'none' | 'release' | 'identity' | 'final' = 'none';
  const completed = async () =>
    (await Array.fromAsync(new Bun.Glob('**/completed').scan({ cwd: diagnosticsDirectory }))).length > 0;
  const options = {
    directory,
    diagnosticsDirectory,
    python: interpreter,
    assertInputs: async () => {
      expect(await readFile(retained, 'utf8')).toBe('original-failed-capture');
      if (await completed()) {
        fullAfter++;
        if (refusal === 'final') throw new Error('Full final byte check refused');
      } else {
        fullBefore++;
        if (refusal === 'release' && identityCalls > 0) throw new Error('Full release byte check refused');
      }
    },
    assertInputIdentity: async () => {
      identityCalls++;
      if (refusal === 'identity') throw new Error('Original identity changed');
    },
    assertIndependentClosure: async () => {},
  };
  const { i: intent } = observerOwnershipFixture();
  const invoke = (overrides: Partial<typeof options> = {}) => {
    if (kind === 'terraform') {
      const execute = createInstalledCleanupExecutor({ ...options, ...overrides, terraform: binding });
      return () => execute({ cwd: directory, args: ['version', '-json'], env: { PATH: process.env.PATH } });
    }
    const api = createGcpCaptureCleanupCli({
      ...options,
      ...overrides,
      intent,
      gcloud: binding,
      account: 'EXAMPLE_ACCOUNT',
      configuration: 'source-fixture',
      environment: { PATH: process.env.PATH, CLOUDSDK_CONFIG: root },
    });
    return () => api.exec('gcloud', [...gcpCaptureCleanupReadCommands(intent)[0]]);
  };
  return {
    invoke,
    completed,
    diagnosticsDirectory,
    counts: () => ({ identityCalls, fullBefore, fullAfter }),
    refuse: (value: typeof refusal) => {
      refusal = value;
    },
  };
}
for (const kind of ['gcloud', 'terraform'] as const) {
  test(`${kind} cleanup uses identity polling but fully checks bytes before release and final capture`, async () => {
    const f = await fixture(kind);
    await f.invoke()();
    expect(await f.completed()).toBe(true);
    const counts = f.counts();
    expect(counts.identityCalls).toBeGreaterThan(0);
    expect(counts.fullBefore).toBeGreaterThanOrEqual(2);
    expect(counts.fullAfter).toBeGreaterThanOrEqual(2);
  }, 15000);
  test(`${kind} cleanup retains full byte verification at command release after identity polling`, async () => {
    const f = await fixture(kind);
    f.refuse('release');
    await expect(f.invoke()()).rejects.toThrow();
    expect(await f.completed()).toBe(false);
    expect(
      await Array.fromAsync(new Bun.Glob('**/submission.private.json').scan({ cwd: f.diagnosticsDirectory })),
    ).toHaveLength(0);
  }, 15000);
  test(`${kind} cleanup refuses changed identity during polling`, async () => {
    const f = await fixture(kind);
    f.refuse('identity');
    await expect(f.invoke()()).rejects.toThrow();
    expect(await f.completed()).toBe(false);
  }, 15000);
  test(`${kind} cleanup requires final full digests even when identity checks succeed`, async () => {
    const f = await fixture(kind);
    f.refuse('final');
    await expect(f.invoke()()).rejects.toThrow();
    expect(await f.completed()).toBe(true);
    expect(f.counts().fullAfter).toBeGreaterThan(0);
  }, 15000);
  test(`${kind} cleanup refuses a malformed polling guard`, async () => {
    const f = await fixture(kind);
    expect(() => f.invoke({ assertInputIdentity: 'untrusted' as unknown as () => Promise<void> })).toThrow();
  });
}
