import { expect, test } from 'bun:test';
import { join } from 'node:path';

test('compiled Terraform plugin exports original insertion evidence consumers', async () => {
  const runtime = await import(join(import.meta.dir, '../runtime/index.js'));
  for (const name of [
    'GoogleHttpRpcTraceParser',
    'readOriginalGoogleHttpRpcSource',
    'collectOriginalGcpInsertWitnesses',
    'readOriginalGcpInsertWitnesses',
  ])
    expect(typeof runtime[name]).toBe('function');
});

test('compiled insertion consumers reject serialized caller-created capabilities', async () => {
  const runtime = await import(join(import.meta.dir, '../runtime/index.js'));
  await expect(runtime.readOriginalGoogleHttpRpcSource({})).rejects.toThrow('Original');
  await expect(runtime.readOriginalGcpInsertWitnesses({})).rejects.toThrow('Original');
  await expect(runtime.collectOriginalGcpInsertWitnesses({ binding: {}, originalPlan: {} })).rejects.toThrow();
});
