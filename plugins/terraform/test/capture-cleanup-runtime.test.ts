import { expect, test } from 'bun:test';

test('normal generated runtimes expose the qualified read-only cleanup inspection components', async () => {
  const terraform = await import(new URL('../runtime/index.js', import.meta.url).href);
  const gcloud = await import(new URL('../../gcloud/runtime/index.js', import.meta.url).href);
  expect(typeof terraform.readCaptureCleanupAttemptResourceFields).toBe('function');
  expect(typeof gcloud.readGcpCaptureCleanupStateCandidate).toBe('function');
});
