/** Actual Python guest schema: shape validation never mints source authority. */
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

function schema(value: unknown) {
  const python = process.env.CE_TEST_PYTHON;
  if (!python) throw new Error('Original Python fixture required');
  const program =
    'import json,sys\nsys.path.insert(0,sys.argv[1])\nfrom scripts.guest_entrypoint import validate_guest_request_schema\nprint(json.dumps(validate_guest_request_schema(json.loads(sys.stdin.read()))))\n';
  return Bun.spawnSync([python, '-I', '-B', '-c', program, resolve(import.meta.dir, '..')], {
    stdin: Buffer.from(JSON.stringify(value)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
}
const request = () => ({
  schemaVersion: 2,
  kind: 'original-gcp-final-guest-worker',
  nonce: 'a'.repeat(64),
  inputs: {},
  binding: {},
  originalStartMs: 1000,
  originalDeadlineMs: 7201000,
  deadlines: [7501000, 7501000],
  startupDeadlineMs: 7216000,
  ports: {},
  finalCapture: {},
});
test('actual final entry requires explicit final schema while original schema remains unchanged', () => {
  const final = schema(request());
  expect(final.exitCode).toBe(0);
  expect(final.stdout.toString().trim()).toBe('true');
  const old = { ...request(), schemaVersion: 1, kind: 'original-gcp-guest-worker' };
  delete (old as Partial<typeof old>).originalDeadlineMs;
  delete (old as Partial<typeof old>).finalCapture;
  const original = schema(old);
  expect(original.exitCode).toBe(0);
  expect(original.stdout.toString().trim()).toBe('false');
});
test('mixed copied or incomplete mode fields cannot choose a final entry', () => {
  for (const value of [
    { ...request(), schemaVersion: 1 },
    { ...request(), kind: 'original-gcp-guest-worker' },
    { ...request(), kind: 'unknown' },
    { ...request(), extra: true },
  ])
    expect(schema(value).exitCode).not.toBe(0);
});
