import { expect, test } from 'bun:test';
import { createInstalledCaptureContext } from '../src/installed-capture-context';

function admission() {
  const file = {
    dev: '1',
    ino: '9007199254740993',
    uid: '1000',
    nlink: '1',
    mode: '33024',
    size: '64',
    mtimeNs: '1',
    ctimeNs: '1',
  };
  const parent = { dev: '1', ino: '9007199254740994', uid: '1000', mode: '16832' };
  return {
    owner: {
      provider: 'gcp' as const,
      engine: 'terraform' as const,
      account: 'example-project',
      region: 'us-central1',
      deploymentId: 'ce-fixture',
    },
    executionDirectory: '/example/ce-fixture',
    budget: { start: 1000, deadline: 7201000 },
    environment: {
      GOOGLE_APPLICATION_CREDENTIALS: '/example/adc.private.json',
      XCSH_API_URL: 'https://example.test',
      XCSH_API_TOKEN: 'EXAMPLE_API_TOKEN',
    },
    inputs: {
      adc: {
        path: '/example/adc.private.json',
        sha256: 'a'.repeat(64),
        expectedIdentity: { ...file },
        expectedParentIdentity: { ...parent },
      },
      platform: {
        path: '/example/platform.private.json',
        sha256: 'b'.repeat(64),
        expectedIdentity: { ...file, ino: '2' },
        expectedParentIdentity: { ...parent },
      },
    },
    assertInputs: async () => {},
    assertWithinDeadline: async () => {},
    readProviderInputs: async () => ({}),
  };
}
test('capture context preserves admitted decimal identities and freezes independent credential and owner snapshots', () => {
  const original = admission();
  const context = createInstalledCaptureContext(original);
  original.inputs.adc.expectedIdentity.ino = '999';
  original.inputs.adc.expectedParentIdentity.ino = '998';
  original.environment.GOOGLE_APPLICATION_CREDENTIALS = '/example/replacement.json';
  original.owner.account = 'example-foreign-project';
  expect(context.inputs.adc.expectedIdentity?.ino).toBe('9007199254740993');
  expect(context.inputs.adc.expectedParentIdentity?.ino).toBe('9007199254740994');
  expect(context.environment.GOOGLE_APPLICATION_CREDENTIALS).toBe('/example/adc.private.json');
  expect(context.owner.account).toBe('example-project');
  expect(Object.isFrozen(context.inputs.adc.expectedIdentity)).toBe(true);
  expect(Object.isFrozen(context.inputs.adc.expectedParentIdentity)).toBe(true);
  expect(Object.isFrozen(context.inputs)).toBe(true);
  expect(Object.isFrozen(context.environment)).toBe(true);
});
test('capture handoff refuses missing admitted identities, changed credential paths and wrong ownership without reading files', () => {
  for (const condition of ['file', 'parent', 'path', 'owner', 'budget'] as const) {
    const original = admission();
    if (condition === 'file') Object.assign(original.inputs.adc, { expectedIdentity: undefined });
    if (condition === 'parent') Object.assign(original.inputs.adc, { expectedParentIdentity: undefined });
    if (condition === 'path') original.environment.GOOGLE_APPLICATION_CREDENTIALS = '/example/other.json';
    if (condition === 'owner') Object.assign(original.owner, { engine: 'native' });
    if (condition === 'budget') original.budget.deadline++;
    expect(() => createInstalledCaptureContext(original)).toThrow();
  }
});
test('final input checks remain independent of the operation deadline and trusted callbacks cannot be replaced', async () => {
  const original = admission();
  let checked = 0;
  original.assertInputs = async () => {
    checked++;
  };
  original.assertWithinDeadline = async () => {
    throw new Error('original deadline exhausted');
  };
  const context = createInstalledCaptureContext(original);
  original.assertInputs = async () => {
    throw new Error('substituted guard');
  };
  await context.assertInputs();
  await expect(context.assertWithinDeadline()).rejects.toThrow('original deadline exhausted');
  await context.assertInputs();
  expect(checked).toBe(2);
});
test('serialized capture flags cannot substitute trusted original guards or provider inspection', () => {
  const original = admission();
  const serialized = JSON.parse(JSON.stringify(original));
  expect(() => createInstalledCaptureContext(serialized)).toThrow();
});
test('concurrent provider handoffs cannot silently accept different original identities', async () => {
  const original = admission();
  let reads = 0;
  original.readProviderInputs = async () => ({
    google: {
      ...original.inputs.adc,
      path: '/example/google-provider',
      expectedIdentity: {
        ...original.inputs.adc.expectedIdentity,
        ino: String(++reads),
      },
    },
  });
  let checks = 0;
  let release: (() => void) | undefined;
  const finalChecks = new Promise<void>((resolve) => {
    release = resolve;
  });
  original.assertInputs = async () => {
    if (++checks === 3) await finalChecks;
    else if (checks === 4) release?.();
  };
  const context = createInstalledCaptureContext(original);
  const results = await Promise.allSettled([context.readProviderInputs(), context.readProviderInputs()]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
});
