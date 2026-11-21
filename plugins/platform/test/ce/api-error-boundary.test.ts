import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeApiError } from '../../src/ce/runtime';

test('recognizes genuine API errors from separately bundled runtime modules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ce-error-boundary-'));
  try {
    const result = await Bun.build({
      entrypoints: [new URL('../../src/ce/runtime.ts', import.meta.url).pathname],
      outdir: directory,
      target: 'bun',
    });
    expect(result.success).toBe(true);
    const separate = await import(join(directory, 'runtime.js'));
    expect(separate.CeApiError).not.toBe(CeApiError);
    const error = new separate.CeApiError('not-found', 404);
    expect(error instanceof CeApiError).toBe(true);
    expect(new CeApiError('authorization', 403) instanceof separate.CeApiError).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects ordinary lookalike errors, plain objects and malformed branded errors', () => {
  expect(Object.assign(new Error('not found'), { category: 'not-found', status: 404 }) instanceof CeApiError).toBe(
    false,
  );
  expect({ category: 'not-found', status: 404 } instanceof CeApiError).toBe(false);
  const error = new CeApiError('not-found', 404);
  Object.assign(error, { status: 0 });
  expect(error instanceof CeApiError).toBe(false);
  expect(new CeApiError('transient', 503) instanceof CeApiError).toBe(true);
});
