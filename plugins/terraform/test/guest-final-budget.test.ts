/** Original Python final budget source: validation only, no guest/source authority. */
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

const request = () => ({
  originalStartMs: 1000,
  originalDeadlineMs: 7201000,
  deadlines: [7501000, 7501000],
  startupDeadlineMs: 7216000,
  finalCapture: {
    callbackNonce: '11111111-2222-3333-4444-555555555555',
    parentIdentity: { pid: 1234, group: 1234, start: '98765', boot: '11111111-2222-3333-4444-555555555555' },
    finalStartedMs: 7201000,
    finalDeadlineMs: 7501000,
  },
});
function validate(value: unknown, now = 7201001) {
  const python = process.env.CE_TEST_PYTHON;
  if (!python) throw new Error('Original Python fixture required');
  const program =
    "import json,sys\nsys.path.insert(0,sys.argv[1])\nfrom scripts.guest_final_budget import validate_final_guest_budget\nv=json.loads(sys.stdin.read())\nprint(json.dumps(validate_final_guest_budget(v['request'],v['now'])))\n";
  return Bun.spawnSync([python, '-I', '-B', '-c', program, resolve(import.meta.dir, '..')], {
    stdin: Buffer.from(JSON.stringify({ request: value, now })),
    stdout: 'pipe',
    stderr: 'pipe',
  });
}
test('actual final budget source allows original operation expiry without renewing it', () => {
  const value = request(),
    result = validate(value);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual([7501000, 7501000, 7216000]);
  expect(value.originalDeadlineMs).toBe(7201000);
});
test('actual final source rejects enlarged windows, altered actor and expired final time', () => {
  for (const value of [
    { ...request(), originalDeadlineMs: 7201001 },
    { ...request(), deadlines: [7501000, 7801000] },
    { ...request(), startupDeadlineMs: 7216002 },
    { ...request(), finalCapture: { ...request().finalCapture, callbackNonce: '-'.repeat(36) } },
    {
      ...request(),
      finalCapture: {
        ...request().finalCapture,
        parentIdentity: { ...request().finalCapture.parentIdentity, group: 2222 },
      },
    },
  ])
    expect(validate(value).exitCode).not.toBe(0);
  expect(validate(request(), 7501000).exitCode).not.toBe(0);
});
