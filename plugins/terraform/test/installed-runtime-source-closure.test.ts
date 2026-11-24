/** Real native parent closure only; does not establish installed or GCP guest acceptance. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { createInstalledReaderInputRetention } from '../src/installed-reader-input-retention';
import { readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import type { OriginalInputBinding } from '../src/original-input-monitor';
import { signalFreeTerraformExecutor } from '../src/signal-free-executor';

for (const fault of ['none', 'capture', 'source', 'retention', 'live', 'active', 'copied-lifetime'] as const)
  test(`original runtime closes nested sources after physical parent exit while retaining failures: ${fault}`, async () => {
    const { closeInstalledOriginalRuntimeSources } = await import('../src/installed-runtime-source-closure');
    const base = process.env.CE_TEST_CAPTURE_ARTIFACTS ?? tmpdir();
    await mkdir(base, { recursive: true, mode: 0o700 });
    const root = await mkdtemp(join(base, 'runtime-source-closure-'));
    const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
    const binding = {
      path: python,
      sha256: createHash('sha256')
        .update(await readFile(python))
        .digest('hex'),
    };
    const script = join(root, 'original.py');
    await writeFile(script, "print('offline original runtime parent')\n", { mode: 0o400 });
    const start = linuxMonotonicMs(),
      groupDirectory = join(root, 'original-group');
    await mkdir(groupDirectory, { mode: 0o700 });
    const inputs: Record<string, OriginalInputBinding> = {};
    const owner = {
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'us-west1',
      deploymentId: 'example-deployment',
    } as const;
    const store = await CeDeploymentStore.open(join(root, 'storage'), owner);
    const retainInputs = createInstalledReaderInputRetention({
      store,
      owner,
      executionDirectory: root,
      readInputs: async () => inputs,
    });
    let retained = 0;
    let closes = 0,
      retires = 0,
      submissions = 0;
    const close = (active = 0) =>
      closeInstalledOriginalRuntimeSources({
        active,
        executionDirectory: root,
        groups: [{ directory: groupDirectory, inputs }],
        closeCapture: async () => {
          closes++;
          if (fault === 'source') throw new Error('Intentional original source closure failure');
        },
        retainCaptureSources: async () => {
          expect(closes).toBe(1);
          retained++;
          await retainInputs();
          if (fault === 'retention') throw new Error('Intentional durable retention failure');
        },
        retire: () => {
          retires++;
        },
      });
    const execute = signalFreeTerraformExecutor({
      python: binding,
      executable: binding,
      originalStartMs: start,
      originalDeadlineMs: start + 7200000,
      assertOriginal: async () => {},
      beforeRelease: async () => {
        submissions++;
        for (const name of ['claim', 'lifetime']) {
          const path = join(groupDirectory, `${name}.json`);
          await writeFile(path, await readFile(join(root, '.terraform-executor-lock', `${name}.json`)), {
            mode: 0o400,
            flag: 'wx',
          });
          inputs[name] = (await readOwnedInstalledInput(path)).binding;
        }
        if (fault === 'live' || fault === 'active') {
          await expect(close(fault === 'active' ? 1 : 0)).rejects.toThrow(fault === 'active' ? 'in flight' : 'live');
          expect(closes).toBe(0);
          expect(retires).toBe(0);
          expect(retained).toBe(0);
        }
      },
      finalCapture: async () => {
        if (fault === 'capture') throw new Error('Intentional original parent capture failure');
      },
    });
    const invocation = execute({ cwd: root, args: [script], env: {} });
    if (fault === 'capture') await expect(invocation).rejects.toThrow('Intentional original parent capture failure');
    else expect((await invocation).code).toBe(0);
    const flag = join(root, '.terraform-executor-lock', 'capture-unresolved.json');
    const failure = await readFile(flag).catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (fault === 'copied-lifetime') {
      const path = inputs.lifetime.path,
        bytes = await readFile(path);
      await rename(path, `${path}.original`);
      await writeFile(path, bytes, { mode: 0o400, flag: 'wx' });
      await expect(close()).rejects.toThrow();
      expect(closes).toBe(0);
      expect(retires).toBe(0);
    } else if (fault === 'capture' || fault === 'source' || fault === 'retention') {
      await expect(close()).rejects.toThrow(
        fault === 'capture'
          ? 'remains unresolved'
          : fault === 'source'
            ? 'source closure failure'
            : 'durable retention failure',
      );
      expect(closes).toBe(1);
      expect(retires).toBe(0);
    } else {
      await close();
      expect(closes).toBe(1);
      expect(retires).toBe(1);
    }
    expect(retained).toBe(fault === 'copied-lifetime' ? 0 : 1);
    expect(
      (await readdir(store.directory)).filter((name) => name.startsWith('immutable-installed-reader-inputs-')),
    ).toHaveLength(fault === 'copied-lifetime' ? 0 : 1);
    if (failure) expect(await readFile(flag)).toEqual(failure);
    expect(submissions).toBe(1);
  }, 60000);
