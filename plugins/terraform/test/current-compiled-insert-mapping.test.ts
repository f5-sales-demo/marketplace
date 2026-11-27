import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { operationFixture, requestFixture, scope, traceFixture } from './fixtures/gcp-insert.fixture';

test('shipped current insert parser and body validator agree on the pinned Google pair', async () => {
  const runtime = await import(join(import.meta.dir, '../runtime/index.js'));
  const binding = {
    terraformVersion: '1.17.2',
    providerLockSha256: 'f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5',
  };
  const parser = new runtime.GoogleHttpRpcTraceParser(scope, binding);
  const candidates = parser.push(Buffer.from(traceFixture(requestFixture(), operationFixture(), '8.12.0')));
  parser.finish();
  expect(candidates).toHaveLength(1);
  const bodies = parser.consumeBodies(candidates[0]);
  const identity = runtime.inspectOriginalGcpInsertBodies(bodies, binding);
  expect(identity.nodeName).toBe('example-node');
  expect(identity.targetId).toBe('18446744073709551613');
  expect(identity.originalInsertQualified).toBe(false);
  expect(identity.applyRpcQualified).toBe(false);
  expect(() => runtime.inspectOriginalGcpInsertBodies({ ...bodies }, binding)).toThrow(
    'original parser-issued HTTP body capability',
  );
  expect(() =>
    runtime.inspectOriginalGcpInsertBodies(bodies, { ...binding, providerLockSha256: '0'.repeat(64) }),
  ).toThrow('profile');
});
