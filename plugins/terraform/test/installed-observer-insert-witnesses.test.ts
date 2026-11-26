/** Original plan/callback/descriptor/window issuers; logs and process observations are explicit offline fixtures. */

import { expect, test } from 'bun:test';
import { dirname } from 'node:path';
import { GoogleHttpRpcTraceParser } from '../src/gcp-http-rpc-trace';
import { openInstalledGcpObserverImageReader } from '../src/gcp-observer-image';
import {
  bindOriginalGcpObserverFinalImage,
  collectOriginalGcpObserverInsertIdentity,
} from '../src/gcp-observer-insert-evidence';
import { GoogleProviderLifecycleParser } from '../src/google-provider-lifecycle';
import { type InstalledProviderWindow, openInstalledProviderReader } from '../src/installed-provider-reader';
import type { OriginalTerraformPlanProjection } from '../src/runner';
import { TerraformApplyHookParser } from '../src/terraform-apply-hooks';
import { withObserverInsert } from './fixtures/observer-insert.fixture';
import { fixture } from './installed-provider-reader-fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const mode of ['complete', 'copied-body', 'copied-ui', 'copied-rpc', 'copied-window', 'wrong-address'] as const)
  test(`original observer UI HTTP and RPC witnesses share their owning source: ${mode}`, async () => {
    const module = await import('../src/installed-observer-insert-witnesses');
    let before: Parameters<Parameters<typeof withObserverInsert>[0]>[0] | undefined;
    let identity: Awaited<ReturnType<typeof collectOriginalGcpObserverInsertIdentity>> | undefined;
    let ui: TerraformApplyHookParser | undefined, life: GoogleProviderLifecycleParser | undefined;
    let http: GoogleHttpRpcTraceParser | undefined, plan: OriginalTerraformPlanProjection | undefined;
    let configuration = '',
      epoch = 0;
    const providerPath = '/example/terraform-provider-google_v8.12.0_x5';
    const binding = {
      terraformVersion: '1.17.2',
      providerLockSha256: '74834870028124a9006ab8d34d49517b71b7a7e3ea5a3c1004b3899dacca3b4b',
    };
    const hooks: ReturnType<TerraformApplyHookParser['pushOriginal']>[number][] = [];
    const rpcs: ReturnType<GoogleProviderLifecycleParser['pushOriginal']>[number][] = [];
    const bodies: ReturnType<GoogleHttpRpcTraceParser['consumeBodies']>[] = [];
    const windows: InstalledProviderWindow[] = [];
    await withObserverInsert(
      async (input) => {
        before = input;
        identity = await collectOriginalGcpObserverInsertIdentity(input);
        for (const offset of [0, 30000]) {
          const run = await fixture('812', input.callback.execution.identity),
            mono = run.clock();
          run.mutate((value) => {
            const row = (value.observations as Record<string, unknown>[])[0];
            value.observations = [{ ...row, firstObservedMs: mono + 100, lastObservedMs: mono + 44999 }];
          });
          const reader = await openInstalledProviderReader(run.context, run.admission, {
            executorFactory: run.factory,
            clock: run.clock,
            epochClock: () => epoch + offset + run.clock() - mono,
          });
          const pending = reader.startStderrWindow();
          await pending.ready;
          run.releaseWindow();
          windows.push(await pending.complete);
        }
      },
      undefined,
      async (callback) => {
        if (!before || !identity || !ui || !life || !http || !plan)
          throw new Error('Original observer witnesses required');
        const complete = await callback.execution.output.finish();
        ui.finishOriginal(callback.execution.output, complete);
        life.finishOriginal(callback.execution.output, complete);
        http.finishOriginal(callback.execution.output, complete);
        const image = await openInstalledGcpObserverImageReader(callback.original, callback, before.imageFetcher);
        await bindOriginalGcpObserverFinalImage(identity, callback, image);
        const originalBefore = before;
        const selectedStart = hooks.find(
          (value) =>
            value.phase === 'apply_start' &&
            value.address === `google_compute_instance.${String(originalBefore.vm.name).replaceAll('-', '_')}`,
        );
        const selectedEnd = hooks.find(
          (value) => value.phase === 'apply_complete' && value.address === selectedStart?.address,
        );
        if (!selectedStart || !selectedEnd) throw new Error('Original observer UI pair required');
        const source = {
          identity,
          callback,
          baseline: before.baseline,
          originalPlan: plan,
          configuration,
          binding,
          providerPath,
          body: mode === 'copied-body' ? { ...bodies[0] } : bodies[0],
          started: mode === 'copied-ui' ? { ...selectedStart } : selectedStart,
          completed:
            mode === 'wrong-address' ? { ...selectedEnd, address: 'google_compute_instance.foreign' } : selectedEnd,
          rpc: mode === 'copied-rpc' ? { ...rpcs[0] } : rpcs[0],
          windows: mode === 'copied-window' ? [windows[0], { ...windows[1] }] : windows,
        };
        if (mode !== 'complete') await expect(module.collectInstalledObserverInsertWitnesses(source)).rejects.toThrow();
        else {
          const result = await module.collectInstalledObserverInsertWitnesses(source);
          expect(result.uiSourceCorroborated).toBe(true);
          expect(result.httpSourceCorroborated).toBe(true);
          expect(result.rpcWindowTimeCorroborated).toBe(true);
          expect(result.originalInsertQualified).toBe(false);
        }
        await retainOwnedTestCapture(callback.original.executionDirectory, `observer-witness-${mode}`, 'success');
        for (const [index, window] of windows.entries())
          await retainOwnedTestCapture(dirname(window.evidencePath), `observer-window-${mode}-${index}`, 'success');
      },
      undefined,
      true,
      {
        current: true,
        factoryImageGuard: true,
        completeTraceBeforeExit: true,
        observeChunk(channel, chunk, callback) {
          if (!ui || !life || !http) throw new Error('Original witness parsers required');
          if (channel === 'stdout') hooks.push(...ui.pushOriginal(callback.execution.output, chunk));
          else {
            rpcs.push(...life.pushOriginal(callback.execution.output, chunk));
            for (const value of http.pushOriginal(callback.execution.output, chunk))
              bodies.push(http.consumeBodies(value));
          }
        },
        async prepareTrace(context, trace) {
          plan = await context.readOriginalPlanSource?.();
          if (!plan) throw new Error('Original plan required');
          const { readFile } = await import('node:fs/promises');
          configuration = await readFile(context.inputs['workspace:main.tf.json'].path, 'utf8');
          const resource = plan.resources.find(
            (row) =>
              row.type === 'google_compute_instance' &&
              row.fields.name.status === 'known' &&
              String(row.fields.name.value).includes('observer'),
          );
          if (resource?.fields.name.status !== 'known' || resource.fields.zone.status !== 'known')
            throw new Error('Original observer target required');
          const name = String(resource.fields.name.value),
            zone = String(resource.fields.zone.value);
          epoch = Date.now();
          ui = new TerraformApplyHookParser(plan.receipt, binding, configuration);
          life = new GoogleProviderLifecycleParser({ providerPath, planSha256: plan.receipt.planSha256 }, binding);
          const parsed = JSON.parse(configuration);
          http = new GoogleHttpRpcTraceParser(
            {
              rpc: 'ApplyResourceChange',
              resourceType: 'google_compute_instance',
              method: 'POST',
              url: `https://compute.googleapis.com/compute/v1/projects/${context.owner.account}/zones/${zone}/instances?alt=json`,
              instanceName: name,
              requestReason: parsed.provider.google[0].request_reason,
              planSha256: plan.receipt.planSha256,
            },
            binding,
          );
          const row = (offset: number, message: string, fields = {}) =>
            `${JSON.stringify({
              '@timestamp': new Date(epoch + offset).toISOString(),
              '@module': 'provider',
              '@level': 'debug',
              '@message': message,
              ...fields,
            })}\n`;
          const records = (trace.prefix + trace.tail)
            .trim()
            .split('\n')
            .map((raw) => {
              const value = JSON.parse(raw);
              value['@timestamp'] = new Date(
                epoch +
                  (value['@message'] === 'Received request'
                    ? 1000
                    : value['@message'] === 'Served request'
                      ? 70000
                      : 1050),
              ).toISOString();
              return `${JSON.stringify(value)}\n`;
            })
            .join('');
          const body =
            row(-3000, 'starting plugin', { path: providerPath, args: [providerPath] }) +
            row(-2999, 'plugin started', { path: providerPath, pid: 3456 }) +
            records +
            row(90000, 'plugin process exited', { plugin: providerPath, id: '3456' });
          let stdout = row(0, 'version', {
            '@module': 'terraform.ui',
            '@level': 'info',
            type: 'version',
            terraform: '1.17.2',
            ui: '1.3',
          });
          const ordered = [...plan.resources.filter((value) => value.address !== resource.address), resource];
          for (const [index, value] of ordered.entries()) {
            if (value.mode !== 'managed' || value.actions.join(',') !== 'create') continue;
            const node = value.fields.name;
            if (node.status !== 'known') throw new Error('Original known resource name required');
            const descriptor = {
              addr: value.address,
              module: '',
              resource: value.address,
              implied_provider: value.type.startsWith('google_') ? 'google' : 'xcsh',
              resource_type: value.type,
              resource_name: value.address.split('.')[1],
              resource_key: null,
            };
            let id = String(node.value);
            if (value.type === 'google_compute_instance') {
              const scopeZone = value.fields.zone;
              if (scopeZone.status !== 'known') throw new Error('Original zone required');
              id = `projects/${context.owner.account}/zones/${scopeZone.value}/instances/${node.value}`;
            }
            const begin = value.address === resource.address ? 900 : 100 + index * 10;
            const end = value.address === resource.address ? 70100 : begin + 1;
            stdout += row(begin, 'create', {
              '@module': 'terraform.ui',
              '@level': 'info',
              type: 'apply_start',
              hook: { resource: descriptor, action: 'create' },
            });
            stdout += row(end, 'complete', {
              '@module': 'terraform.ui',
              '@level': 'info',
              type: 'apply_complete',
              hook: {
                resource: descriptor,
                action: 'create',
                elapsed_seconds: value.address === resource.address ? 69 : 0,
                id_key: 'id',
                id_value: id,
              },
            });
          }
          return { prefix: body, tail: '', stdoutPrefix: stdout };
        },
      },
    );
  }, 60000);
