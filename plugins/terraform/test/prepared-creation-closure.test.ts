import { expect, test } from 'bun:test';
import { GCP_XCSH15178_OBSERVER_ARTIFACTS } from '../../gcloud/src/ce/terraform-public-artifacts';
import {
  assertPreparedCreationScope,
  assertPreparedCreationScopeClosureInputs,
  prepareOriginalCreationScope,
} from '../src/prepared-creation-scope';
import { fixture } from './original-gcp-inventory-fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

test('prepared creation closure keeps original files verifiable after actual runner retirement without restoring authorization', async () => {
  let packet: Awaited<ReturnType<typeof prepareOriginalCreationScope>> | undefined;
  let store: Parameters<Parameters<typeof fixture>[0]>[1] | undefined;
  await fixture(
    async (context, originalStore) => {
      store = originalStore;
      packet = await prepareOriginalCreationScope(context);
    },
    '',
    true,
    () => false,
    undefined,
    undefined,
    GCP_XCSH15178_OBSERVER_ARTIFACTS.providerLock,
    true,
    7200000,
    async () => {
      if (!packet || !store) throw new Error('Original prepared closure inputs required');
      let outcome: 'success' | 'failure' = 'failure';
      try {
        await expect(assertPreparedCreationScopeClosureInputs({ ...packet })).rejects.toThrow('Trusted');
        await assertPreparedCreationScopeClosureInputs(packet);
        await expect(assertPreparedCreationScope(packet)).rejects.toThrow('Trusted');
        await assertPreparedCreationScopeClosureInputs(packet);
        outcome = 'success';
      } finally {
        await retainOwnedTestCapture(store.directory, 'prepared-original-scope-retired-closure', outcome);
      }
    },
  );
});

test('prepared closure revokes consumption before awaiting original input verification', async () => {
  const { createInstalledCaptureContext } = await import('../src/installed-capture-context');
  const { consumePreparedCreationScope } = await import('../src/prepared-creation-scope');
  await fixture(
    async (original, store, invocation) => {
      let block = false;
      let reached: () => void = () => {};
      let release: () => void = () => {};
      const entered = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const context = createInstalledCaptureContext({
        ...original,
        assertInputs: async () => {
          if (block) {
            reached();
            await gate;
          }
          await original.assertInputs();
        },
      });
      const packet = await prepareOriginalCreationScope(context);
      block = true;
      const closing = assertPreparedCreationScopeClosureInputs(packet);
      await entered;
      try {
        expect(() => consumePreparedCreationScope(packet, invocation, context.environment)).toThrow('Trusted');
        await expect(assertPreparedCreationScope(packet)).rejects.toThrow('Trusted');
      } finally {
        block = false;
        release();
        await closing;
      }
      await expect(prepareOriginalCreationScope(context)).rejects.toThrow('Trusted');
      await assertPreparedCreationScopeClosureInputs(packet);
      await retainOwnedTestCapture(store.directory, 'prepared-original-revocation-before-await', 'success');
    },
    '',
    true,
    () => false,
    undefined,
    undefined,
    GCP_XCSH15178_OBSERVER_ARTIFACTS.providerLock,
    true,
  );
});

for (const target of ['saved-plan', 'scope-file'] as const)
  test(`prepared closure preserves permanent refusal after original ${target} bytes are restored`, async () => {
    const { chmod, readFile, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { inspectPreparedCreationScope } = await import('../src/prepared-creation-scope');
    const running = fixture(
      async (context, store) => {
        const packet = await prepareOriginalCreationScope(context);
        const declared = await inspectPreparedCreationScope(packet);
        const path = target === 'scope-file' ? declared.scopeFile : join(context.executionDirectory, 'saved.tfplan');
        if (!path) throw new Error('Original source file required');
        const originalBytes = await readFile(path);
        await chmod(path, 0o600);
        await writeFile(path, 'foreign scope closure bytes');
        await expect(assertPreparedCreationScopeClosureInputs(packet)).rejects.toThrow('Trusted');
        await writeFile(path, originalBytes);
        if (target === 'scope-file') await chmod(path, 0o400);
        await expect(assertPreparedCreationScopeClosureInputs(packet)).rejects.toThrow('Trusted');
        await expect(assertPreparedCreationScope(packet)).rejects.toThrow('Trusted');
        await retainOwnedTestCapture(store.directory, `prepared-original-restored-${target}-refusal`, 'success');
      },
      '',
      true,
      () => false,
      undefined,
      undefined,
      GCP_XCSH15178_OBSERVER_ARTIFACTS.providerLock,
      true,
    );
    if (target === 'saved-plan') {
      const { OriginalInputMonitorError } = await import('../src/original-input-monitor');
      await expect(running).rejects.toBeInstanceOf(OriginalInputMonitorError);
    } else await running;
  });

test('a consumed original scope remains verifiable only for closure and cannot authorize another actor', async () => {
  const { consumePreparedCreationScope } = await import('../src/prepared-creation-scope');
  await fixture(
    async (context, store, invocation) => {
      const packet = await prepareOriginalCreationScope(context);
      expect(typeof consumePreparedCreationScope(packet, invocation, context.environment)).toBe('string');
      await assertPreparedCreationScopeClosureInputs(packet);
      expect(() => consumePreparedCreationScope(packet, invocation, context.environment)).toThrow('Trusted');
      await expect(assertPreparedCreationScope(packet)).rejects.toThrow('Trusted');
      await assertPreparedCreationScopeClosureInputs(packet);
      await retainOwnedTestCapture(store.directory, 'prepared-original-consumed-closure-no-replay', 'success');
    },
    '',
    true,
    () => false,
    undefined,
    undefined,
    GCP_XCSH15178_OBSERVER_ARTIFACTS.providerLock,
    true,
  );
});
