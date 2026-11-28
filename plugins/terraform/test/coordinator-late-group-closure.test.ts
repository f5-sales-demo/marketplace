/** Real original output and controller issuers; companion stage is an offline worker. */
import { expect, test } from 'bun:test';
import { acknowledgeOriginalApplyGroupClosure } from '../src/installed-apply-controller';
import { createInstalledCaptureCoordinator } from '../src/installed-capture-coordinator';
import { withGroupClosure } from './fixtures/apply-group-closure.fixture';

test('coordinator closes from later original output proof without rewriting failed initial group snapshot', async () => {
  let closed = 0;
  await withGroupClosure(
    async ({ final, completion, finished }) => {
      expect(finished.originalGroupClosed).toBe(false);
      await acknowledgeOriginalApplyGroupClosure(final, completion);
      expect(finished.originalGroupClosed).toBe(false);
    },
    false,
    undefined,
    (context, original) =>
      createInstalledCaptureCoordinator(context, {
        stages: async () => [
          { name: 'trace', worker: original },
          {
            name: 'companion',
            worker: {
              start: async () => {},
              assertOriginal: async () => {},
              finalCapture: async () => {},
              closeAfterExecutorExit: async () => {
                closed++;
              },
            },
            closeAfter: ['trace'],
          },
        ],
        persist: async () => {},
      }),
  );
  expect(closed).toBe(1);
}, 60000);

test('unacknowledged original completion cannot authorize companion closure', async () => {
  let closed = 0;
  await expect(
    withGroupClosure(
      async ({ completion, finished }) => {
        expect(completion.originalGroupClosed).toBe(true);
        expect(finished.originalGroupClosed).toBe(false);
      },
      false,
      undefined,
      (context, original) =>
        createInstalledCaptureCoordinator(context, {
          stages: async () => [
            {
              name: 'trace',
              worker: {
                ...original,
                closeAfterExecutorExit: async () => {
                  closed++;
                },
              },
            },
          ],
          persist: async () => {},
        }),
    ),
  ).rejects.toThrow(/closure required/);
  expect(closed).toBe(0);
}, 60000);
