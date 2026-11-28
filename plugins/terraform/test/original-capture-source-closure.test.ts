import { expect, test } from 'bun:test';
import { closeOriginalCaptureSources, closeOriginalGuestSources } from '../src/original-capture-source-closure';

test('original guest closure settles the round before closing both workers and its binding', async () => {
  const calls: string[] = [];
  let settle: () => void = () => {};
  const round = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const closure = closeOriginalGuestSources([
    {
      nodeName: 'node-a',
      round,
      finalWorker: {
        dispose: async () => {
          calls.push('final');
        },
      },
      worker: {
        dispose: async () => {
          calls.push('before');
        },
      },
      binding: {
        close: () => {
          calls.push('binding');
        },
      },
    },
  ]);
  await Bun.sleep(10);
  expect(calls).toEqual([]);
  settle();
  await closure;
  expect(calls).toEqual(['final', 'before', 'binding']);
});

test('a rejected original round retains its failure while retiring workers and later nodes', async () => {
  const roundFailure = new Error('original round failed');
  const calls: string[] = [];
  const round = Promise.reject(roundFailure);
  void round.catch(() => undefined);
  let failure: unknown;
  try {
    await closeOriginalGuestSources([
      {
        nodeName: 'node-a',
        round,
        finalWorker: {
          dispose: async () => {
            calls.push('a-final');
          },
        },
        worker: {
          dispose: async () => {
            calls.push('a-before');
          },
        },
        binding: {
          close: () => {
            calls.push('a-binding');
          },
        },
      },
      {
        nodeName: 'node-b',
        worker: {
          dispose: async () => {
            calls.push('b-before');
          },
        },
        binding: {
          close: () => {
            calls.push('b-binding');
          },
        },
      },
    ]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  const nodeFailure = (failure as AggregateError).errors[0] as AggregateError;
  expect(nodeFailure.errors).toContain(roundFailure);
  expect(calls).toEqual(['a-final', 'a-before', 'a-binding', 'b-before', 'b-binding']);
});

for (const failedWorker of ['final', 'before', 'both'] as const)
  test(`unresolved ${failedWorker} worker preserves its binding and still closes independent sources`, async () => {
    const finalFailure = new Error('original final group unresolved');
    const beforeFailure = new Error('original before group unresolved');
    const calls: string[] = [];
    let failure: unknown;
    try {
      await closeOriginalGuestSources([
        {
          nodeName: 'node-a',
          finalWorker: {
            dispose: async () => {
              calls.push('a-final');
              if (failedWorker !== 'before') throw finalFailure;
            },
          },
          worker: {
            dispose: async () => {
              calls.push('a-before');
              if (failedWorker !== 'final') throw beforeFailure;
            },
          },
          binding: {
            close: () => {
              calls.push('a-binding');
            },
          },
        },
        {
          nodeName: 'node-b',
          worker: {
            dispose: async () => {
              calls.push('b-before');
            },
          },
          binding: {
            close: () => {
              calls.push('b-binding');
            },
          },
        },
      ]);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    const nodeFailure = (failure as AggregateError).errors[0] as AggregateError;
    const workers = nodeFailure.errors[0] as AggregateError;
    expect(workers.errors).toEqual(
      failedWorker === 'both'
        ? [finalFailure, beforeFailure]
        : [failedWorker === 'final' ? finalFailure : beforeFailure],
    );
    expect(calls).toEqual(['a-final', 'a-before', 'b-before', 'b-binding']);
  });

test('original source retirement catches synchronous and asynchronous failures without declaring closure', async () => {
  const sync = new Error('original synchronous source failure');
  const asyncFailure = new Error('original asynchronous source failure');
  const calls: string[] = [];
  let failure: unknown;
  try {
    await closeOriginalCaptureSources([
      {
        name: 'final-cloud',
        close: () => {
          calls.push('final');
          throw sync;
        },
      },
      {
        name: 'before-cloud',
        close: async () => {
          calls.push('before');
          throw asyncFailure;
        },
      },
      {
        name: 'remaining',
        close: () => {
          calls.push('remaining');
        },
      },
    ]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([sync, asyncFailure]);
  expect((failure as Error).message).toContain('final-cloud');
  expect((failure as Error).message).toContain('before-cloud');
  expect(calls).toEqual(['final', 'before', 'remaining']);
});

test('binding retirement failure cannot skip a later original node', async () => {
  const bindingFailure = new Error('original binding retirement failed');
  const calls: string[] = [];
  await expect(
    closeOriginalGuestSources([
      {
        nodeName: 'node-a',
        binding: {
          close: () => {
            calls.push('a');
            throw bindingFailure;
          },
        },
      },
      {
        nodeName: 'node-b',
        binding: {
          close: () => {
            calls.push('b');
          },
        },
      },
    ]),
  ).rejects.toThrow('incomplete');
  expect(calls).toEqual(['a', 'b']);
});

test('zero admitted original guest sources retire without execution claims', async () => {
  expect(await closeOriginalGuestSources([])).toBeUndefined();
  expect(await closeOriginalGuestSources([{ nodeName: 'node-a' }])).toBeUndefined();
});
