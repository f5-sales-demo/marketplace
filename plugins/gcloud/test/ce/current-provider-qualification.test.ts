import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  isOriginalCreationScopeProfile,
  resolveInstalledGcpExecutableProfile,
  resolveInstalledGcpVersionProfile,
} from '../../../terraform/src/installed-version-profile';
import { translateGcpPublicTerraformSiteCompute } from '../../src/ce/compute-plan';
import { gcpSiteAccessFingerprint, resolveGcpSiteAccessMapping } from '../../src/ce/site-access';
import * as artifacts from '../../src/ce/terraform-public-artifacts';
import type { GcpTerraformInputs } from '../../src/ce/terraform-session';
import { intent } from './fixtures';
import historicalSchema from './site-access-schema-15.16.2.json';
import schema from './site-access-schema-15.17.6.json';

const lockSha256 = 'f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5';
const providerLock = readFileSync(new URL('./provider-lock-15.17.6.hcl', import.meta.url), 'utf8');
const versions = { terraform: '1.17.2', google: '8.12.0', xcsh: '15.17.6' };

describe('current GCP artifact and Site schema qualification', () => {
  it('resolves the exact independently captured lock for both configuration graphs', () => {
    expect(createHash('sha256').update(providerLock).digest('hex')).toBe(lockSha256);
    for (const configurationVersion of [2, 3] as const) {
      const inputs = { configurationVersion, versions, providerLock, expectedLockSha256: `sha256:${lockSha256}` };
      const resolved = artifacts.resolveGcpTerraformArtifacts(inputs);
      expect(resolved).toEqual(inputs);
      expect(Object.isFrozen(resolved)).toBe(true);
      expect(Object.isFrozen(resolved.versions)).toBe(true);
    }
  });

  it('binds the current packaged artifact without replacing historical public selection', () => {
    const current = (artifacts as unknown as Record<string, Omit<GcpTerraformInputs, 'intent'>>)
      .GCP_XCSH15176_TERRAFORM_ARTIFACTS;
    expect(current).toBeDefined();
    expect(current).toEqual({
      configurationVersion: 2,
      versions,
      providerLock,
      expectedLockSha256: `sha256:${lockSha256}`,
    });
    expect(artifacts.GCP_PUBLIC_TERRAFORM_ARTIFACTS.versions).toEqual({
      terraform: '1.17.2',
      google: '8.11.0',
      xcsh: '15.17.3',
    });
    expect(artifacts.resolveGcpTerraformArtifacts(artifacts.GCP_PUBLIC_TERRAFORM_ARTIFACTS)).toBe(
      artifacts.GCP_PUBLIC_TERRAFORM_ARTIFACTS,
    );
  });

  it('rejects modified locks, mixed tuples and unknown configuration versions', () => {
    const original = { configurationVersion: 2, versions, providerLock, expectedLockSha256: `sha256:${lockSha256}` };
    for (const changed of [
      { ...original, providerLock: `${providerLock}\n` },
      { ...original, versions: { ...versions, google: '8.11.0' } },
      { ...original, versions: { ...versions, xcsh: '15.17.5' } },
      { ...original, configurationVersion: 4 },
      { ...original, expectedLockSha256: `sha256:${'0'.repeat(64)}` },
    ])
      expect(() => artifacts.resolveGcpTerraformArtifacts(changed)).toThrow();
  });

  it('uses the independently loaded current Site admin and SLI service mapping', () => {
    const mapping = resolveGcpSiteAccessMapping('15.17.6');
    expect(mapping).toMatchObject({ version: schema.version, sourceSchemaSha256: schema.sourceSchemaSha256 });
    expect(Object.isFrozen(mapping)).toBe(true);
    expect(schema.sourceSchemaSha256).toBe('8885cd5d40cb9edde0a822915da15e7a1ed6290d2af81c3d7f6773200d0de799');
    expect(schema.admin).toEqual(historicalSchema.admin);
    expect(schema.services).toEqual(historicalSchema.services);
    const i = intent();
    i.engine = 'terraform';
    i.routing.destinationCidrs = [];
    i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
      ...structuredClone(i.sites[0].nodes[0]),
      name: `node-${suffix}`,
      zone: `${i.region}-${suffix}`,
    }));
    const key = Buffer.concat([
      Buffer.from([0, 0, 0, 11]),
      Buffer.from('ssh-ed25519'),
      Buffer.from([0, 0, 0, 32]),
      Buffer.alloc(32, 9),
    ]).toString('base64');
    i.initialAccess = { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: `ssh-ed25519 ${key}` };
    const previous = translateGcpPublicTerraformSiteCompute(i, { ...versions, google: '8.11.0', xcsh: '15.17.3' });
    const current = translateGcpPublicTerraformSiteCompute(i, versions);
    expect(current.configuration.resource).toEqual(previous.configuration.resource);
    expect(current.executable).toBe(false);
    expect(gcpSiteAccessFingerprint(i, '15.17.6')).not.toBe(gcpSiteAccessFingerprint(i, '15.17.3'));
    for (const version of ['15.17.5', '15.17.7', 'latest', '15.17.6\n'])
      expect(() => resolveGcpSiteAccessMapping(version)).toThrow();
  });

  it('binds original current capture preparation without changing public artifact selection', () => {
    const profile = resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.2', providerLockSha256: lockSha256 });
    expect(profile).toMatchObject({
      googleVersion: '8.12.0',
      xcshVersion: '15.17.6',
      terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
      googleProviderSha256: '97cc25d78bb8fc4c4cccc0672af0cc776b1175e0f0a5cd6a67ba55f0380189f0',
      xcProviderSha256: '3c38dd6ceba946a199970effa34ce0bfcfd4348524b11ec51df3dd9124c5d65f',
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(resolveInstalledGcpExecutableProfile(profile.terraformSha256, profile.googleProviderSha256)).toBe(profile);
    expect(() => resolveInstalledGcpExecutableProfile(profile.terraformSha256)).toThrow('ambiguous');
    expect(isOriginalCreationScopeProfile(profile)).toBe(true);
    expect(artifacts.GCP_PUBLIC_TERRAFORM_ARTIFACTS.versions).toEqual({
      terraform: '1.17.2',
      google: '8.11.0',
      xcsh: '15.17.3',
    });
    expect(() =>
      resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.1', providerLockSha256: lockSha256 }),
    ).toThrow();
  });
});
