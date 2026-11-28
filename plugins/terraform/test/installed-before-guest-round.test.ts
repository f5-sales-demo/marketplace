/** Actual pinned Python/FIFO/PTY and original before callback; offline native terminal only. */
import { expect, test } from 'bun:test';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type InstalledGuestWorkerOptions, openInstalledGuestWorker } from '../src/installed-guest-worker';
import { inspectInstalledCaptureScripts, readOwnedInstalledInput } from '../src/installed-runtime';
import { monitorOriginalInputs, type OriginalInputBinding } from '../src/original-input-monitor';
import { terminalSource } from './fixtures/native-offline-terminal.fixture';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

test('before guest dispatch captures an original round once and preserves scheduling and worker provenance', async () => {
  const { scheduleInstalledBeforeGuestRound } = await import('../src/installed-before-guest-round');
  let options: InstalledGuestWorkerOptions | undefined;
  let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  try {
    await withApplyInventory(
      async ({ before }) => {
        if (!options) throw new Error('Native before worker fixture required');
        const worker = await openInstalledGuestWorker(options);
        const events: Record<string, unknown>[] = [];
        const slot: {
          nodeName: string;
          worker: unknown;
          round?: Promise<unknown>;
          roundActive?: boolean;
          nextRoundAtMs?: number;
          failure?: unknown;
        } = { nodeName: 'example-node', worker };
        let captureSucceeded = false;
        let captureFailure: unknown;
        const persist = async (event: Record<string, unknown>) => {
          events.push(event);
        };
        try {
          await worker.initialize();
          await expect(
            scheduleInstalledBeforeGuestRound({ ...slot, worker: { ...worker } }, before, persist),
          ).rejects.toThrow('Original');
          await expect(
            scheduleInstalledBeforeGuestRound({ ...slot, nodeName: 'foreign-node' }, before, persist),
          ).rejects.toThrow('Original');
          await expect(
            scheduleInstalledBeforeGuestRound(slot, { ...before, original: before.original }, persist),
          ).rejects.toThrow('Original');
          const competing = await Promise.all([
            scheduleInstalledBeforeGuestRound(slot, before, persist),
            scheduleInstalledBeforeGuestRound(slot, before, persist),
          ]);
          expect(competing.sort()).toEqual([false, true]);
          expect(slot.roundActive).toBe(true);
          expect(await scheduleInstalledBeforeGuestRound(slot, before, persist)).toBe(false);
          const report = (await slot.round) as {
            status: string;
            finishedMonotonicMs: number;
            guestAcceptanceComplete: boolean;
          };
          expect(report.status).toBe('captured');
          expect(report.guestAcceptanceComplete).toBe(false);
          expect(slot.nextRoundAtMs).toBe(report.finishedMonotonicMs + 45000);
          expect(slot.roundActive).toBe(false);
          expect(worker.evidence().collectionRounds).toBe(1);
          expect(await scheduleInstalledBeforeGuestRound(slot, before, persist)).toBe(false);
          expect(events.some((event) => event.phase === 'before-guest-round')).toBe(true);
          captureSucceeded = true;
        } catch (error) {
          captureFailure = error;
        }
        const failures: unknown[] = [];
        try {
          await worker.dispose();
        } catch (error) {
          failures.push(error);
        }
        try {
          await retainOwnedTestCapture(
            worker.root,
            'before-guest-dispatch',
            captureSucceeded && !slot.failure && !failures.length ? 'success' : 'failure',
          );
        } catch (error) {
          failures.push(error);
        }
        if (captureFailure || failures.length)
          throw new AggregateError(
            [...(captureFailure ? [captureFailure] : []), ...failures],
            'Original before capture, closure or retention incomplete',
          );
        expect(worker.evidence().completion?.originalGroupClosed).toBe(true);
        expect(worker.evidence().completion?.actualExitCode).toBe(0);
        expect(worker.evidence().submissions).toBe(1);
      },
      true,
      undefined,
      async (context) => {
        const root = context.executionDirectory;
        const source = join(root, 'offline-terminal.c'),
          ssh = join(root, 'ssh');
        await writeFile(source, terminalSource, { mode: 0o400 });
        const compiler = Bun.which('cc');
        if (!compiler) throw new Error('Native C compiler required');
        const process = Bun.spawn([compiler, source, '-o', ssh], { stdout: 'pipe', stderr: 'pipe' });
        const outputs = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text()]);
        if ((await process.exited) !== 0) throw new Error(outputs.join('\\n'));
        await chmod(ssh, 0o500);
        const inputs: Record<string, OriginalInputBinding> = {
          ...context.inputs,
          ...(await inspectInstalledCaptureScripts()),
          ssh: (await readOwnedInstalledInput(ssh)).binding,
        };
        const binding: Record<string, unknown> = {
          project: context.owner.account,
          region: context.owner.region,
          site_name: 'example-site',
          node_name: 'example-node',
          zone: `${context.owner.region}-a`,
          instance_id: '123',
          observer_name: 'example-observer',
          observer_id: '456',
          observer_address: '192.0.2.1',
          address: '192.0.2.3',
          original_interfaces: ['192.0.2.2', '192.0.2.3'],
          token_node: 'example-node',
          token_site: 'example-site',
          token_expires: Date.now() / 1000 + 3600,
          token_sha256: 'c'.repeat(64),
          ownership_sha256: 'd'.repeat(64),
          observer_algorithm: 'ssh-ed25519',
          ce_algorithm: 'rsa-sha2-512',
        };
        for (const role of ['observer_key', 'ce_key', 'observer_hosts', 'ce_hosts']) {
          const path = join(root, role);
          await writeFile(path, `offline-fixture-${role}`, { mode: 0o400 });
          inputs[role] = (await readOwnedInstalledInput(path)).binding;
          binding[role] = path;
        }
        monitor = await monitorOriginalInputs(inputs);
        const original = monitor,
          expected = structuredClone(binding);
        options = {
          context,
          inputs,
          binding,
          guards: {
            inputs: () => original.assertOriginalIdentity(),
            original: async (value) => {
              expect(value).toEqual(expected);
            },
            trust: async (value) => {
              expect(value).toEqual(expected);
            },
          },
        };
        return { prefix: '', tail: '' };
      },
    );
  } finally {
    monitor?.close();
  }
}, 600000);
