/** Original plan/context/output/callback issuers; simulated provider/UI bytes, no cloud apply. */
import { expect, test } from 'bun:test';
import { createGcpTerraformRequestReason } from '../../gcloud/src/ce/request-reason';
import { GCP_XCSH15176_TERRAFORM_ARTIFACTS } from '../../gcloud/src/ce/terraform-public-artifacts';
import {
  publicTerraformCloudScope,
  publicTerraformPlatformScope,
} from '../../gcloud/src/ce/terraform-public-ownership';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { readOriginalGoogleHttpResponseSource } from '../src/gcp-http-rpc-trace';
import { collectOriginalEarlyGcpInsertIdentity } from '../src/gcp-insert-evidence';
import { acknowledgeOriginalApplyGroupClosure } from '../src/installed-apply-controller';
import { openInstalledApplyTraceStage } from '../src/installed-apply-trace-stage';
import { readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import { readOriginalExecutionCompletion, readOriginalExecutionPrefix } from '../src/original-output-stream';
import { inspectFinalReaderReserve } from '../src/reader-final-reserve';
import { operationFixture, requestFixture, traceFixture } from './fixtures/gcp-insert.fixture';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';

const providerPath = '/example/provider/terraform-provider-google_v8.12.0_x5';
async function campaign(
  failedDelivery = false,
  unresolvedDelivery = false,
  earlyClosure = false,
  failedObservation = false,
  settlingObservation = false,
) {
  let reason: ReturnType<typeof createGcpTerraformRequestReason> | undefined;
  let stage: Awaited<ReturnType<typeof openInstalledApplyTraceStage>> | undefined;
  const delivered: string[] = [];
  const ceNames = new Set<string>();
  const observations: number[] = [];
  let expected = 0;
  let finalNow: number | undefined;
  let releaseDelivery: (() => void) | undefined;
  const delivery = new Promise<void>((resolve) => {
    releaseDelivery = resolve;
  });
  let releaseObservation: (() => void) | undefined;
  const observationSettlement = new Promise<void>((resolve) => {
    releaseObservation = resolve;
  });
  await withApplyInventory(
    async ({ before }) => {
      if (!stage) throw new Error('Original trace stage fixture required');
      await expect(stage.start({ ...before.execution }, before)).rejects.toThrow('exact admission');
      await expect(stage.start(before.execution, { ...before, original: before.original })).rejects.toThrow('callback');
      const starts = await Promise.allSettled([
        stage.start(before.execution, before),
        stage.start(before.execution, before),
      ]);
      expect(starts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(starts.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const deadline = Date.now() + 10000;
      while (delivered.length !== (failedDelivery || unresolvedDelivery ? 1 : expected)) {
        if (!failedDelivery && stage.coverage().failed) await stage.assertOriginal();
        if (Date.now() >= deadline) throw new Error('Original response dispatch fixture expired');
        await Bun.sleep(10);
      }
      expect(stage.coverage().completed).toBe(false);
      if (settlingObservation || (!failedDelivery && !unresolvedDelivery && !failedObservation)) {
        const observedDeadline = Date.now() + 10000;
        while (
          !observations.some((count) => count > 0) ||
          (!settlingObservation && stage.coverage().observationActive)
        ) {
          if (Date.now() >= observedDeadline) throw new Error('Original serialized observation was not dispatched');
          await Bun.sleep(10);
        }
      }
      if (failedObservation && !settlingObservation) {
        const deadline = Date.now() + 10000;
        while (!stage.coverage().failed) {
          if (Date.now() >= deadline) throw new Error('Original observation failure not retained');
          await Bun.sleep(10);
        }
      }
      if (earlyClosure) {
        await expect(
          Promise.race([
            stage.closeAfterExecutorExit(),
            Bun.sleep(1000).then(() => {
              throw new Error('Unbounded source closure');
            }),
          ]),
        ).rejects.toThrow('final proof');
        await stage.whenSettled();
      }
      await expect(stage.start(before.execution, before)).rejects.toThrow('claimed');
    },
    true,
    async ({ final, capture }) => {
      if (!stage || !final.reserve) throw new Error('Original final trace fixture required');
      const timing = inspectFinalReaderReserve(final.reserve);
      if (earlyClosure) {
        await expect(stage.finalCapture(capture, final.reserve, final)).rejects.toThrow('claimed');
        for (const channel of ['stdout', 'stderr'] as const)
          while (await final.execution.output.read(channel)) {
            /* original independent cleanup drain */
          }
        await acknowledgeOriginalApplyGroupClosure(final, await final.execution.output.finish());
        await expect(stage.closeAfterExecutorExit()).rejects.toThrow('final proof');
        return;
      }
      await expect(
        stage.finalCapture({ ...capture, finalDeadlineMs: capture.finalDeadlineMs + 1 }, final.reserve, final),
      ).rejects.toThrow('budget');
      if (unresolvedDelivery) {
        const finish = stage.finalCapture(capture, final.reserve, final);
        finish.catch(() => {});
        const timer = setTimeout(() => {
          finalNow = timing.finalDeadlineMs + 1;
        }, 50);
        try {
          await expect(
            Promise.race([
              finish,
              Bun.sleep(2000).then(() => {
                throw new Error('Hung original reader exceeded final reserve');
              }),
            ]),
          ).rejects.toThrow('unresolved');
          await expect(stage.closeAfterExecutorExit()).rejects.toThrow('unresolved');
          expect(stage.coverage().completed).toBe(false);
        } finally {
          clearTimeout(timer);
          releaseDelivery?.();
          await finish.catch(() => {});
          await stage.whenSettled();
        }
        return;
      }
      if (settlingObservation) {
        const finish = stage.finalCapture(capture, final.reserve, final);
        finish.catch(() => {});
        const deadline = Date.now() + 2000;
        for (;;) {
          try {
            await stage.assertOriginal();
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('retired')) throw error;
            break;
          }
          if (Date.now() >= deadline) throw new Error('Original final capture was not claimed');
          await Bun.sleep(10);
        }
        expect(stage.coverage().observationActive).toBe(true);
        releaseObservation?.();
        if (failedObservation) await expect(finish).rejects.toThrow('incomplete');
        else await finish;
      } else if (failedDelivery || failedObservation)
        await expect(stage.finalCapture(capture, final.reserve, final)).rejects.toThrow('incomplete');
      else await stage.finalCapture(capture, final.reserve, final);
      const transcript = await stage.readTranscript(final);
      await expect(stage.readTranscript({ ...final, original: final.original })).rejects.toThrow('callback');
      expect(await stage.readTranscript(final)).toBe(transcript);
      expect(transcript.responses).toHaveLength(expected);
      expect(transcript.bodies).toHaveLength(expected);
      expect(transcript.rpcs.filter((rpc) => rpc.resourceType === 'google_compute_instance')).toHaveLength(expected);
      expect(transcript.hooks.filter((hook) => hook.phase === 'apply_start')).toHaveLength(
        transcript.originalPlan.receipt.changes.length,
      );
      expect(readOriginalExecutionCompletion(final.execution.output, transcript.completion).identity).toEqual(
        final.execution.identity,
      );
      expect(transcript.executionQualified).toBe(false);
      if (failedDelivery || failedObservation)
        await expect(stage.closeAfterExecutorExit()).rejects.toThrow('incomplete');
      else await stage.closeAfterExecutorExit();
      await expect(stage.readTranscript(final)).rejects.toThrow('retired');
    },
    async (context, store) => {
      const originalPlan = await context.readOriginalPlanSource?.();
      if (!originalPlan || !reason) throw new Error('Original plan fixture required');
      if (!failedDelivery && !unresolvedDelivery) {
        const unused = await openInstalledApplyTraceStage({
          context,
          store,
          providerPath,
          onResponse: async () => {
            throw new Error('Unsubmitted source cannot dispatch');
          },
        });
        await unused.prepare?.(context);
        await unused.closeAfterExecutorExit();
        expect(unused.coverage().completed).toBe(false);
      }
      stage = await openInstalledApplyTraceStage({
        context,
        store,
        providerPath,
        onObservation: async ({ callback, originalPlan: source, responses }) => {
          if (failedObservation && !settlingObservation) throw new Error('Synthetic original observation refused');
          if (observations.some((count) => count > 0)) return;
          const prefix = await readOriginalExecutionPrefix(callback.execution.output);
          expect(source).toBe(originalPlan);
          expect(prefix.directory).toBe(context.executionDirectory);
          for (const response of responses) await readOriginalGoogleHttpResponseSource(response);
          // Yield while source checks read the same original descriptor. The
          // pump cannot advance another chunk or read its prefix concurrently.
          await Bun.sleep(20);
          expect(await readOriginalExecutionPrefix(callback.execution.output, prefix)).toBe(prefix);
          observations.push(responses.length);
          if (settlingObservation) {
            await observationSettlement;
            if (failedObservation) throw new Error('Synthetic final-overlap observation refused');
          }
        },
        onResponse: async ({ target, response, originalPlan: source, binding }) => {
          delivered.push(target.name);
          if (unresolvedDelivery) await delivery;
          if (failedDelivery) throw new Error('Synthetic downstream delivery refused');
          if (ceNames.has(target.name)) {
            const identity = await collectOriginalEarlyGcpInsertIdentity({ originalPlan: source, response, binding });
            expect(identity.nodeName).toBe(target.name);
          } else
            expect((await readOriginalGoogleHttpResponseSource(response)).planSha256).toBe(source.receipt.planSha256);
        },
      });
      const configuration = JSON.parse(
        (await readOwnedInstalledInput(context.inputs['workspace:main.tf.json'].path)).bytes.toString(),
      );
      const declarations: Record<string, Record<string, object>> = {};
      const epoch = Date.now();
      const row = (message: string, extra: object = {}, module = 'provider', level = 'debug') =>
        `${JSON.stringify({
          '@timestamp': new Date(epoch).toISOString(),
          '@message': message,
          '@module': module,
          '@level': level,
          ...extra,
        })}\n`;
      const ui = (type: string, extra: object = {}) =>
        row('original fixture UI', { type, ...extra }, 'terraform.ui', 'info');
      let stdout = ui('version', { terraform: '1.17.2', ui: '1.3' });
      let stderr =
        row('starting plugin', { path: providerPath, args: [providerPath] }) +
        row('plugin started', { path: providerPath, pid: 3456 });
      for (const resource of originalPlan.resources) {
        if (resource.mode !== 'managed' || resource.actions.join(',') !== 'create')
          throw new Error('Original create fixture required');
        const resourceName = resource.address.slice(resource.type.length + 1);
        declarations[resource.type] ??= {};
        declarations[resource.type][resourceName] = {};
        const hookResource = {
          addr: resource.address,
          module: '',
          resource: resource.address,
          implied_provider: resource.type.startsWith('google_') ? 'google' : 'xcsh',
          resource_type: resource.type,
          resource_name: resourceName,
          resource_key: null,
        };
        stdout += ui('apply_start', { hook: { resource: hookResource, action: 'create' } });
        if (resource.type === 'google_compute_instance') {
          const known = (key: string) => {
            const field = resource.fields[key];
            if (field.status !== 'known' || typeof field.value !== 'string')
              throw new Error('Original known target required');
            return field.value;
          };
          const name = known('name'),
            zone = known('zone'),
            project = known('project');
          const base = `https://www.googleapis.com/compute/v1/projects/${project}/zones/${zone}`;
          const request = {
            ...requestFixture(),
            name,
            machineType: `projects/${project}/zones/${zone}/machineTypes/e2-standard-8`,
            labels: {
              'xcsh-deployment': context.owner.deploymentId,
              'xcsh-engine': 'terraform',
              'xcsh-site': 'example-site',
              'xcsh-node': name,
            },
            networkInterfaces: requestFixture().networkInterfaces.map((nic) => ({
              ...nic,
              subnetwork: nic.subnetwork.replace('/regions/us-central1/', `/regions/${context.owner.region}/`),
            })),
          };
          const operation = {
            ...operationFixture(),
            name: `operation-${expected}`,
            targetId: String(10000 + expected),
            zone: base,
            selfLink: `${base}/operations/operation-${expected}`,
            targetLink: `${base}/instances/${name}`,
            insertTime: new Date(epoch).toISOString(),
          };
          stderr += traceFixture(request, operation, '8.12.0')
            .replaceAll('us-central1-a', zone)
            .replaceAll('xcsh-1559-example', reason.reason)
            .trimEnd()
            .split('\n')
            .map((raw) => {
              const parsed = JSON.parse(raw);
              parsed['@timestamp'] = new Date(epoch).toISOString();
              if (parsed.tf_req_id)
                parsed.tf_req_id = `11111111-2222-3333-4444-${String(expected + 1).padStart(12, '0')}`;
              return `${JSON.stringify(parsed)}\n`;
            })
            .join('');
          expected++;
        }
        stdout += ui('apply_complete', {
          hook: {
            resource: hookResource,
            action: 'create',
            elapsed_seconds: 1,
            id_key: 'id',
            id_value: resource.address,
          },
        });
      }
      // Reviewed declaration names must be present before parser preparation; source
      // configuration below supplies the same declarations from intent-derived scope.
      expect(configuration.resource).toEqual(declarations);
      await stage.prepare?.(context);
      await expect(stage.prepare?.({ ...context })).rejects.toThrow('context');
      return {
        prefix: stderr,
        tail: row('plugin process exited', { plugin: providerPath, id: '3456' }),
        stdoutPrefix: stdout,
      };
    },
    unresolvedDelivery ? 'capture' : undefined,
    (intent) => {
      reason = createGcpTerraformRequestReason(intent);
      for (const site of intent.sites) for (const node of site.nodes) ceNames.add(node.name);
      const resources = fixtureDeclarations(intent);
      return JSON.stringify({
        terraform: { required_version: '= 1.17.2' },
        provider: { google: [{ request_reason: reason.reason }] },
        resource: resources,
      });
    },
    undefined,
    GCP_XCSH15176_TERRAFORM_ARTIFACTS.providerLock,
    false,
    unresolvedDelivery ? () => finalNow ?? linuxMonotonicMs() : undefined,
  );
  expect(delivered).toHaveLength(failedDelivery || unresolvedDelivery ? 1 : expected);
  return expected;
}

function fixtureDeclarations(intent: GcpCeIntent) {
  const result: Record<string, Record<string, object>> = {};
  for (const resource of publicTerraformCloudScope(intent)) {
    const name = resource.selfLink.split('/').at(-1);
    if (!name) throw new Error('Original fixture name required');
    const type = `google_compute_${resource.kind}`;
    result[type] ??= {};
    result[type][name.replaceAll('-', '_')] = {};
  }
  for (const resource of publicTerraformPlatformScope(intent)) {
    const type = 'tokenName' in resource ? 'xcsh_token' : 'xcsh_securemesh_site_v2';
    result[type] ??= {};
    result[type][resource.address.split('.').at(-1) ?? ''] = {};
  }
  return result;
}

test('one original output reader dispatches three early inserts before EOF and retains every parser issuer', async () => {
  expect(await campaign()).toBe(4);
}, 60000);
test('failed early delivery is single-use and retains the original final transcript without acceptance', async () => {
  expect(await campaign(true)).toBe(4);
}, 60000);
test('an unresolved original delivery cannot overrun the actual final reserve or clear its closure failure', async () => {
  expect(await campaign(false, true)).toBe(4);
}, 60000);
test('premature source closure refuses immediately and cannot replay after the original actor exits', async () => {
  expect(await campaign(false, false, true)).toBe(4);
}, 60000);
test('a failed serialized observation retains its original final evidence and closure refusal', async () => {
  expect(await campaign(false, false, false, true)).toBe(4);
}, 60000);

test('final capture drains a successful original observation without borrowing its retired callback', async () => {
  expect(await campaign(false, false, false, false, true)).toBe(4);
}, 60000);
test('a real observation failure during final settlement remains incomplete with its original transcript', async () => {
  expect(await campaign(false, false, false, true, true)).toBe(4);
}, 60000);
