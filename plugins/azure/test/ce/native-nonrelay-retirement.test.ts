import { expect, test } from 'bun:test';
import { readdir, rm } from 'node:fs/promises';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { savePlanArtifact } from '../../src/ce/artifacts';
import { executeAzureCeNativeApply } from '../../src/tools/azure-ce-apply';
import { nativeRetirementFixture } from './native-retirement-fixture';

for (const ha of [false, true])
  test(`standard native ${ha ? 'HA' : 'single'} retires actual enrollment and resumes without mutations`, async () => {
    const f = await nativeRetirementFixture(ha);
    try {
      expect(await f.run()).toMatchObject({
        status: 'retired',
        completeCleanup: true,
        bootstrap: { status: 'native-bootstrap-retired' },
        parent: { status: 'native-deployment-artifacts-retired' },
      });
      expect(f.order).toEqual(['platform', 'cloud', ...f.tokens.map(() => 'token'), 'site']);
      const names = await readdir(f.storage.directory);
      expect(
        names.some(
          (name) =>
            name.startsWith('native-source-') ||
            name.startsWith('native-admission-') ||
            f.tokens.some((token) => name === `${token.name}.json`),
        ),
      ).toBe(false);
      expect(names.includes('azure-native-relay-key-retirement.json')).toBe(false);
      expect(f.reads.some((args) => args[0] === 'resource' && args[1] === 'list' && !args.includes('--query'))).toBe(
        true,
      );
      const before = [...f.order];
      expect(await f.run()).toMatchObject({ completeCleanup: true });
      expect(f.order).toEqual(before);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

for (const fault of [
  'stale',
  'foreign',
  'unknown',
  'residual',
  'regional-owner',
  'partial',
  'duplicate',
  'malformed',
  'failed',
  'token',
  'source',
  'orphan-relay',
] as const)
  test(`standard native retirement preserves private staging for ${fault}`, async () => {
    const f = await nativeRetirementFixture();
    try {
      if (fault === 'stale') f.state.stale = true;
      if (fault === 'foreign') f.state.foreign = true;
      if (fault === 'unknown') f.state.platform = 'unknown';
      const id = `/subscriptions/${f.source.subscription.id}/resourceGroups/other/providers/Microsoft.Compute/virtualMachines/other`;
      if (fault === 'residual') {
        const resource = f.source.ownershipInventory.find((row) => row.action === 'create');
        if (!resource) throw Error('Native fixture has no original creation resource');
        f.state.inventory = [{ id: resource.resourceId }];
      }
      if (fault === 'regional-owner')
        f.state.inventory = [{ id, tags: { 'xcsh-deployment-id': f.source.deploymentName } }];
      if (fault === 'partial') f.state.inventory = [{ id, nextLink: 'next' }];
      if (fault === 'duplicate') f.state.inventory = [{ id }, { id }];
      if (fault === 'malformed') f.state.malformed = true;
      if (fault === 'failed') f.state.failed = true;
      if (fault === 'token')
        await f.storage.write(`${f.tokens[0].name}.json`, {
          tokenName: f.tokens[0].name,
          node: f.tokens[0].node,
          siteName: 'foreign',
          jwt: 'synthetic.payload.signature',
        });
      if (fault === 'source') await f.storage.remove(`native-source-${f.source.planSha256}.json`);
      if (fault === 'orphan-relay') await f.storage.write('relay-native-execution.json', { foreign: true });
      await expect(f.run()).rejects.toThrow();
      expect(await f.storage.read(`native-admission-${f.source.planSha256}.json`)).toBeDefined();
      expect(await f.storage.read(`${f.tokens[0].name}.json`)).toBeDefined();
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

for (const stage of ['bootstrap', 'parent'] as const)
  test(`standard native ${stage} deletion resumes from exact hashed inventory`, async () => {
    const f = await nativeRetirementFixture();
    try {
      const controller = new AbortController();
      const absence = f.runtime.unregisteredAbsence.bind(f.runtime);
      let interrupted = false;
      const target = stage === 'bootstrap' ? `${f.tokens[0].name}.json` : `native-source-${f.source.planSha256}.json`;
      f.runtime.unregisteredAbsence = async (...args) => {
        const names = await readdir(f.storage.directory);
        if (!interrupted && !names.includes(target)) {
          interrupted = true;
          controller.abort(new Error('simulated interruption after exact file removal'));
        }
        return absence(...args);
      };
      await expect(f.run(controller.signal)).rejects.toThrow('simulated interruption');
      expect(interrupted).toBe(true);
      const before = [...f.order];
      f.runtime.unregisteredAbsence = absence;
      expect(await f.run()).toMatchObject({ completeCleanup: true });
      expect(f.order).toEqual(before);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

test('standard native public apply rejects a retired deployment before discovery or enrollment', async () => {
  const f = await nativeRetirementFixture();
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  try {
    await f.run();
    const session = {
      getSessionId: () => f.root,
      getArtifactsDir: () => f.root,
      async saveArtifact(content: string, type: string) {
        await Bun.write(`${f.root}/000001.${type}.log`, content);
        return '000001';
      },
      async getArtifactPath() {
        return null;
      },
    };
    const { observation } = await import('./fixtures');
    await savePlanArtifact(session, f.source, observation);
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    let reads = 0;
    await expect(
      executeAzureCeNativeApply(
        { planId: f.source.planId, planSha256: f.source.planSha256 },
        {
          cwd: f.root,
          hasUI: false,
          ui: {
            async confirm() {
              return false;
            },
          },
          sessionManager: session,
        },
        f.api,
        async () =>
          ({
            async storage() {
              return f.storage;
            },
          }) as unknown as CePlatformService,
        undefined,
        {
          async observe() {
            reads++;
            return observation;
          },
        },
      ),
    ).rejects.toThrow('retiring or retired');
    expect(reads).toBe(0);
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await rm(f.root, { recursive: true, force: true });
  }
});

test('standard native teardown requires the independent cloud reader before any mutation', async () => {
  const f = await nativeRetirementFixture();
  try {
    const { runAzureNativeTeardown } = await import('../../src/ce/native-teardown');
    await expect(
      runAzureNativeTeardown(
        f.source,
        f.cloud,
        f.teardown,
        f.teardown.planSha256,
        f.runtime,
        f.contract,
        f.storage,
        async () => {
          f.order.push('cloud');
          return { status: 'retired', absence: 'absent' };
        },
      ),
    ).rejects.toThrow('independent cloud absence');
    expect(f.order).toEqual([]);
    expect(await f.storage.read(`${f.tokens[0].name}.json`)).toBeDefined();
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('standard native absence does not fabricate a relay plan identity', async () => {
  const f = await nativeRetirementFixture();
  try {
    const { observeAzureCeRetirementAbsence, observeAzureRelayRetirementAbsence } = await import(
      '../../src/ce/relay-retirement'
    );
    const receipt = await observeAzureCeRetirementAbsence(f.source, f.api);
    expect(receipt).toMatchObject({ status: 'absent', sourcePlanSha256: f.source.planSha256, inventoryCount: 0 });
    expect('relayPlanSha256' in receipt).toBe(false);
    await expect(observeAzureRelayRetirementAbsence(f.source, f.api)).rejects.toThrow();
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
