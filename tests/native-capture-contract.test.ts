import { expect, test } from 'bun:test';
import capture from '../scripts/capture-salesforce-native';

test('native capture requires an explicit MacBook target and private paths', async () => {
  const oldRoot = process.env.PRESENTATION_CAPTURE_ROOT;
  const oldPlugin = process.env.PRESENTATION_CAPTURE_PLUGIN;
  delete process.env.PRESENTATION_CAPTURE_ROOT;
  delete process.env.PRESENTATION_CAPTURE_PLUGIN;
  try {
    await expect(capture({})).rejects.toThrow('authorized MacBook');
  } finally {
    if (oldRoot !== undefined) process.env.PRESENTATION_CAPTURE_ROOT = oldRoot;
    if (oldPlugin !== undefined) process.env.PRESENTATION_CAPTURE_PLUGIN = oldPlugin;
  }
});

test('native capture refuses a runtime without the actual renderer capability', async () => {
  if (process.platform !== 'darwin') return;
  const oldRoot = process.env.PRESENTATION_CAPTURE_ROOT;
  const oldPlugin = process.env.PRESENTATION_CAPTURE_PLUGIN;
  process.env.PRESENTATION_CAPTURE_ROOT = '/synthetic/private';
  process.env.PRESENTATION_CAPTURE_PLUGIN = '/synthetic/installed';
  try {
    await expect(capture({ pi: {} })).rejects.toThrow('required native capture capabilities');
  } finally {
    if (oldRoot === undefined) delete process.env.PRESENTATION_CAPTURE_ROOT;
    else process.env.PRESENTATION_CAPTURE_ROOT = oldRoot;
    if (oldPlugin === undefined) delete process.env.PRESENTATION_CAPTURE_PLUGIN;
    else process.env.PRESENTATION_CAPTURE_PLUGIN = oldPlugin;
  }
});

// Lifecycle control regressions use pure utilities without a Mac service probe.
import './capture-salesforce-lifecycle.test';
