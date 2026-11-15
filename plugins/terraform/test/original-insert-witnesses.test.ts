import { expect, test } from 'bun:test';
import * as inserts from '../src/gcp-insert-evidence';
import { withInsertWitnesses } from './fixtures/original-insert-witness.fixture';

test('original insertion witnesses join owning plan, stdout hooks, HTTP/lifecycle stderr and provider window', async () => {
  expect(typeof inserts.collectOriginalGcpInsertWitnesses).toBe('function');
  await withInsertWitnesses(async (input, _output, admission) => {
    const joined = await inserts.collectOriginalGcpInsertWitnesses(input);
    const proof = await inserts.readOriginalGcpInsertWitnesses(joined);
    expect(proof.executor).toEqual(admission.identity);
    expect(proof.planSha256).toBe(input.originalPlan.receipt.planSha256);
    expect(proof.uiSourceCorroborated).toBe(true);
    expect(proof.httpSourceCorroborated).toBe(true);
    expect(proof.rpcWindowTimeCorroborated).toBe(true);
    expect(joined.originalInsertQualified).toBe(false);
    expect(JSON.stringify(joined)).not.toContain('example-private-bootstrap');
    await expect(inserts.readOriginalGcpInsertWitnesses({ ...joined })).rejects.toThrow('Original');
  });
});

for (const changed of ['plan', 'ui', 'rpc', 'window', 'insert'])
  test(`insert witness collection refuses copied ${changed} source`, async () => {
    expect(typeof inserts.collectOriginalGcpInsertWitnesses).toBe('function');
    await withInsertWitnesses(async (input) => {
      const bad = { ...input };
      if (changed === 'plan') bad.originalPlan = { ...input.originalPlan };
      if (changed === 'ui') bad.started = { ...input.started };
      if (changed === 'rpc') bad.rpc = { ...input.rpc };
      if (changed === 'window') bad.window = { ...input.window };
      if (changed === 'insert') bad.insert = { ...input.insert };
      await expect(inserts.collectOriginalGcpInsertWitnesses(bad)).rejects.toThrow();
    });
  });

for (const mode of ['late-start', 'early-complete'])
  test(`UI temporal ${mode} cannot contain the original insertion RPC`, async () => {
    expect(typeof inserts.collectOriginalGcpInsertWitnesses).toBe('function');
    await withInsertWitnesses(async (input) => {
      await expect(inserts.collectOriginalGcpInsertWitnesses(input)).rejects.toThrow('temporal');
    }, mode);
  });

test('changed original stdout bytes retire a collected insertion proof without accepting restoration', async () => {
  expect(typeof inserts.collectOriginalGcpInsertWitnesses).toBe('function');
  await withInsertWitnesses(async (input, _output, admission) => {
    const proof = await inserts.collectOriginalGcpInsertWitnesses(input);
    const { readFile, writeFile } = await import('node:fs/promises');
    const bytes = await readFile(admission.stdoutPath);
    await writeFile(admission.stdoutPath, 'changed original stdout');
    await expect(inserts.readOriginalGcpInsertWitnesses(proof)).rejects.toThrow();
    await writeFile(admission.stdoutPath, bytes);
    await expect(inserts.readOriginalGcpInsertWitnesses(proof)).rejects.toThrow('refused');
  });
});
