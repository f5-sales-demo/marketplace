/** Real pinned Python/FIFO/PTY processes with an offline native terminal.
 * This proves source composition and final timing, never cloud/SSH acceptance. */
import { expect, test } from 'bun:test';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acknowledgeOriginalApplyGroupClosure } from '../src/installed-apply-controller';
import {
  collectInstalledOriginalGuestRound,
  openInstalledFinalGuestWorker,
  openInstalledGuestWorker,
} from '../src/installed-guest-worker';
import { inspectInstalledCaptureScripts, readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import { monitorOriginalInputs, type OriginalInputBinding } from '../src/original-input-monitor';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

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
    if (now.tv_sec - began.tv_sec >= 270) return 4;
    struct pollfd input = {0, POLLIN, 0};
    if (poll(&input, 1, 100) < 0) return 5;
    if (!(input.revents & POLLIN)) continue;
    unsigned char byte;
    if (read(0, &byte, 1) != 1) return 0;
    if (escape) { if (byte == '.') return 0; escape = 0; }
    if (byte == '~') { escape = 1; continue; }
    if (byte == 21) { length = 0; command[0] = 0; continue; }
    if (byte == '\t') {
      if (!strncmp(command, "execcli journalctl ", 18))
        fputs("\r\n--help -u -b -p -o --no-pager --utc\r\n>>> ", stdout);
      else if (!strncmp(command, "execcli crictl-logs ", 19))
        fputs("\r\n--help --tail\r\n>>> ", stdout);
      else if (!strncmp(command, "execcli ", 8))
        fputs("\r\ndate ip-address ip-route journalctl crictl-ps-a crictl-inspect crictl-logs\r\n>>> ", stdout);
      else if (!strncmp(command, "status ", 7)) fputs("\r\nvpm\r\n>>> ", stdout);
      else fputs("\r\nhealth diagnosis status execcli exit\r\n>>> ", stdout);
      continue;
    }
    if (byte == '\r') {
      printf("%s\r\n", command);
      if (!strcmp(command, "health")) fputs("OFFLINE_FIXTURE_HEALTH\r\n", stdout);
      if (!strcmp(command, "execcli journalctl --help")) {
        fputs("journalctl [OPTIONS...] [MATCHES...]\r\n", stdout);
        fputs(" -u --unit=UNIT Show logs from the specified unit\r\n", stdout);
        fputs(" -b --boot[=ID] Show logs from the specified boot\r\n", stdout);
        fputs(" -p --priority=RANGE Show entries of the specified priority\r\n", stdout);
        fputs(" -o --output=STRING Change journal output mode\r\n", stdout);
        fputs(" --no-pager Do not pipe output into a pager\r\n", stdout);
        fputs(" --utc Express time in Coordinated Universal Time\r\n", stdout);
      }
      if (!strcmp(command, "execcli journalctl -u vpm --no-pager --utc -o short-iso-precise"))
        for (int index = 0; index < 250; index++)
          printf("2026-11-21T00:00:00+0000 OFFLINE_JOURNAL_%d\r\n", index);
      if (!strcmp(command, "execcli crictl-logs --help"))
        fputs("NAME:\r\n crictl logs - Fetch the logs of a container\r\nUSAGE:\r\n crictl logs [command options] CONTAINER-ID\r\nOPTIONS:\r\n --tail value Number of lines to show from the end of the logs (default: -1)\r\n", stdout);
      if (!strcmp(command, "execcli crictl-ps-a"))
        fputs("CONTAINER ID IMAGE\r\ncccccccccccccccc offline-vpm\r\ndddddddddddddddd offline-exited\r\n", stdout);
      if (!strncmp(command, "execcli crictl-logs ", 19) && strstr(command, "--tail=-1"))
        fputs("OFFLINE_FULL_CONTAINER_LOG\r\n", stdout);
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
        let captureSucceeded = false;
        let captureFailure: unknown;
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
          await worker.command({ operation: 'discover', scope: 'execcli' });
          await worker.command({ operation: 'discover', scope: 'journal' });
          const help = await worker.command({ operation: 'capture', kind: 'journal-help' });
          const journal = await worker.command({ operation: 'capture', kind: 'vpm-journal-full' });
          const journalEvidence = journal.evidence as Record<string, unknown>[];
          expect(journalEvidence).toHaveLength(1);
          expect(journalEvidence[0].helpSha256).toBe((help.evidence as Record<string, unknown>[])[0].sha256);
          expect(journalEvidence[0].logSelection).toBe('all-retained');
          expect(journalEvidence[0].truncated).toBe(false);
          expect(journalEvidence[0].instanceId).toBe(binding.instance_id);
          expect(journalEvidence[0].guestAcceptanceComplete).toBe(false);
          const fullRaw = await readFile(String(journalEvidence[0].path), 'utf8');
          expect(fullRaw).toContain('OFFLINE_JOURNAL_0');
          expect(fullRaw).toContain('OFFLINE_JOURNAL_249');
          const round = collectInstalledOriginalGuestRound(worker);
          await expect(collectInstalledOriginalGuestRound(worker)).rejects.toThrow(/active/);
          await expect(worker.command({ operation: 'capture', kind: 'health' })).rejects.toThrow(/active/);
          const report = await round;
          expect(report.status).toBe('captured');
          expect(report.bootstrapCoverageVerified).toBe(false);
          expect(report.guestAcceptanceComplete).toBe(false);
          expect(report.original.instanceId).toBe(String(binding.instance_id));
          expect(report.deadlineMs).toBe(final.reserve.finalDeadlineMs);
          expect(report.captures.filter((item) => item.kind === 'cri-inspect').map((item) => item.containerId)).toEqual(
            ['cccccccccccccccc', 'dddddddddddddddd'],
          );
          expect(report.captures.filter((item) => item.kind === 'cri-logs-full')).toHaveLength(2);
          expect(worker.evidence().collectionRounds).toBe(1);
          await expect(collectInstalledOriginalGuestRound({ ...worker })).rejects.toThrow(/source-issued/);
          await expect(collectInstalledOriginalGuestRound(worker)).rejects.toThrow(/spacing/);
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
          const retained = await retainOwnedTestCapture(
            worker.root,
            'final-guest-round',
            captureSucceeded ? 'success' : 'failure',
          );
          console.info(JSON.stringify({ kind: 'private-native-capture-retained', ...retained }));
        } catch (error) {
          failures.push(error);
        }
        if (captureFailure || failures.length)
          throw new AggregateError(
            [...(captureFailure ? [captureFailure] : []), ...failures],
            'Original native capture closure or retention incomplete',
          );
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
          inputs: () => originalMonitor.assertOriginalIdentity(),
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
