import { expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { translateGcpNativeCompute, translateGcpPublicTerraformSiteCompute } from '../../src/ce/compute-plan';
import { collectGcpDeploymentPrerequisites } from '../../src/ce/deployment-review';
import { fingerprint } from '../../src/ce/discovery';
import type { gcpSiteAccessSpec } from '../../src/ce/site-access';
import { assertGcpTerraformHaProfile, gcpDeploymentLifecycleFingerprint } from '../../src/ce/terraform-ha-profile';
import type { GcpCeIntent } from '../../src/ce/types';
import { validateIntent } from '../../src/ce/validation';
import type { PluginInterface } from '../../src/gcloud/types';
import { createGcpCeTools } from '../../src/tools/gcp-ce';
import { intent } from './fixtures';
import { terraformHaProfileFixture } from './terraform-ha-profile.test';

function publicKey(byte = 7) {
  const type = Buffer.from('ssh-ed25519');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(type.length);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(32);
  return `ssh-ed25519 ${Buffer.concat([length, type, size, Buffer.alloc(32, byte)]).toString('base64')}`;
}
function fixture(key = publicKey()): GcpCeIntent {
  const i = intent();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  const node = i.sites[0].nodes[0];
  i.sites[0].nodes = ['a', 'b', 'c'].map((role) => ({
    ...structuredClone(node),
    name: `node-${role}`,
    zone: `${i.region}-${role}`,
  }));
  return Object.assign(i, {
    initialAccess: { schemaVersion: 1 as const, profile: 'site-ssh-sli' as const, publicKey: key },
  });
}
const versions = { terraform: '1.16.6', google: '8.7.0', xcsh: '15.13.0' };

it('accepts a versioned Site key intent without changing its owning engine', () => {
  const i = fixture();
  expect(() => validateIntent(i)).not.toThrow();
  expect(i.engine).toBe('terraform');
});
it('puts the admin public key on the Site and enables SSH only on SLI', () => {
  const i = fixture();
  const translated = translateGcpPublicTerraformSiteCompute(i, versions);
  const site = Object.values(translated.configuration.resource.xcsh_securemesh_site_v2)[0] as NonNullable<
    ReturnType<typeof gcpSiteAccessSpec>
  > &
    Record<string, unknown>;
  expect(site.admin_user_credentials).toEqual({ ssh_key: publicKey() });
  expect(site.block_all_services).toBeUndefined();
  const blocked = site.blocked_services.blocked_service;
  expect(blocked).toContainEqual({ network_type: 'VIRTUAL_NETWORK_SITE_LOCAL', ssh: {} });
  expect(blocked.some((entry) => entry.network_type === 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE' && entry.ssh)).toBe(false);
  for (const network of ['VIRTUAL_NETWORK_SITE_LOCAL', 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE']) {
    expect(blocked).toContainEqual({ network_type: network, dns: {} });
    expect(blocked).toContainEqual({ network_type: network, web_user_interface: {} });
  }
  for (const vm of Object.values(translated.configuration.resource.google_compute_instance)) {
    expect(Object.keys((vm as Record<string, unknown>).metadata as Record<string, unknown>).sort()).toEqual([
      'VmDnsSetting',
      'user-data',
    ]);
    expect(JSON.stringify((vm as Record<string, unknown>).metadata)).not.toContain(publicKey());
  }
  expect(translated.executable).toBe(false);
});
it('preserves the historical all-services-blocked configuration when access is omitted', () => {
  const i = fixture();
  delete i.initialAccess;
  const site = Object.values(
    translateGcpPublicTerraformSiteCompute(i, versions).configuration.resource.xcsh_securemesh_site_v2,
  )[0] as NonNullable<ReturnType<typeof gcpSiteAccessSpec>> & Record<string, unknown>;
  expect(site.block_all_services).toEqual({});
  expect(site.admin_user_credentials).toBeUndefined();
  expect(site.blocked_services).toBeUndefined();
});
it('binds a changed key to a changed intent and generated configuration', () => {
  const first = fixture();
  const second = fixture(publicKey(8));
  expect(fingerprint(first)).not.toBe(fingerprint(second));
  expect(fingerprint(translateGcpPublicTerraformSiteCompute(first, versions))).not.toBe(
    fingerprint(translateGcpPublicTerraformSiteCompute(second, versions)),
  );
});
for (const [label, key] of [
  ['forced command', `command="id" ${publicKey()}`],
  ['multiple keys', `${publicKey()}\n${publicKey(8)}`],
  ['key comment', `${publicKey()} operator`],
  ['invalid base64', 'ssh-ed25519 invalid'],
  ['wrong algorithm', `ssh-rsa ${publicKey().split(' ')[1]}`],
  ['invalid wire length', `ssh-ed25519 ${Buffer.alloc(32).toString('base64')}`],
  ['trailing CR', `${publicKey()}\r`],
  ['Terraform expression', `\${file("private-key")}`],
]) {
  it(`rejects Site key input: ${label}`, () => {
    expect(() => validateIntent(fixture(key))).toThrow('Site SSH');
  });
}
it('refuses unversioned, unsupported-profile and password access requests', () => {
  for (const access of [
    { profile: 'site-ssh-sli', publicKey: publicKey() },
    { schemaVersion: 2, profile: 'site-ssh-sli', publicKey: publicKey() },
    { schemaVersion: 1, profile: 'metadata', publicKey: publicKey() },
    { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: publicKey(), password: 'fixture' },
    null,
  ]) {
    expect(() => validateIntent({ ...fixture(), initialAccess: access } as unknown as GcpCeIntent)).toThrow('Site SSH');
  }
});
it('refuses unqualified provider versions and topologies rather than silently extending them', () => {
  expect(() => translateGcpPublicTerraformSiteCompute(fixture(), { ...versions, xcsh: '15.10.5' })).toThrow('Site SSH');
  const single = fixture();
  single.sites[0].nodes = [single.sites[0].nodes[0]];
  expect(() => translateGcpPublicTerraformSiteCompute(single, versions)).toThrow('Site SSH');
});

it('rejects non-ASCII bytes in the embedded SSH algorithm identifier', () => {
  const bytes = Buffer.from(publicKey().split(' ')[1], 'base64');
  bytes[4] |= 128;
  expect(() => validateIntent(fixture(`ssh-ed25519 ${bytes.toString('base64')}`))).toThrow('Site SSH');
});
it('preserves the legacy lifecycle fingerprint and includes opt-in access without weakening cleanup', () => {
  const f = terraformHaProfileFixture();
  const legacy = gcpDeploymentLifecycleFingerprint(f.i, f.boundary);
  expect(legacy).toBe(
    fingerprint({
      profile: f.profile,
      operationalQualificationFingerprint: f.boundary.operationalHealthContract?.qualificationFingerprint,
    }),
  );
  f.i.initialAccess = fixture().initialAccess;
  expect(gcpDeploymentLifecycleFingerprint(f.i, f.boundary)).not.toBe(legacy);
  f.boundary.operationalHealthContract = undefined;
  expect(() => assertGcpTerraformHaProfile(f.i, f.boundary)).not.toThrow();
  expect(() => assertGcpTerraformHaProfile(f.i, f.boundary, true)).toThrow('operational release');
});
it('refuses native SSH requests before any prerequisite or cloud port is called', async () => {
  const i = fixture();
  i.engine = 'native';
  let calls = 0;
  const never = async () => {
    calls++;
    throw new Error('must not call');
  };
  expect(() => translateGcpNativeCompute(i)).toThrow('Site SSH');
  await expect(
    collectGcpDeploymentPrerequisites({} as never, i, {
      contract: never,
      policy: never,
      discovery: never,
      preflight: never,
      funding: never,
      byol: never,
    }),
  ).rejects.toThrow('Site SSH');
  expect(calls).toBe(0);
});

it('public tools report the concrete unsupported Site access mapping before external reads', async () => {
  const i = fixture();
  i.engine = 'native';
  let calls = 0;
  const never = async () => {
    calls++;
    throw new Error('must not run');
  };
  const tools = createGcpCeTools(
    { typebox: { Type } } as unknown as PluginInterface,
    () => ({ exec: never }),
    undefined,
    never,
  );
  for (const name of ['gcp_ce_plan', 'gcp_ce_apply']) {
    const tool = tools.find((tool) => tool.name === name);
    if (!tool) throw new Error('tool missing');
    const result = await tool.execute(
      'id',
      { project: i.project, region: i.region, engine: 'native', operation: 'deploy', intent: i },
      undefined,
      null,
      { cwd: '/tmp' },
    );
    expect(result.details).toMatchObject({
      availability: 'unavailable',
      reason: 'gcp_site_access_mapping_unavailable',
      engine: 'native',
      profile: 'site-ssh-sli',
      required: [
        'two-interface external-IP Terraform HA profile',
        'published XC 15.13.0 Site admin key and SLI local-service mapping',
      ],
      mutationAttempted: false,
    });
    expect(JSON.stringify(result)).not.toContain(publicKey());
  }
  expect(calls).toBe(0);
});
