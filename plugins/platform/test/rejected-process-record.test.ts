import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as records from '../src/ce/linux-process-group';

const rejected = records.readRejectedLinuxProcessGroupRecord;
function evidence(error: unknown) {
  const proof = rejected(error);
  if (!proof) throw new Error('Native rejected record evidence missing');
  return proof;
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function failure(text: string, initialEmpty = false): Promise<unknown> {
  let calls = 0;
  try {
    await records.readLinuxProcessGroupRecord(123, async () => (++calls === 1 && initialEmpty ? '' : text));
  } catch (error) {
    return error;
  }
  throw new Error('Malformed fixture was accepted');
}
test('retains exact rejected decoded record privately without leaking it through Error serialization', async () => {
  const text = '123 (private fixture secret) Q 1 7';
  const error = await failure(text);
  const proof = evidence(error);
  expect(proof.kind).toBe('rejected-decoded-linux-process-record');
  expect(proof.pid).toBe(123);
  expect(proof.bytes).toBe(Buffer.byteLength(text));
  expect(proof.sha256).toBe(hash(text));
  expect(Buffer.from(proof.recordUtf8Base64, 'base64').toString()).toBe(text);
  expect(proof.truncated).toBe(false);
  expect(String(error)).not.toContain('private fixture secret');
  expect(JSON.stringify(error)).not.toContain('private fixture secret');
  expect(Object.keys(error as object)).toEqual([]);
});
test('source evidence cannot be forged through an error copy or payload', async () => {
  const error = await failure('123 () S 1');
  const proof = evidence(error);
  for (const value of [
    { ...(error as object) },
    Object.assign(new Error(String(error)), { proof }),
    proof,
    null,
    'error',
  ])
    expect(rejected(value)).toBeUndefined();
  expect(rejected(error)).toBe(proof);
});
test('retained evidence and validation are immutable', async () => {
  const proof = evidence(await failure('123 () S 1'));
  expect(Object.isFrozen(proof)).toBe(true);
  expect(Object.isFrozen(proof.validation)).toBe(true);
  expect(Reflect.set(proof, 'pid', 999)).toBe(false);
  expect(Reflect.set(proof.validation, 'headerMatches', false)).toBe(false);
});
test('oversized rejected content retains a bounded prefix and full digest with explicit truncation', async () => {
  const text = `123 (private ${'z'.repeat(40000)}) Q 1 7`;
  const proof = evidence(await failure(text));
  expect(proof.bytes).toBe(Buffer.byteLength(text));
  expect(proof.sha256).toBe(hash(text));
  expect(proof.truncated).toBe(true);
  expect(Buffer.from(proof.recordUtf8Base64, 'base64').length).toBe(16384);
});
test('records structural reasons without exposing the process name', async () => {
  const proof = evidence(await failure('123 (private fixture secret) Q 1 7'));
  expect(proof.validation.headerMatches).toBe(true);
  expect(proof.validation.delimiterValid).toBe(true);
  expect(proof.validation.stateValid).toBe(false);
  expect(proof.validation.startValid).toBe(false);
  expect(proof.validation.groupNumeric).toBe(true);
  expect(proof.validation.groupSafe).toBe(true);
  expect(JSON.stringify(proof.validation)).not.toContain('private fixture secret');
});
test('retains the original empty-read boundary when the second record is rejected', async () => {
  const proof = evidence(await failure('123 () S 1', true));
  expect(proof.initialEmptyRead).toBe(true);
  expect(proof.sha256).toBe(hash('123 () S 1'));
});
test('does not manufacture rejected-record evidence for syscall failures', async () => {
  const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
  await expect(
    records.readLinuxProcessGroupRecord(123, async () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(rejected(error)).toBeUndefined();
});
test('valid original records keep their unchanged result without rejection evidence', async () => {
  const text = `123 (fixture) S 1 321 ${Array(16).fill('0').join(' ')} 456 0\n`;
  expect(await records.readLinuxProcessGroupRecord(123, async () => text)).toBe(321);
  expect(rejected(new Error('unrelated'))).toBeUndefined();
});
