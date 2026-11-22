/** Original observer/context/readers with explicit offline HTTP audit replies. */
import { expect, test } from 'bun:test';
import { openInstalledGcpCloudSerialReader } from '../src/gcp-cloud-serial-reader';
import { openInstalledGcpObserverImageReader } from '../src/gcp-observer-image';
import {
  bindOriginalGcpObserverFinalImage,
  collectOriginalGcpObserverInsertIdentity,
  collectOriginalGcpObserverVmEvidence,
  readOriginalGcpObserverInsertIdentity,
} from '../src/gcp-observer-insert-evidence';
import { withObserverInsert } from './fixtures/observer-insert.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const mode of ['complete', 'missing', 'wrong-principal', 'wrong-id', 'wrong-role', 'pending-id'] as const)
  test(`original final observer audit retains its separate resource role: ${mode}`, async () => {
    const module = await import('../src/gcp-insert-audit-evidence');
    let original: Parameters<Parameters<typeof withObserverInsert>[0]>[0] | undefined;
    let identity: Awaited<ReturnType<typeof collectOriginalGcpObserverInsertIdentity>> | undefined;
    await withObserverInsert(
      async (input) => {
        original = input;
        if (mode === 'pending-id') input.vm.id = '18446744073709551612';
        identity = await collectOriginalGcpObserverInsertIdentity(input);
        if (mode === 'pending-id') {
          expect((await readOriginalGcpObserverInsertIdentity(identity)).targetId).toBeNull();
          input.operation.targetId = input.vm.id;
        }
        const entry = (id: string) => ({
          insertId: id,
          logName: `projects/${input.callback.original.owner.account}/logs/cloudaudit.googleapis.com%2Factivity`,
          timestamp: input.vm.creationTimestamp,
          resource: {
            type: 'gce_instance',
            labels: {
              project_id: input.callback.original.owner.account,
              zone: String(input.vm.zone).split('/').pop(),
              instance_id: mode === 'wrong-id' ? '18446744073709551610' : input.vm.id,
            },
          },
          protoPayload: {
            '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
            serviceName: 'compute.googleapis.com',
            methodName: 'v1.compute.instances.insert',
            resourceName: `projects/${input.callback.original.owner.account}/zones/${String(input.vm.zone).split('/').pop()}/instances/${input.vm.name}`,
            authenticationInfo: {
              principalEmail: mode === 'wrong-principal' ? 'foreign@example.test' : 'principal@example.com',
            },
            status: {},
          },
        });
        const config = await input.callback.original.readOriginalPlanSource?.();
        if (!config) throw new Error('Original plan required');
        // The request reason is derived from the owning admitted configuration.
        const { readFile } = await import('node:fs/promises');
        const configuration = JSON.parse(
          await readFile(input.callback.original.inputs['workspace:main.tf.json'].path, 'utf8'),
        );
        const first = {
          ...entry('first-observer'),
          operation: { id: input.operation.name, producer: 'compute.googleapis.com', first: true },
          protoPayload: {
            ...entry('first-observer').protoPayload,
            request: { ...input.request, canIpForward: mode === 'wrong-role' },
            response: input.operation,
            requestMetadata: { requestAttributes: { reason: configuration.provider.google[0].request_reason } },
          },
        };
        const last = {
          ...entry('last-observer'),
          operation: { id: input.operation.name, producer: 'compute.googleapis.com', last: true },
        };
        input.cloudHook.auditEntries = mode === 'missing' ? [] : [first, last];
      },
      mode === 'pending-id'
        ? (_request, operation) => {
            delete operation.targetId;
          }
        : undefined,
      async (callback) => {
        if (!original || !identity || !callback.reserve) throw new Error('Original final observer sources required');
        const image = await openInstalledGcpObserverImageReader(callback.original, callback, original.imageFetcher);
        await bindOriginalGcpObserverFinalImage(identity, callback, image);
        const reader = await openInstalledGcpCloudSerialReader(callback.original, undefined, original.cloudFetcher, {
          admission: callback.execution,
          reserve: callback.reserve,
        });
        try {
          const vm = await collectOriginalGcpObserverVmEvidence({ identity, callback, reader });
          const request = { identity, vm, reader, baseline: original.baseline, callback };
          if (!['complete', 'pending-id'].includes(mode))
            await expect(module.collectInstalledOriginalObserverAudit(request)).rejects.toThrow();
          else {
            const result = await module.collectInstalledOriginalObserverAudit(request);
            expect(result.auditCorroborated).toBe(true);
            expect(result.instanceId).toBe(String(original.vm.id));
            expect(result.originalInsertQualified).toBe(false);
          }
          await retainOwnedTestCapture(callback.original.executionDirectory, `observer-final-audit-${mode}`, 'success');
        } finally {
          await reader.close();
        }
      },
      undefined,
      true,
      { current: true, factoryImageGuard: true, completeTraceBeforeExit: true },
    );
  }, 60000);
