/** Original controller/baseline/readers; completed UI/provider bodies are explicit offline fixtures. */
import { expect, test } from 'bun:test';
import type { OriginalGcpVmJoinInput } from '../src/gcp-vm-evidence';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { fullVmFixture } from './fixtures/sealed-full-vm.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const mode of ['complete', 'missing', 'wrong-principal', 'wrong-vm', 'copied-callback', 'copied-reader'] as const)
  test(`installed final CE audit dispatch uses original sealed ownership: ${mode}`, async () => {
    const module = await import('../src/gcp-insert-audit-evidence');
    let source: OriginalGcpVmJoinInput['source'] | undefined;
    await withEarlyVmFixture(
      async (input) => {
        source = (await fullVmFixture(input, true)).source;
        const entry = (id: string) => ({
          insertId: id,
          logName: `projects/${input.identity.project}/logs/cloudaudit.googleapis.com%2Factivity`,
          timestamp: String(input.state.vm.creationTimestamp),
          resource: {
            type: 'gce_instance',
            labels: {
              project_id: input.identity.project,
              zone: input.identity.zone,
              instance_id: mode === 'wrong-vm' ? '18446744073709551610' : input.state.vm.id,
            },
          },
          protoPayload: {
            '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
            serviceName: 'compute.googleapis.com',
            methodName: 'v1.compute.instances.insert',
            resourceName: `projects/${input.identity.project}/zones/${input.identity.zone}/instances/${input.identity.nodeName}`,
            authenticationInfo: {
              principalEmail: mode === 'wrong-principal' ? 'foreign@example.com' : 'principal@example.com',
            },
            status: {},
          },
        });
        const first = {
          ...entry('first'),
          operation: { id: input.state.operation.name, producer: 'compute.googleapis.com', first: true },
          protoPayload: {
            ...entry('first').protoPayload,
            request: input.state.request,
            response: input.state.operation,
            requestMetadata: { requestAttributes: { reason: 'xcsh-1559-example' } },
          },
        };
        const last = {
          ...entry('last'),
          operation: { id: input.state.operation.name, producer: 'compute.googleapis.com', last: true },
        };
        input.state.auditEntries = mode === 'missing' ? [] : [first, last];
      },
      async (input) => {
        if (!source) throw new Error('Original CE source required');
        const request = {
          source,
          baseline: input.baseline,
          reader: mode === 'copied-reader' ? { ...input.reader } : input.reader,
          callback:
            mode === 'copied-callback' ? { ...input.callback, original: input.callback.original } : input.callback,
        };
        if (mode !== 'complete') await expect(module.collectInstalledOriginalCeAudit(request)).rejects.toThrow();
        else {
          const result = await module.collectInstalledOriginalCeAudit(request);
          expect(result.auditCorroborated).toBe(true);
          expect(result.instanceId).toBe(String(input.state.vm.id));
          expect(result.originalInsertQualified).toBe(false);
        }
        await retainOwnedTestCapture(input.callback.original.executionDirectory, `ce-final-audit-${mode}`, 'success');
      },
      undefined,
      true,
    );
  }, 60000);
