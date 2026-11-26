import { expect, test } from 'bun:test';
import * as controller from '../src/installed-apply-controller';
import { withGroupClosure } from './fixtures/apply-group-closure.fixture';

test('closure-only proof requires the actual acknowledged final callback and preserves the initial failure', async () => {
  expect(typeof controller.assertOriginalApplyGroupClosed).toBe('function');
  await withGroupClosure(async ({ before, final, completion, finished }) => {
    await expect(controller.assertOriginalApplyGroupClosed(final)).rejects.toThrow(/acknowledged/);
    await expect(controller.assertOriginalApplyGroupClosed(before)).rejects.toThrow(/final/);
    await expect(controller.assertOriginalApplyGroupClosed({ ...final })).rejects.toThrow(/Original/);
    await controller.acknowledgeOriginalApplyGroupClosure(final, completion);
    await controller.assertOriginalApplyGroupClosed(final);
    await controller.assertOriginalApplyGroupClosed(final);
    expect(finished.originalGroupClosed).toBe(false);
  });
}, 60000);

test('later original output completion closes the actual controller without rewriting its initial group snapshot', async () => {
  expect(typeof controller.acknowledgeOriginalApplyGroupClosure).toBe('function');
  const events = await withGroupClosure(async ({ final, completion, finished }) => {
    expect(finished.originalGroupClosed).toBe(false);
    expect(completion.originalGroupClosed).toBe(true);
    await controller.acknowledgeOriginalApplyGroupClosure(final, completion);
    expect(finished.originalGroupClosed).toBe(false);
    await controller.acknowledgeOriginalApplyGroupClosure(final, completion);
  });
  expect(events.filter((row) => row.phase === 'worker-closed')).toHaveLength(1);
}, 60000);

test('original group acknowledgement rejects copied callbacks, copied completions and the before callback', async () => {
  await withGroupClosure(async ({ before, final, completion }) => {
    await expect(controller.acknowledgeOriginalApplyGroupClosure({ ...final }, completion)).rejects.toThrow('Original');
    await expect(controller.acknowledgeOriginalApplyGroupClosure(final, { ...completion })).rejects.toThrow(
      /[Oo]riginal/,
    );
    await expect(controller.acknowledgeOriginalApplyGroupClosure(before, completion)).rejects.toThrow('final');
    await controller.acknowledgeOriginalApplyGroupClosure(final, completion);
  });
}, 60000);

test('unacknowledged later completion preserves the controller closure refusal', async () => {
  await expect(
    withGroupClosure(async ({ completion, finished }) => {
      expect(finished.originalGroupClosed).toBe(false);
      expect(completion.originalGroupClosed).toBe(true);
    }),
  ).rejects.toThrow('closure required');
}, 60000);

test('concurrent acknowledgements persist one original group-closure source', async () => {
  const events = await withGroupClosure(async ({ final, completion }) => {
    await Promise.all([
      controller.acknowledgeOriginalApplyGroupClosure(final, completion),
      controller.acknowledgeOriginalApplyGroupClosure(final, completion),
    ]);
  });
  expect(events.filter((row) => row.phase === 'group-closure-source')).toHaveLength(1);
}, 60000);

test('another actual output completion cannot close the original controller', async () => {
  await withGroupClosure(async ({ final, completion }) => {
    let foreign: unknown;
    await withGroupClosure(async (other) => {
      foreign = other.completion;
      await controller.acknowledgeOriginalApplyGroupClosure(other.final, other.completion);
    });
    await expect(controller.acknowledgeOriginalApplyGroupClosure(final, foreign)).rejects.toThrow(/[Oo]riginal/);
    await controller.acknowledgeOriginalApplyGroupClosure(final, completion);
  });
}, 60000);

test('failed durable group-closure acknowledgement remains single-use and cannot close the worker', async () => {
  await expect(
    withGroupClosure(async ({ final, completion, events }) => {
      await expect(controller.acknowledgeOriginalApplyGroupClosure(final, completion)).rejects.toThrow(
        'persistence failed',
      );
      await expect(controller.acknowledgeOriginalApplyGroupClosure(final, completion)).rejects.toThrow(
        'persistence failed',
      );
      expect(events.filter((row) => row.phase === 'group-closure-failed')).toHaveLength(1);
    }, true),
  ).rejects.toThrow('closure required');
}, 60000);

import { runIsolatedClockFixture } from './isolated-clock-fixture';

test('original group closure proof retains its actual final reserve expiry', async () => {
  expect((await runIsolatedClockFixture('group-closure-clock.fixture.ts')).exitCode).toBe(0);
}, 180000);

import { readFile, rename, rm, writeFile } from 'node:fs/promises';

test('completed output replacement cannot restore closure proof or allow staged close', async () => {
  let refusals = 0;
  await expect(
    withGroupClosure(async ({ final, completion }) => {
      await controller.acknowledgeOriginalApplyGroupClosure(final, completion);
      const path = final.execution.stdoutPath,
        original = await readFile(path);
      await rename(path, `${path}.original`);
      await writeFile(path, original, { flag: 'wx', mode: 0o600 });
      await expect(controller.assertOriginalApplyGroupClosed(final)).rejects.toThrow();
      refusals++;
      await rm(path);
      await rename(`${path}.original`, path);
      await expect(controller.assertOriginalApplyGroupClosed(final)).rejects.toThrow();
      refusals++;
    }),
  ).rejects.toThrow();
  expect(refusals).toBe(2);
}, 60000);

test('input mutation during durable group acknowledgement cannot close the controller after restoration', async () => {
  await expect(
    withGroupClosure(
      async ({ final, completion }) => {
        await expect(controller.acknowledgeOriginalApplyGroupClosure(final, completion)).rejects.toThrow();
        const path = final.original.inputs.adc.path;
        await rename(path, `${path}.foreign`);
        await rename(`${path}.original`, path);
        await expect(controller.acknowledgeOriginalApplyGroupClosure(final, completion)).rejects.toThrow();
      },
      false,
      async (path) => {
        await rename(path, `${path}.original`);
        await writeFile(path, 'synthetic-foreign-input', { flag: 'wx', mode: 0o400 });
      },
    ),
  ).rejects.toThrow();
}, 60000);
