/** Real descriptor and window issuers; provider logs and clocks are explicit offline fixtures. */
import { expect, test } from 'bun:test';
import { mkdtemp, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleProviderLifecycleParser } from '../src/google-provider-lifecycle';
import { type InstalledProviderWindow, openInstalledProviderReader } from '../src/installed-provider-reader';
import { linuxMonotonicMs } from '../src/linux-clock';
import { corroborateOriginalGoogleRpcProvider } from '../src/original-google-provider-source';
import { type ExecutionCaptureAdmission, signalFreeTerraformExecutor } from '../src/signal-free-executor';
import { fixture, hash, roots } from './installed-provider-reader-fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const mode of [
  'overlap',
  'reverse',
  'gap',
  'one-ms-gap',
  'clock',
  'changed-start',
  'changed-fifo',
  'outside',
  'restoration',
  'copied',
] as const)
  test(`original provider windows cover a long RPC without weakening boundaries: ${mode}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-bridge-'));
    roots.push(root);
    const script = join(root, 'offline-lifecycle.py');
    await writeFile(script, 'pass\n', { mode: 0o600 });
    const python = await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '');
    const executable = { path: python, sha256: hash(await readFile(python)) };
    const binding = {
      terraformVersion: '1.17.2',
      providerLockSha256: '74834870028124a9006ab8d34d49517b71b7a7e3ea5a3c1004b3899dacca3b4b',
    };
    const providerPath = '/example/terraform-provider-google_v8.12.0_x5';
    const parser = new GoogleProviderLifecycleParser({ providerPath, planSha256: 'a'.repeat(64) }, binding);
    const windows: InstalledProviderWindow[] = [];
    const windowRoots: string[] = [];
    let admission: ExecutionCaptureAdmission | undefined;
    let failure: unknown;
    const start = linuxMonotonicMs();
    const execute = signalFreeTerraformExecutor({
      python: executable,
      executable,
      originalStartMs: start,
      originalDeadlineMs: start + 7200000,
      assertOriginal: async () => {},
      beforeRelease: async (original) => {
        try {
          admission = original;
          const epoch = Date.now();
          for (const [index, offset] of [0, mode === 'gap' ? 45000 : mode === 'one-ms-gap' ? 44900 : 30000].entries()) {
            const run = await fixture('812', original.identity);
            windowRoots.push(run.context.executionDirectory);
            const mono = run.clock();
            run.mutate((result) => {
              for (const item of result.observations as Array<Record<string, unknown>>) {
                item.firstObservedMs = mono + 100;
                item.lastObservedMs = mono + 44999;
                if (index === 1 && mode === 'changed-start') (item.candidate as Record<string, unknown>).start = '999';
                if (index === 1 && mode === 'changed-fifo') (item.stderr as Record<string, unknown>).inode = '999';
              }
            });
            let skew = 0;
            const reader = await openInstalledProviderReader(run.context, run.admission, {
              executorFactory: run.factory,
              clock: run.clock,
              epochClock: () => epoch + offset + run.clock() - mono + skew,
            });
            const pending = reader.startStderrWindow();
            await pending.ready;
            if (index === 1 && mode === 'clock') skew = 101;
            run.releaseWindow();
            windows.push(await pending.complete);
          }
          const row = (offset: number, message: string, fields = {}) =>
            `${JSON.stringify({
              '@level': 'debug',
              '@module': 'provider',
              '@timestamp': new Date(epoch + offset).toISOString(),
              '@message': message,
              ...fields,
            })}\n`;
          const rpc = (offset: number, message: string) =>
            row(offset, message, {
              '@module': 'sdk.proto',
              '@level': 'trace',
              tf_provider_addr: 'registry.terraform.io/hashicorp/google',
              tf_proto_version: '5.11',
              tf_rpc: 'ReadDataSource',
              tf_data_source_type: 'google_client_config',
              tf_req_id: '11111111-2222-3333-4444-555555555555',
            });
          const raw =
            row(-3000, 'starting plugin', { path: providerPath, args: [providerPath] }) +
            row(-2999, 'plugin started', { path: providerPath, pid: 3456 }) +
            rpc(1000, 'Received request') +
            rpc(mode === 'outside' ? 80000 : 70000, 'Served request') +
            row(90000, 'plugin process exited', { plugin: providerPath, id: '3456' });
          await writeFile(script, `import sys\nsys.stderr.write(${JSON.stringify(raw)})\n`);
        } catch (error) {
          failure = error;
          throw error;
        }
      },
      finalCapture: async () => {
        if (failure) throw failure;
        if (!admission) throw new Error('Original descriptor required');
        const chunk = await admission.output.read('stderr');
        if (!chunk) throw new Error('Original descriptor bytes required');
        const [candidate] = parser.pushOriginal(admission.output, chunk);
        parser.finishOriginal(admission.output, await admission.output.finish());
        const input = {
          rpc: candidate,
          windows:
            mode === 'copied' ? [windows[0], { ...windows[1] }] : mode === 'reverse' ? [...windows].reverse() : windows,
          binding,
        };
        if (['gap', 'one-ms-gap', 'clock', 'changed-start', 'changed-fifo', 'outside', 'copied'].includes(mode)) {
          await expect(corroborateOriginalGoogleRpcProvider(input)).rejects.toThrow();
          return;
        }
        const result = await corroborateOriginalGoogleRpcProvider(input);
        expect(result.rpcWindowTimeCorroborated).toBe(true);
        expect(result.windows).toHaveLength(2);
        expect(result.schemaVersion).toBe(3);
        expect(result.applyRpcQualified).toBe(false);
        if (mode === 'restoration') {
          const original = await readFile(windows[1].evidencePath);
          const replacement = `${windows[1].evidencePath}.replacement`;
          const held = `${windows[1].evidencePath}.held-original`;
          await writeFile(replacement, original, { mode: 0o400 });
          await rename(windows[1].evidencePath, held);
          await rename(replacement, windows[1].evidencePath);
          await expect(corroborateOriginalGoogleRpcProvider(input)).rejects.toThrow();
          await rename(held, windows[1].evidencePath);
          await expect(corroborateOriginalGoogleRpcProvider(input)).rejects.toThrow();
        }
      },
    });
    let outcome: 'success' | 'failure' = 'failure';
    try {
      expect((await execute({ cwd: root, args: [script], env: {} })).code).toBe(0);
      outcome = 'success';
    } finally {
      if (outcome === 'failure') {
        for (const source of [root, ...windowRoots]) {
          const index = roots.indexOf(source);
          if (index >= 0) roots.splice(index, 1);
        }
      }
      await retainOwnedTestCapture(root, `provider-bridge-${mode}`, outcome);
      for (const [index, source] of windowRoots.entries())
        await retainOwnedTestCapture(source, `provider-window-${mode}-${index}`, outcome);
    }
  }, 60000);
