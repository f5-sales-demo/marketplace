import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  isOriginalCreationScopeProfile,
  resolveInstalledGcpExecutableProfile,
  resolveInstalledGcpVersionProfile,
  resolveInstalledXcshCreationExecutableProfile,
} from '../../../terraform/src/installed-version-profile';
import { translateGcpPublicTerraformSiteCompute } from '../../src/ce/compute-plan';
import { gcpSiteAccessFingerprint, resolveGcpSiteAccessMapping } from '../../src/ce/site-access';
import * as artifacts from '../../src/ce/terraform-public-artifacts';
import type { GcpTerraformInputs } from '../../src/ce/terraform-session';
import { intent } from './fixtures';
import historicalSchema from './site-access-schema-15.16.2.json';
import previousSchema from './site-access-schema-15.17.6.json';
import latestSchema from './site-access-schema-15.17.8.json';
import stableSchema from './site-access-schema-15.17.9.json';

// Documentation may change independently of provider field types and requirements.
function functionalSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(functionalSchema);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'description' && key !== 'description_kind')
        .map(([key, item]) => [key, functionalSchema(item)]),
    );
  }
  return value;
}

const qualifications = [
  {
    version: '15.17.9',
    lockSha256: '40fdb8634396951a615fe16eaeb575ce9ed0a6756bb15c4611c1c2e5fb5b8fee',
    schema: stableSchema,
    artifact: 'GCP_XCSH15179_TERRAFORM_ARTIFACTS',
    xcProviderSha256: 'b4ac1a7018662b26143f592b4404560f86c99299b099c9289e92a3443223dfcc',
    sourceSchemaSha256: '0ec08dc6886cf059a75db7462d33286ed24963536f09a96cde7d224ca28f2c30',
    providerLock: readFileSync(new URL('./provider-lock-15.17.9.hcl', import.meta.url), 'utf8'),
  },
  {
    version: '15.17.6',
    lockSha256: 'f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5',
    providerLock: readFileSync(new URL('./provider-lock-15.17.6.hcl', import.meta.url), 'utf8'),
    schema: previousSchema,
    artifact: 'GCP_XCSH15176_TERRAFORM_ARTIFACTS',
    xcProviderSha256: '3c38dd6ceba946a199970effa34ce0bfcfd4348524b11ec51df3dd9124c5d65f',
    sourceSchemaSha256: '8885cd5d40cb9edde0a822915da15e7a1ed6290d2af81c3d7f6773200d0de799',
  },
  {
    version: '15.17.8',
    lockSha256: '74834870028124a9006ab8d34d49517b71b7a7e3ea5a3c1004b3899dacca3b4b',
    providerLock: readFileSync(new URL('./provider-lock-15.17.8.hcl', import.meta.url), 'utf8'),
    schema: latestSchema,
    artifact: 'GCP_XCSH15178_TERRAFORM_ARTIFACTS',
    xcProviderSha256: 'a480b2e2c07fb0bd890b94563fc0357538066c8d0a38dcb2349c3cd2555c4fc1',
    sourceSchemaSha256: '0ec08dc6886cf059a75db7462d33286ed24963536f09a96cde7d224ca28f2c30',
  },
];
for (const qualification of qualifications) {
  const { lockSha256, providerLock, schema } = qualification;
  const versions = { terraform: '1.17.2', google: '8.12.0', xcsh: qualification.version };

  describe(`qualified GCP ${versions.xcsh} artifacts and Site schema`, () => {
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

    it('binds the current packaged artifact while selecting the latest stable public tuple', () => {
      const current = (artifacts as unknown as Record<string, Omit<GcpTerraformInputs, 'intent'>>)[
        qualification.artifact
      ];
      expect(current).toBeDefined();
      expect(current).toEqual({
        configurationVersion: 2,
        versions,
        providerLock,
        expectedLockSha256: `sha256:${lockSha256}`,
      });
      expect(artifacts.GCP_PUBLIC_TERRAFORM_ARTIFACTS.versions).toEqual({
        terraform: '1.17.2',
        google: '8.12.0',
        xcsh: '15.17.12',
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
      const mapping = resolveGcpSiteAccessMapping(versions.xcsh);
      expect(mapping).toMatchObject({ version: schema.version, sourceSchemaSha256: schema.sourceSchemaSha256 });
      expect(Object.isFrozen(mapping)).toBe(true);
      expect(schema.sourceSchemaSha256).toBe(qualification.sourceSchemaSha256);
      expect(functionalSchema(schema.admin)).toEqual(functionalSchema(historicalSchema.admin));
      expect(functionalSchema(schema.services)).toEqual(functionalSchema(historicalSchema.services));
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
      expect(gcpSiteAccessFingerprint(i, versions.xcsh)).not.toBe(gcpSiteAccessFingerprint(i, '15.17.3'));
      for (const version of ['15.17.5', '15.17.7', 'latest', `${versions.xcsh}\n`])
        expect(() => resolveGcpSiteAccessMapping(version)).toThrow();
    });

    it('binds original current capture preparation while retaining distinct historical artifact identities', () => {
      const profile = resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.2', providerLockSha256: lockSha256 });
      expect(profile).toMatchObject({
        googleVersion: '8.12.0',
        xcshVersion: versions.xcsh,
        terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
        googleProviderSha256: '97cc25d78bb8fc4c4cccc0672af0cc776b1175e0f0a5cd6a67ba55f0380189f0',
        xcProviderSha256: qualification.xcProviderSha256,
      });
      expect(Object.isFrozen(profile)).toBe(true);
      expect(
        resolveInstalledGcpExecutableProfile(profile.terraformSha256, profile.googleProviderSha256).googleVersion,
      ).toBe('8.12.0');
      if (!isOriginalCreationScopeProfile(profile)) throw new Error('Original source profile required');
      expect(resolveInstalledXcshCreationExecutableProfile(profile.terraformSha256, profile.xcProviderSha256)).toBe(
        profile,
      );
      expect(isOriginalCreationScopeProfile({ ...profile })).toBe(false);
      expect(() => resolveInstalledGcpExecutableProfile(profile.terraformSha256)).toThrow('ambiguous');
      expect(isOriginalCreationScopeProfile(profile)).toBe(true);
      expect(artifacts.GCP_PUBLIC_TERRAFORM_ARTIFACTS.versions).toEqual({
        terraform: '1.17.2',
        google: '8.12.0',
        xcsh: '15.17.12',
      });
      expect(() =>
        resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.1', providerLockSha256: lockSha256 }),
      ).toThrow();
    });
  });
}
