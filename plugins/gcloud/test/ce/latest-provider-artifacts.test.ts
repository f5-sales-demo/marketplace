import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { resolveInstalledGcpVersionProfile } from '../../../terraform/src/installed-version-profile';
import { resolveGcpSiteAccessMapping } from '../../src/ce/site-access';
import { GCP_PUBLIC_TERRAFORM_ARTIFACTS, resolveGcpTerraformArtifacts } from '../../src/ce/terraform-public-artifacts';

const lockSha256 = '40fdb8634396951a615fe16eaeb575ce9ed0a6756bb15c4611c1c2e5fb5b8fee';

describe('authenticated current published GCP provider artifacts', () => {
  it('selects the verified latest tuple with its exact normal-install lock', () => {
    const artifact = GCP_PUBLIC_TERRAFORM_ARTIFACTS;
    expect(artifact.versions).toEqual({ terraform: '1.17.2', google: '8.12.0', xcsh: '15.17.9' });
    expect(createHash('sha256').update(artifact.providerLock).digest('hex')).toBe(lockSha256);
    expect(artifact.expectedLockSha256).toBe(`sha256:${lockSha256}`);
    expect(resolveGcpTerraformArtifacts(artifact)).toBe(artifact);
    expect(() => resolveGcpTerraformArtifacts({ ...artifact, providerLock: `${artifact.providerLock}\n` })).toThrow();
  });

  it('binds the installed profile to the authenticated published binary', () => {
    const profile = resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.2', providerLockSha256: lockSha256 });
    expect(profile.xcshVersion).toBe('15.17.9');
    expect(profile.xcProviderSha256).toBe('b4ac1a7018662b26143f592b4404560f86c99299b099c9289e92a3443223dfcc');
    expect(() =>
      resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.1', providerLockSha256: lockSha256 }),
    ).toThrow();
  });

  it('uses the independently loaded current Site SSH schema and rejects unknown releases', () => {
    const mapping = resolveGcpSiteAccessMapping('15.17.9');
    expect(mapping.version).toBe('15.17.9');
    expect(mapping.credentials).toBe('admin_user_credentials.ssh_key');
    expect('sourceSchemaSha256' in mapping && mapping.sourceSchemaSha256).toBe(
      '0ec08dc6886cf059a75db7462d33286ed24963536f09a96cde7d224ca28f2c30',
    );
    expect(() => resolveGcpSiteAccessMapping('15.17.4')).toThrow();
  });
});
