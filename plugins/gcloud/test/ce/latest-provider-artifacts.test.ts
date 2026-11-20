import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { resolveInstalledGcpVersionProfile } from '../../../terraform/src/installed-version-profile';
import { resolveGcpSiteAccessMapping } from '../../src/ce/site-access';
import { GCP_PUBLIC_TERRAFORM_ARTIFACTS, resolveGcpTerraformArtifacts } from '../../src/ce/terraform-public-artifacts';

const lockSha256 = 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615';

describe('authenticated current published GCP provider artifacts', () => {
  it('selects the verified latest tuple with its exact normal-install lock', () => {
    const artifact = GCP_PUBLIC_TERRAFORM_ARTIFACTS;
    expect(artifact.versions).toEqual({ terraform: '1.17.2', google: '8.11.0', xcsh: '15.17.3' });
    expect(createHash('sha256').update(artifact.providerLock).digest('hex')).toBe(lockSha256);
    expect(artifact.expectedLockSha256).toBe(`sha256:${lockSha256}`);
    expect(resolveGcpTerraformArtifacts(artifact)).toBe(artifact);
    expect(() => resolveGcpTerraformArtifacts({ ...artifact, providerLock: `${artifact.providerLock}\n` })).toThrow();
  });

  it('binds the installed profile to the authenticated published binary', () => {
    const profile = resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.2', providerLockSha256: lockSha256 });
    expect(profile.xcshVersion).toBe('15.17.3');
    expect(profile.xcProviderSha256).toBe('89a8011443732db8b64bb7fd44df21da15e4cf6183384e21e531d4533653edb0');
    expect(() =>
      resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.1', providerLockSha256: lockSha256 }),
    ).toThrow();
  });

  it('uses the independently loaded current Site SSH schema and rejects unknown releases', () => {
    const mapping = resolveGcpSiteAccessMapping('15.17.3');
    expect(mapping.version).toBe('15.17.3');
    expect(mapping.credentials).toBe('admin_user_credentials.ssh_key');
    expect('sourceSchemaSha256' in mapping && mapping.sourceSchemaSha256).toBe(
      'b09164cac44b715bf40fb5d26afc65b02c6d181cfb516ae54cf5b3e6c647af25',
    );
    expect(() => resolveGcpSiteAccessMapping('15.17.4')).toThrow();
  });
});
