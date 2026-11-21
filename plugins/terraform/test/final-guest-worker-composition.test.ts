/** Real pinned Python/FIFO/PTY processes with an offline native terminal.
 * This proves source composition and final timing, never cloud/SSH acceptance. */
import { expect, test } from 'bun:test';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acknowledgeOriginalApplyGroupClosure } from '../src/installed-apply-controller';
import { openInstalledFinalGuestWorker, openInstalledGuestWorker } from '../src/installed-guest-worker';
import { inspectInstalledCaptureScripts, readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import { monitorOriginalInputs, type OriginalInputBinding } from '../src/original-input-monitor';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';

const terminalSource = String.raw`
#include <poll.h>
#include <stdio.h>
#include <string.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
int main(int argc, char **argv) {
  (void)argc; (void)argv;
  struct termios settings;
  if (tcgetattr(0, &settings)) return 2;
  cfmakeraw(&settings);
  if (tcsetattr(0, TCSANOW, &settings)) return 3;
  setvbuf(stdout, NULL, _IONBF, 0);
  struct timespec began, now;
  clock_gettime(CLOCK_MONOTONIC, &began);
  char command[256] = {0}; size_t length = 0; int escape = 0;
  fputs(">>> ", stdout);
  for (;;) {
    clock_gettime(CLOCK_MONOTONIC, &now);
    if (now.tv_sec - began.tv_sec >= 90) return 4;
    struct pollfd input = {0, POLLIN, 0};
    if (poll(&input, 1, 100) < 0) return 5;
    if (!(input.revents & POLLIN)) continue;
    unsigned char byte;
    if (read(0, &byte, 1) != 1) return 0;
    if (escape) { if (byte == '.') return 0; escape = 0; }
    if (byte == '~') { escape = 1; continue; }
    if (byte == 21) { length = 0; command[0] = 0; continue; }
    if (byte == '\t') {
      fputs("\r\nhealth status execcli exit\r\n>>> ", stdout);
      continue;
    }
    if (byte == '\r') {
      printf("%s\r\n", command);
      if (!strcmp(command, "health")) fputs("OFFLINE_FIXTURE_HEALTH\r\n", stdout);
      fputs(">>> ", stdout);
      length = 0; command[0] = 0; continue;
    }
    if (length + 1 >= sizeof(command)) return 6;
    command[length++] = (char)byte; command[length] = 0;
  }
}
`;

test('actual final worker captures after original operation expiry and closes without resetting its budget', async () => {
  let inputs: Record<string, OriginalInputBinding> | undefined;
  let binding: Record<string, unknown> | undefined;
  let guards:
    | {
        inputs(): Promise<void>;
        original(value: Record<string, unknown>): Promise<void>;
        trust(value: Record<string, unknown>, role: 'observer' | 'ce'): Promise<void>;
      }
    | undefined;
  let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  const guardCalls: string[] = [];
  try {
    await withApplyInventory(
      async ({ before }) => {
        expect(inputs).toBeDefined();
        while (linuxMonotonicMs() < before.original.budget.deadline) await Bun.sleep(10);
      },
      true,
      async ({ final }) => {
        const { original } = final;
        const completed = await final.execution.output.finish();
        await acknowledgeOriginalApplyGroupClosure(final, completed);
        if (!inputs || !binding || !guards || !final.reserve) throw new Error('Original offline final inputs required');
        expect(linuxMonotonicMs()).toBeGreaterThanOrEqual(original.budget.deadline);
        const options = { context: original, inputs, binding, guards };
        await expect(openInstalledGuestWorker(options)).rejects.toThrow(/expired/);
        const worker = await openInstalledFinalGuestWorker(options, final);
        try {
          await worker.initialize();
          const request = JSON.parse(await readFile(join(worker.root, 'request.private.json'), 'utf8'));
          const released = JSON.parse(
            await readFile(join(worker.root, 'guest/release-observation.private.json'), 'utf8'),
          );
          expect(released.startupDeadlineMs).toBe(request.startupDeadlineMs);
          expect(released.observedMs).toBeLessThan(request.startupDeadlineMs);
          await worker.command({ operation: 'discover', scope: 'root' });
          const result = await worker.command({ operation: 'capture', kind: 'health' });
          expect(result.guestAcceptanceComplete).toBe(false);
          const evidence = result.evidence as Record<string, unknown>[];
          expect(evidence).toHaveLength(1);
          expect(evidence[0].instanceId).toBe(binding.instance_id);
          expect(evidence[0].startedMonotonicMs).toBeGreaterThanOrEqual(original.budget.deadline);
          expect(evidence[0].truncated).toBe(false);
          expect(await readFile(String(evidence[0].path), 'utf8')).toContain('OFFLINE_FIXTURE_HEALTH');
        } finally {
          await worker.dispose();
        }
        const evidence = worker.evidence();
        expect(evidence.submissions).toBe(1);
        expect(evidence.disposed).toBe(true);
        expect(evidence.completion?.originalGroupClosed).toBe(true);
        expect(evidence.completion?.actualExitCode).toBe(0);
        expect(evidence.final?.originalDeadlineMs).toBe(original.budget.deadline);
        expect(evidence.originalFinalCapture?.finalDeadlineMs).toBe(final.reserve.finalDeadlineMs);
        expect(evidence.originalFinalCapture?.finalDeadlineMs).toBe(final.reserve.finalStartedMs + 300000);
        expect(evidence.guestAcceptanceComplete).toBe(false);
        expect(guardCalls).toContain('original');
        expect(guardCalls).toContain('trust:observer');
        expect(guardCalls).toContain('trust:ce');
      },
      async (context) => {
        const root = context.executionDirectory;
        const source = join(root, 'offline-terminal.c'),
          ssh = join(root, 'ssh');
        await writeFile(source, terminalSource, { mode: 0o400 });
        const compiler = Bun.which('cc');
        if (!compiler) throw new Error('Linux C compiler required for PTY composition regression');
        const process = Bun.spawn([compiler, source, '-o', ssh], { stdout: 'pipe', stderr: 'pipe' });
        await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text()]);
        expect(await process.exited).toBe(0);
        await chmod(ssh, 0o500);
        inputs = {
          ...context.inputs,
          ...(await inspectInstalledCaptureScripts()),
          ssh: (await readOwnedInstalledInput(ssh)).binding,
        };
        binding = {
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
        const expected = structuredClone(binding),
          originalMonitor = monitor;
        guards = {
          inputs: () => originalMonitor.assertOriginal(),
          async original(value) {
            expect(value).toEqual(expected);
            guardCalls.push('original');
          },
          async trust(value, role) {
            expect(value).toEqual(expected);
            guardCalls.push(`trust:${role}`);
          },
        };
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
