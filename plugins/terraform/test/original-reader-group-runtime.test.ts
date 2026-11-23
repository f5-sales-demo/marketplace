import { expect, test } from 'bun:test';

test('normal generated Terraform runtime retains original reader closure and durable source-set helpers', async () => {
  const runtime = await import(new URL('../runtime/index.js', import.meta.url).href);
  for (const name of [
    'collectInstalledOriginalGuestReaderClosures',
    'collectInstalledOriginalXcshReaderClosures',
    'collectInstalledOriginalAccessReaderSource',
    'collectInstalledOriginalAccessReaderSources',
    'collectOriginalReaderGroupClosure',
    'assertOriginalReaderGroupClosure',
    'persistOriginalReaderGroupSet',
    'assertOriginalReaderGroupInputs',
  ])
    expect(typeof runtime[name]).toBe('function');
});
