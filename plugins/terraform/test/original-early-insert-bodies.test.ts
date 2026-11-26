import { expect, test } from 'bun:test';
import * as inserts from '../src/gcp-insert-evidence';
import { withInsertWitnesses } from './fixtures/original-insert-witness.fixture';

test('original early identity supplies verified immutable private request bytes for the VM join', async () => {
  expect(typeof inserts.readOriginalEarlyGcpInsertBodies).toBe('function');
  await withInsertWitnesses(async (input) => {
    const identity = await inserts.collectOriginalEarlyGcpInsertIdentity({
      originalPlan: input.originalPlan,
      response: input.earlyResponse,
      binding: input.binding,
    });
    const bodies = await inserts.readOriginalEarlyGcpInsertBodies(identity);
    expect(bodies.requestBody).toBe(input.earlyResponse.requestBody);
    expect(bodies.responseBody).toBe(input.earlyResponse.responseBody);
    expect(bodies.requestBodySha256).toBe(identity.requestBodySha256);
    expect(bodies.responseBodySha256).toBe(identity.responseBodySha256);
    expect(Object.isFrozen(bodies)).toBe(true);
    expect(bodies.executionAuthorized).toBe(false);
    expect(JSON.stringify(identity)).not.toContain('example-private-bootstrap');
    const decoded = JSON.parse(bodies.requestBody);
    expect(decoded.networkInterfaces).toHaveLength(1);
    expect(decoded.metadata.items.some((item: { key: string }) => item.key === 'user-data')).toBe(true);
  });
}, 60000);

test('serialized or copied early identity cannot expose private source bodies', async () => {
  expect(typeof inserts.readOriginalEarlyGcpInsertBodies).toBe('function');
  await withInsertWitnesses(async (input) => {
    const identity = await inserts.collectOriginalEarlyGcpInsertIdentity({
      originalPlan: input.originalPlan,
      response: input.earlyResponse,
      binding: input.binding,
    });
    await expect(inserts.readOriginalEarlyGcpInsertBodies({ ...identity })).rejects.toThrow('Original');
    await expect(inserts.readOriginalEarlyGcpInsertBodies(JSON.parse(JSON.stringify(identity)))).rejects.toThrow(
      'Original',
    );
    expect((await inserts.readOriginalEarlyGcpInsertBodies(identity)).requestBody).toBe(
      input.earlyResponse.requestBody,
    );
  });
}, 60000);

test('changed original bytes permanently retire early identity and private body access', async () => {
  expect(typeof inserts.readOriginalEarlyGcpInsertBodies).toBe('function');
  await expect(
    withInsertWitnesses(async (input, _output, admission) => {
      const identity = await inserts.collectOriginalEarlyGcpInsertIdentity({
        originalPlan: input.originalPlan,
        response: input.earlyResponse,
        binding: input.binding,
      });
      await inserts.readOriginalEarlyGcpInsertBodies(identity);
      const { readFile, writeFile } = await import('node:fs/promises');
      const bytes = await readFile(admission.stderrPath);
      const changed = Buffer.from(bytes);
      changed[0] ^= 1;
      await writeFile(admission.stderrPath, changed);
      await expect(inserts.readOriginalEarlyGcpInsertBodies(identity)).rejects.toThrow();
      await writeFile(admission.stderrPath, bytes);
      await expect(inserts.readOriginalEarlyGcpInsertBodies(identity)).rejects.toThrow('refused');
      await expect(inserts.readOriginalEarlyGcpInsertIdentity(identity)).rejects.toThrow('refused');
      throw new Error('Expected original private-body capture refusal');
    }),
  ).rejects.toThrow();
}, 60000);

test('failed original witness fixtures retain their executor evidence and refusal receipt', async () => {
  let directory: string | undefined;
  await expect(
    withInsertWitnesses(async (_input, _output, admission) => {
      directory = admission.directory;
      throw new Error('Expected original witness capture failure');
    }),
  ).rejects.toThrow();
  if (!directory) throw new Error('Original witness executor directory required');
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const receipt = JSON.parse(await readFile(join(directory, 'fixture-failure.private.json'), 'utf8'));
  expect(receipt.cloudResources).toBe(0);
  expect(receipt.originalInsertQualified).toBe(false);
  expect(await Bun.file(join(directory, 'simulated-insert.py')).exists()).toBe(true);
}, 60000);
