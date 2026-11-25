import { expect, test } from 'bun:test';
import { resolveGcpTerraformTeardownLifecycle } from '../../src/ce/deployment-teardown';
import { fingerprint } from '../../src/ce/discovery';
import { assertGcpTerraformHaProfile, gcpDeploymentLifecycleFingerprint } from '../../src/ce/terraform-ha-profile';
import type { GcpTerraformTeardownRuntime } from '../../src/ce/terraform-teardown';
import { appliedSourceFixture } from './applied-source-fixtures';
import { capturedTeardownSourceFixture } from './captured-teardown-origin.test';
import { terraformHaProfileFixture } from './terraform-ha-profile.test';

for (const kind of ['captured', 'applied'] as const) {
  test(`original ${kind} cleanup binds its immutable image after published drift and refuses copied or retired authority`, async () => {
    const f = kind === 'captured' ? await capturedTeardownSourceFixture() : await appliedSourceFixture();
    const origin = await f.open();
    const runtime = {
      ...f.runtime,
      ...(kind === 'captured' ? { capturedTeardownOrigin: origin } : { appliedSourceTeardownOrigin: origin }),
    } as unknown as GcpTerraformTeardownRuntime;
    const { boundary } = terraformHaProfileFixture();
    try {
      expect(await resolveGcpTerraformTeardownLifecycle(runtime, f.i, boundary)).toBe(
        gcpDeploymentLifecycleFingerprint(f.i, boundary),
      );
      const profile = boundary.terraformHaLifecycle,
        health = boundary.operationalHealthContract,
        expected = boundary.operationalHealthExpected;
      if (!profile || !health || !expected) throw new Error('Qualified published fixture required');
      profile.imageIdentitySha256 = fingerprint({ publishedImage: 'new' });
      health.qualificationFingerprint = fingerprint(health.qualification);
      expected.qualificationFingerprint = health.qualificationFingerprint;
      expect(() => assertGcpTerraformHaProfile(f.i, boundary, true)).toThrow('lifecycle scope');
      const lifecycle = await resolveGcpTerraformTeardownLifecycle(runtime, f.i, boundary);
      expect(lifecycle).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(await resolveGcpTerraformTeardownLifecycle(runtime, f.i, boundary)).toBe(lifecycle);
      const copied = {
        ...runtime,
        ...(kind === 'captured'
          ? { capturedTeardownOrigin: { ...origin } }
          : { appliedSourceTeardownOrigin: { ...origin } }),
      } as unknown as GcpTerraformTeardownRuntime;
      await expect(resolveGcpTerraformTeardownLifecycle(copied, f.i, boundary)).rejects.toThrow();
      await expect(
        resolveGcpTerraformTeardownLifecycle(
          { ...runtime, capturedTeardownOrigin: undefined, appliedSourceTeardownOrigin: undefined },
          f.i,
          boundary,
        ),
      ).rejects.toThrow('Source-issued original cleanup image');
      const changed = structuredClone(f.i);
      changed.image.id = '99999';
      await expect(resolveGcpTerraformTeardownLifecycle(runtime, changed, boundary)).rejects.toThrow();
      await expect(
        resolveGcpTerraformTeardownLifecycle(runtime, { ...f.i, engine: 'native' }, boundary),
      ).rejects.toThrow('owning engine');
      const foreignProfile = structuredClone(boundary);
      if (!foreignProfile.terraformHaLifecycle) throw new Error('Profile required');
      foreignProfile.terraformHaLifecycle.diskGiB = 81 as 80;
      await expect(resolveGcpTerraformTeardownLifecycle(runtime, f.i, foreignProfile)).rejects.toThrow(
        'lifecycle scope',
      );
      const changedRelease = {
        ...structuredClone(boundary),
        release: { ...boundary.release, tag: 'v0.0.0' as 'v12.1.3' },
      };
      await expect(resolveGcpTerraformTeardownLifecycle(runtime, f.i, changedRelease)).rejects.toThrow(
        'teardown contract',
      );
      origin.close();
      await expect(resolveGcpTerraformTeardownLifecycle(runtime, f.i, boundary)).rejects.toThrow();
    } finally {
      origin.close();
    }
  });
}
