import { expect, test } from 'bun:test';
import { captureCeReplacementVersions, verifyCeReplacementVersions } from '../../src/ce/replacement-versions';
import type { VerifiedUpgradeContract } from '../../src/ce/upgrade-contract';
import { versionFixture } from './version-fixtures';

function fixture() {
  const { expected, observation } = versionFixture();
  observation.software.installed = observation.targetSoftware = observation.progress.version = 'crt-20260201-0179';
  observation.os.installed = '9.2026.17';
  const contract = { fingerprint: expected.contractFingerprint } as VerifiedUpgradeContract;
  const runtime = {
    async observeUpgrade(_binding: unknown, _contract: unknown, target?: string) {
      expect(target).toBeUndefined();
      return observation;
    },
  };
  const capture = () =>
    captureCeReplacementVersions(
      expected.binding,
      expected.siteUid,
      expected.siteContractFingerprint,
      runtime,
      contract,
    );
  return { expected, observation, contract, runtime, capture };
}

test('captures upgraded versions separately from create settings for both engines, clouds and site sizes', async () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const provider of ['aws', 'azure'] as const)
      for (const size of [1, 3]) {
        const f = fixture();
        f.expected.binding.owner.engine = f.observation.owner.engine = engine;
        f.expected.binding.owner.provider = f.observation.owner.provider = provider;
        f.expected.binding.nodes = f.observation.nodes = Array.from({ length: size }, (_, i) => `node-${i}`);
        const original = structuredClone(f.expected.binding);
        const snapshot = await f.capture();
        expect(snapshot.versions).toEqual({ software: 'crt-20260201-0179', os: '9.2026.17' });
        expect(snapshot.identity.binding).toEqual(original);
        expect(f.expected.binding).toEqual(original);
        await verifyCeReplacementVersions(snapshot, f.runtime, f.contract);
      }
});

test('capture rejects a replaced logical site, changed contract and incomplete runtime evidence', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.observation.siteUid = 'other';
    },
    (f: ReturnType<typeof fixture>) => {
      f.observation.siteContractFingerprint = `sha256:${'c'.repeat(64)}`;
    },
    (f: ReturnType<typeof fixture>) => {
      f.observation.status = 'unknown';
    },
    (f: ReturnType<typeof fixture>) => {
      f.observation.os.phase = 'UPGRADE_IN_PROGRESS';
    },
  ]) {
    const f = fixture();
    mutate(f);
    await expect(f.capture()).rejects.toThrow('Replacement');
  }
});

test('fresh verification refuses version or identity drift after planning', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.observation.physicalSiteUid = 'replacement';
    },
    (f: ReturnType<typeof fixture>) => {
      f.observation.siteUid = 'replacement';
    },
    (f: ReturnType<typeof fixture>) => {
      f.observation.os.installed = '9.2026.18';
    },
    (f: ReturnType<typeof fixture>) => {
      f.observation.software.installed =
        f.observation.targetSoftware =
        f.observation.progress.version =
          'crt-20260201-0180';
    },
    (f: ReturnType<typeof fixture>) => {
      f.observation.siteState = 'FAILED';
      f.observation.online = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.observation.startedAt = new Date(Date.now() - 61_000).toISOString();
    },
  ]) {
    const f = fixture();
    const snapshot = await f.capture();
    mutate(f);
    await expect(verifyCeReplacementVersions(snapshot, f.runtime, f.contract)).rejects.toThrow('before mutation');
  }
});

test('unknown snapshot versions and malformed frozen versions fail before observation', async () => {
  const f = fixture();
  const snapshot = await f.capture();
  const runtime = {
    observeUpgrade: async () => {
      throw new Error('must not observe');
    },
  };
  await expect(
    verifyCeReplacementVersions({ ...snapshot, schemaVersion: 0 } as never, runtime, f.contract),
  ).rejects.toThrow('snapshot');
  await expect(
    verifyCeReplacementVersions({ ...snapshot, versions: { software: 'latest', os: 'latest' } }, runtime, f.contract),
  ).rejects.toThrow('explicit version pair');
});
