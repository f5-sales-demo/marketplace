import { expect, test } from 'bun:test';
import { withTerraformSession } from '../src/session-lifetime';

test('session closure runs after successful operation before its result escapes', async () => {
  const events: string[] = [];
  const result = await withTerraformSession(
    {
      closeGoogleAdc: async () => {
        events.push('closed');
      },
    },
    async () => {
      events.push('operation');
      return 'complete';
    },
  );
  expect(result).toBe('complete');
  expect(events).toEqual(['operation', 'closed']);
});
test('original operation failure is preserved when closure succeeds', async () => {
  let closed = 0;
  const failure = new Error('original failure');
  const outcome = await withTerraformSession(
    {
      closeGoogleAdc: async () => {
        closed++;
      },
    },
    async () => {
      throw failure;
    },
  ).catch((error) => error);
  expect(outcome).toBe(failure);
  expect(closed).toBe(1);
});
test('closure failure refuses apparent success without replaying the operation', async () => {
  let calls = 0;
  const failure = new Error('original group unresolved');
  const outcome = await withTerraformSession(
    {
      closeGoogleAdc: async () => {
        throw failure;
      },
    },
    async () => {
      calls++;
      return 'applied';
    },
  ).catch((error) => error);
  expect(outcome).toBe(failure);
  expect(calls).toBe(1);
});
test('both operation and closure failures are retained together', async () => {
  const first = new Error('apply incomplete');
  const second = new Error('closure unresolved');
  const outcome = await withTerraformSession(
    {
      closeGoogleAdc: async () => {
        throw second;
      },
    },
    async () => {
      throw first;
    },
  ).catch((error) => error);
  expect(outcome).toBeInstanceOf(AggregateError);
  expect(outcome.errors).toEqual([first, second]);
});
test('legacy session preserves its operation without acquiring or inventing a close channel', async () => {
  let calls = 0;
  expect(
    await withTerraformSession({}, async () => {
      calls++;
      return 'legacy';
    }),
  ).toBe('legacy');
  expect(calls).toBe(1);
});
