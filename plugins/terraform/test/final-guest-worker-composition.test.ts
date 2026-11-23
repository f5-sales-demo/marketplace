/** Real pinned Python/FIFO/PTY processes with an offline native terminal.
 * This proves source composition and final timing, never cloud/SSH acceptance. */
import { expect, test } from 'bun:test';
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { acknowledgeOriginalApplyGroupClosure } from '../src/installed-apply-controller';
import {
  collectInstalledOriginalGuestReaderClosures,
  collectInstalledOriginalGuestRound,
  openInstalledFinalGuestWorker,
  openInstalledGuestWorker,
} from '../src/installed-guest-worker';
import { inspectInstalledCaptureScripts, readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import { monitorOriginalInputs, type OriginalInputBinding } from '../src/original-input-monitor';
import {
  assertOriginalReaderGroupClosure,
  assertOriginalReaderGroupInputs,
  persistOriginalReaderGroupSet,
} from '../src/original-reader-group-closure';
import { terminalSource } from './fixtures/native-offline-terminal.fixture';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const inputChanged of [false, true] as const)
  test(`actual final worker retains original closure after expiry and input failure: ${inputChanged}`, async () => {
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
          if (!inputs || !binding || !guards || !final.reserve)
            throw new Error('Original offline final inputs required');
          expect(linuxMonotonicMs()).toBeGreaterThanOrEqual(original.budget.deadline);
          const options = { context: original, inputs, binding, guards };
          await expect(openInstalledGuestWorker(options)).rejects.toThrow(/expired/);
          const worker = await openInstalledFinalGuestWorker(options, final);
          expect(await collectInstalledOriginalGuestReaderClosures(worker)).toEqual([]);
          await expect(collectInstalledOriginalGuestReaderClosures({ ...worker })).rejects.toThrow('source-issued');
          let captureSucceeded = false;
          let captureFailure: unknown;
          try {
            await worker.initialize();
            await expect(collectInstalledOriginalGuestReaderClosures(worker)).rejects.toThrow('terminal');
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
            expect(
              report.captures.filter((item) => item.kind === 'cri-inspect').map((item) => item.containerId),
            ).toEqual(['cccccccccccccccc', 'dddddddddddddddd']);
            expect(report.captures.filter((item) => item.kind === 'cri-logs-full')).toHaveLength(2);
            expect(worker.evidence().collectionRounds).toBe(1);
            await expect(collectInstalledOriginalGuestRound({ ...worker })).rejects.toThrow(/source-issued/);
            await expect(collectInstalledOriginalGuestRound(worker)).rejects.toThrow(/spacing/);
            captureSucceeded = true;
            if (inputChanged) {
              const host = inputs.ce_hosts.path;
              const bytes = await readFile(host);
              await rename(host, `${host}.original`);
              await writeFile(host, bytes, { mode: 0o400, flag: 'wx' });
            }
          } catch (error) {
            captureFailure = error;
          }
          const failures: unknown[] = [];
          try {
            if (inputChanged) await expect(worker.dispose()).rejects.toThrow();
            else await worker.dispose();
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
          if (
            !evidence.identity ||
            typeof binding.node_name !== 'string' ||
            typeof binding.instance_id !== 'string' ||
            typeof binding.observer_id !== 'string'
          )
            throw new Error('Original native guest actor and typed identity fixture required');
          const failedFlag = join(worker.root, '.terraform-executor-lock', 'capture-unresolved.json');
          const failedFlagBefore = inputChanged ? (await readFile(failedFlag)).toString('hex') : '';
          const closures = await collectInstalledOriginalGuestReaderClosures(worker);
          expect(closures).toHaveLength(1);
          const closure = closures[0];
          if (closure.origin?.kind !== 'original-installed-guest-reader-origin')
            throw new Error('Original guest reader origin required');
          expect(closure.physicalGroupAbsent).toBe(true);
          expect(closure.executionAccepted).toBe(false);
          expect(closure.identity).toEqual(evidence.identity);
          expect(closure.captureComplete).toBe(!inputChanged);
          expect(closure.origin?.owner).toEqual(original.owner);
          expect(closure.origin?.nodeName).toBe(binding.node_name);
          expect(closure.origin?.instanceId).toBe(binding.instance_id);
          expect(closure.origin?.observerId).toBe(binding.observer_id);
          expect(closure.inputs.capture.path).toBe(join(worker.root, 'final-execution.private.json'));
          await assertOriginalReaderGroupClosure(closure);
          for (const change of [
            { owner: { ...original.owner, account: 'example-foreign-project' } },
            { nodeName: 'foreign-node' },
            { instanceId: '999' },
            { tokenSha256: '0'.repeat(64) },
            { request: { ...closure.origin?.request, sha256: '0'.repeat(64) } },
          ])
            await expect(
              assertOriginalReaderGroupClosure({ ...closure, origin: { ...closure.origin, ...change } } as never),
            ).rejects.toThrow();
          expect(worker.evidence()).toEqual(evidence);
          expect((await collectInstalledOriginalGuestReaderClosures(worker))[0].identity).toEqual(closure.identity);
          const groupStore = await CeDeploymentStore.open(join(worker.root, 'reader-proof'), original.owner);
          const groupInputs = await persistOriginalReaderGroupSet({
            store: groupStore,
            owner: original.owner,
            requiredSources: ['guest-final'],
            sources: [{ name: 'guest-final', attemptCount: evidence.submissions, witnesses: closures }],
          });
          await assertOriginalReaderGroupInputs({
            inputs: groupInputs,
            owner: original.owner,
            requiredSources: ['guest-final'],
          });
          const otherOwner = { ...original.owner, deploymentId: 'foreign-origin' };
          const otherStore = await CeDeploymentStore.open(join(worker.root, 'foreign-reader-proof'), otherOwner);
          await expect(
            persistOriginalReaderGroupSet({
              store: otherStore,
              owner: otherOwner,
              requiredSources: ['guest-final'],
              sources: [{ name: 'guest-final', attemptCount: evidence.submissions, witnesses: closures }],
            }),
          ).rejects.toThrow('owner');
          await retainOwnedTestCapture(worker.root, 'final-guest-reader-origin-proof', 'success');
          if (!closure.origin) throw new Error('Original native guest origin required');
          const originalAdmission = closure.origin.admission.path;
          const originalBytes = await readFile(originalAdmission);
          await rename(originalAdmission, `${originalAdmission}.original`);
          await writeFile(originalAdmission, originalBytes, { mode: 0o400, flag: 'wx' });
          await expect(collectInstalledOriginalGuestReaderClosures(worker)).rejects.toThrow();
          await expect(
            assertOriginalReaderGroupInputs({
              inputs: groupInputs,
              owner: original.owner,
              requiredSources: ['guest-final'],
            }),
          ).rejects.toThrow();
          expect(worker.evidence()).toEqual(evidence);
          if (inputChanged) expect((await readFile(failedFlag)).toString('hex')).toBe(failedFlagBefore);
          await retainOwnedTestCapture(worker.root, 'final-guest-reader-origin-replaced', 'success');
          expect(evidence.submissions).toBe(1);
          expect(evidence.disposed).toBe(!inputChanged);
          if (!inputChanged) {
            expect(evidence.completion?.originalGroupClosed).toBe(true);
            expect(evidence.completion?.actualExitCode).toBe(0);
          } else {
            expect(evidence.executionFailureRetained).toBe(true);
            const diagnostics = await readFile(join(worker.root, 'final-execution.private.json'), 'utf8');
            expect(JSON.parse(diagnostics).signalsSent).toBe(false);
          }
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

test('original before guest reader closes within its original active budget and retains durable origin', async () => {
  let options: Parameters<typeof openInstalledGuestWorker>[0] | undefined;
  await withApplyInventory(
    async ({ before }) => {
      if (!options) throw new Error('Original native before inputs required');
      const worker = await openInstalledGuestWorker(options);
      try {
        await worker.initialize();
        await worker.command({ operation: 'discover', scope: 'root' });
        await worker.command({ operation: 'capture', kind: 'health' });
      } finally {
        await worker.dispose();
      }
      const closures = await collectInstalledOriginalGuestReaderClosures(worker);
      expect(closures).toHaveLength(1);
      if (closures[0].origin?.kind !== 'original-installed-guest-reader-origin')
        throw new Error('Original guest reader origin required');
      expect(closures[0].origin.phase).toBe('before');
      expect(closures[0].origin?.owner).toEqual(before.original.owner);
      expect(closures[0].physicalGroupAbsent).toBe(true);
      expect(closures[0].executionAccepted).toBe(false);
      await assertOriginalReaderGroupClosure(closures[0]);
      await retainOwnedTestCapture(worker.root, 'before-guest-reader-origin-proof', 'success');
    },
    true,
    undefined,
    async (context) => {
      const root = context.executionDirectory,
        source = join(root, 'before-offline-terminal.c'),
        ssh = join(root, 'before-ssh');
      await writeFile(source, terminalSource, { mode: 0o400 });
      const compiler = Bun.which('cc');
      if (!compiler) throw new Error('Linux C compiler required');
      const compiled = Bun.spawn([compiler, source, '-o', ssh], { stdout: 'pipe', stderr: 'pipe' });
      await Promise.all([new Response(compiled.stdout).text(), new Response(compiled.stderr).text()]);
      expect(await compiled.exited).toBe(0);
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
        const path = join(root, `before-${role}`);
        await writeFile(path, `offline-fixture-${role}`, { mode: 0o400 });
        inputs[role] = (await readOwnedInstalledInput(path)).binding;
        binding[role] = path;
      }
      options = {
        context,
        inputs,
        binding,
        guards: { inputs: async () => {}, original: async () => {}, trust: async () => {} },
      };
      return { prefix: '', tail: '' };
    },
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    undefined,
    false,
    20000,
  );
}, 60000);
