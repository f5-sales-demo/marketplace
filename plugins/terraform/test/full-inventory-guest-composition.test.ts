/** Three real native Python/FIFO/PTY workers and offline terminal replies.
 * This measures shipped-source throughput; cloud/SSH/health acceptance stays false. */
import { expect, test } from 'bun:test';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acknowledgeOriginalApplyGroupClosure } from '../src/installed-apply-controller';
import {
  collectInstalledOriginalGuestRound,
  type InstalledGuestWorkerOptions,
  openInstalledFinalGuestWorker,
} from '../src/installed-guest-worker';
import { inspectInstalledCaptureScripts, readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import { monitorOriginalInputs, type OriginalInputBinding } from '../src/original-input-monitor';
import { terminalSource } from './fixtures/native-offline-terminal.fixture';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

test('three original final workers retain all ninety container inspections/logs inside the original reserve', async () => {
  let options: InstalledGuestWorkerOptions[] = [];
  let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  try {
    await withApplyInventory(
      async ({ before }) => {
        while (linuxMonotonicMs() < before.original.budget.deadline) await Bun.sleep(10);
      },
      true,
      async ({ final }) => {
        if (!final.reserve || options.length !== 3) throw new Error('Original final sources and three nodes required');
        await acknowledgeOriginalApplyGroupClosure(final, await final.execution.output.finish());
        const workers = await Promise.all(options.map((input) => openInstalledFinalGuestWorker(input, final)));
        let captureSucceeded = false;
        let captureFailure: unknown;
        try {
          // Native compilation is finished before this original final callback.
          for (const worker of workers) await worker.initialize();
          const reports = await Promise.all(workers.map((worker) => collectInstalledOriginalGuestRound(worker)));
          for (const [index, report] of reports.entries()) {
            expect(report.status).toBe('captured');
            expect(report.original.instanceId).toBe(String(options[index].binding.instance_id));
            expect(report.deadlineMs).toBe(final.reserve.finalDeadlineMs);
            expect(report.finishedMonotonicMs).toBeLessThan(final.reserve.finalDeadlineMs);
            expect(report.captures.filter((capture) => capture.kind === 'cri-inspect')).toHaveLength(30);
            expect(report.captures.filter((capture) => capture.kind === 'cri-logs-full')).toHaveLength(30);
            expect(
              new Set(
                report.captures
                  .filter((capture) => capture.kind === 'cri-inspect')
                  .map((capture) => capture.containerId),
              ).size,
            ).toBe(30);
            expect(report.bootstrapCoverageVerified).toBe(false);
            expect(report.guestAcceptanceComplete).toBe(false);
          }
          expect(new Set(reports.map((report) => report.original.instanceId)).size).toBe(3);
          console.info(
            JSON.stringify({
              kind: 'offline-native-full-inventory-timing',
              nodes: reports.length,
              containers: 90,
              inspections: reports.reduce(
                (total, report) => total + report.captures.filter((capture) => capture.kind === 'cri-inspect').length,
                0,
              ),
              fullLogs: reports.reduce(
                (total, report) => total + report.captures.filter((capture) => capture.kind === 'cri-logs-full').length,
                0,
              ),
              perNodeMs: reports.map((report) => report.finishedMonotonicMs - report.startedMonotonicMs),
              elapsedFromFinalStartMs: linuxMonotonicMs() - final.reserve.finalStartedMs,
              fixedReserveMs: final.reserve.finalDeadlineMs - final.reserve.finalStartedMs,
              liveAcceptance: false,
            }),
          );
          captureSucceeded = true;
        } catch (error) {
          captureFailure = error;
        }
        const failures: unknown[] = [];
        const closure = await Promise.allSettled(workers.map((worker) => worker.dispose()));
        for (const outcome of closure) if (outcome.status === 'rejected') failures.push(outcome.reason);
        for (const worker of workers) {
          try {
            await retainOwnedTestCapture(
              worker.root,
              'native-thirty-container-node',
              captureSucceeded && !failures.length ? 'success' : 'failure',
            );
          } catch (error) {
            failures.push(error);
          }
        }
        if (captureFailure || failures.length)
          throw new AggregateError(
            [...(captureFailure ? [captureFailure] : []), ...failures],
            'Original ninety-container capture, closure or retention incomplete',
          );
        for (const worker of workers) {
          expect(worker.evidence().completion?.originalGroupClosed).toBe(true);
          expect(worker.evidence().completion?.actualExitCode).toBe(0);
          expect(worker.evidence().submissions).toBe(1);
        }
      },
      async (context) => {
        const root = context.executionDirectory;
        const listing = String.raw`fputs("CONTAINER ID IMAGE\r\ncccccccccccccccc offline-vpm\r\ndddddddddddddddd offline-exited\r\n", stdout);`;
        if (!terminalSource.includes(listing)) throw new Error('Original offline listing fixture required');
        const expanded = terminalSource.replace(
          listing,
          String.raw`{ fputs("CONTAINER ID IMAGE\r\n", stdout); for (unsigned int index = 0; index < 30; index++) printf("%016x offline-runtime-%u\r\n", index + 256, index); }`,
        );
        const source = join(root, 'offline-thirty-container.c'),
          ssh = join(root, 'ssh');
        await writeFile(source, expanded, { mode: 0o400 });
        const compiler = Bun.which('cc');
        if (!compiler) throw new Error('Native C compiler required');
        const process = Bun.spawn([compiler, source, '-o', ssh], { stdout: 'pipe', stderr: 'pipe' });
        const outputs = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text()]);
        if ((await process.exited) !== 0) throw new Error(outputs.join('\n'));
        await chmod(ssh, 0o500);
        const inputs: Record<string, OriginalInputBinding> = {
          ...context.inputs,
          ...(await inspectInstalledCaptureScripts()),
          ssh: (await readOwnedInstalledInput(ssh)).binding,
        };
        for (const role of ['observer_key', 'ce_key', 'observer_hosts', 'ce_hosts']) {
          const path = join(root, role);
          await writeFile(path, `offline-fixture-${role}`, { mode: 0o400 });
          inputs[role] = (await readOwnedInstalledInput(path)).binding;
        }
        monitor = await monitorOriginalInputs(inputs);
        const originalMonitor = monitor;
        options = Array.from({ length: 3 }, (_, index) => {
          const binding: Record<string, unknown> = {
            project: context.owner.account,
            region: context.owner.region,
            site_name: 'example-site',
            node_name: `example-node-${index}`,
            zone: `${context.owner.region}-a`,
            instance_id: String(123 + index),
            observer_name: 'example-observer',
            observer_id: '456',
            observer_address: '192.0.2.1',
            address: `192.0.2.${3 + index * 2}`,
            original_interfaces: [`192.0.2.${2 + index * 2}`, `192.0.2.${3 + index * 2}`],
            token_node: `example-node-${index}`,
            token_site: 'example-site',
            token_expires: Date.now() / 1000 + 3600,
            token_sha256: 'c'.repeat(63) + String(index),
            ownership_sha256: 'd'.repeat(63) + String(index),
            observer_algorithm: 'ssh-ed25519',
            ce_algorithm: 'rsa-sha2-512',
            ...Object.fromEntries(
              ['observer_key', 'ce_key', 'observer_hosts', 'ce_hosts'].map((name) => [name, inputs[name].path]),
            ),
          };
          const expected = structuredClone(binding);
          return {
            context,
            inputs,
            binding,
            guards: {
              inputs: () => originalMonitor.assertOriginalIdentity(),
              original: async (value) => {
                expect(value).toEqual(expected);
              },
              trust: async (value) => {
                expect(value).toEqual(expected);
              },
            },
          };
        });
        return { prefix: '', tail: '' };
      },
      'deadline',
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      false,
      10000,
    );
  } finally {
    monitor?.close();
  }
}, 600000);
