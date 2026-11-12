import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { translateGcpPublicTerraformSiteCompute } from '../../src/ce/compute-plan';
import { translateGcpTerraformObserverSiteCompute } from '../../src/ce/observer-plan';
import {
  GCP_OBSERVER_TERRAFORM_ARTIFACTS,
  GCP_PUBLIC_TERRAFORM_ARTIFACTS,
  resolveGcpTerraformArtifacts,
} from '../../src/ce/terraform-public-artifacts';
import {
  publicTerraformAddresses,
  publicTerraformCloudScope,
  publicTerraformSelections,
} from '../../src/ce/terraform-public-ownership';
import { openGcpTerraformSession } from '../../src/ce/terraform-session';
import type { GcpCeIntent } from '../../src/ce/types';
import { validateIntent } from '../../src/ce/validation';
import { intent } from './fixtures';

const versions = { terraform: '1.17.2', google: '8.11.0', xcsh: '15.15.7' };
function key(byte: number) {
  return `ssh-ed25519 ${Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, byte)]).toString('base64')}`;
}
function fixture(): GcpCeIntent {
  const i = intent();
  i.project = 'example-project';
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
    ...structuredClone(i.sites[0].nodes[0]),
    name: `node-${suffix}`,
    zone: `northamerica-northeast1-${suffix}`,
  }));
  i.initialAccess = { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: key(1) };
  return i;
}
function observer() {
  return {
    schemaVersion: 1 as const,
    profile: 'original-ha-observer' as const,
    publicKey: key(2),
    sshSourceCidr: '192.0.2.4/32',
  };
}
function current() {
  return { ...fixture(), schemaVersion: 2, observer: observer() } as GcpCeIntent;
}

test('versioned observer intent requires its complete scope and legacy intents keep their original meaning', () => {
  expect(() => validateIntent(fixture())).not.toThrow();
  expect(() => validateIntent(current())).not.toThrow();
  expect(() => validateIntent({ ...fixture(), observer: observer() } as GcpCeIntent)).toThrow();
  const missing = current();
  delete missing.observer;
  expect(() => validateIntent(missing)).toThrow();
  expect(() => validateIntent({ ...current(), schemaVersion: 3 } as never)).toThrow();
  const native = current();
  native.engine = 'native';
  expect(() => validateIntent(native)).toThrow();
});
test('original cloud scope and addresses include all 21 resources with observer identities separate from CE nodes', () => {
  const old = fixture(),
    i = current();
  expect(publicTerraformAddresses(old)).toHaveLength(18);
  const scope = publicTerraformCloudScope(i),
    addresses = publicTerraformAddresses(i);
  expect(addresses).toHaveLength(21);
  expect(new Set(addresses).size).toBe(21);
  expect(scope).toHaveLength(17);
  const added = scope.filter((r) => r.selfLink.includes('ce-test-observer'));
  expect(added.map((r) => r.kind).sort()).toEqual(['disk', 'firewall', 'instance']);
  expect(added.every((r) => r.nodeName === undefined && r.siteName === undefined)).toBe(true);
  expect(addresses).toContain('google_compute_instance.ce_test_observer');
});
test('observer state selections bind one SLI NIC, no service account, disk, metadata and narrow firewall without changing CE selections', () => {
  const old = publicTerraformSelections(fixture()),
    selected = publicTerraformSelections(current());
  for (const [address, fields] of Object.entries(old)) expect(selected[address]).toEqual(fields);
  const vm = selected['google_compute_instance.ce_test_observer'];
  expect(vm).toContain('service_account.length');
  expect(vm).toContain('can_ip_forward');
  expect(vm).toContain('metadata');
  expect(vm).toContain('network_interface.0.network');
  expect(vm).not.toContain('network_interface.1.network');
  expect(selected['google_compute_disk.ce_test_observer']).toContain('image');
  expect(selected['google_compute_firewall.ce_test_observer_ssh']).toContain('source_ranges');
});
test('explicit observer requests cannot enter an 18-resource translator or substitute another scope', () => {
  const i = current();
  expect(() => translateGcpPublicTerraformSiteCompute(i, versions)).toThrow();
  if (!i.observer) throw new Error('Observer fixture missing');
  const plan = translateGcpTerraformObserverSiteCompute(i, versions, i.observer);
  expect(plan.inventory.all).toHaveLength(21);
  expect(() =>
    translateGcpTerraformObserverSiteCompute(i, versions, { ...observer(), sshSourceCidr: '192.0.2.5/32' }),
  ).toThrow();
});

test('observer configuration uses its own version3 artifact profile and immutable original session inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observer-session-'));
  try {
    if (!GCP_OBSERVER_TERRAFORM_ARTIFACTS || !GCP_PUBLIC_TERRAFORM_ARTIFACTS)
      throw new Error('Artifact profile unavailable');
    expect(GCP_PUBLIC_TERRAFORM_ARTIFACTS.configurationVersion).toBe(2);
    expect(GCP_OBSERVER_TERRAFORM_ARTIFACTS.configurationVersion).toBe(3);
    expect(resolveGcpTerraformArtifacts(GCP_OBSERVER_TERRAFORM_ARTIFACTS)).toBe(GCP_OBSERVER_TERRAFORM_ARTIFACTS);
    const i = current(),
      platform = {
        storage: (owner: Parameters<typeof CeDeploymentStore.open>[1]) => CeDeploymentStore.open(root, owner),
      } as CePlatformService;
    let configuration = '';
    const service = {
      bindGcpCaptureAccess: async (
        _owner: unknown,
        binding: { intentSha256: string; cePublicKey: string; observerPublicKey: string },
      ) => {
        if (!i.initialAccess || !i.observer) throw new Error('Complete observer fixture required');
        expect(binding.cePublicKey).toBe(i.initialAccess.publicKey);
        expect(binding.observerPublicKey).toBe(i.observer.publicKey);
        expect(binding.intentSha256).toMatch(/^[a-f0-9]{64}$/);
      },
      open: async (_owner: unknown, deployment: { configuration: string }) => {
        configuration = deployment.configuration;
        return {} as never;
      },
    };
    await openGcpTerraformSession(platform, { ...GCP_OBSERVER_TERRAFORM_ARTIFACTS, intent: i }, false, service);
    const parsed = JSON.parse(configuration);
    expect(
      Object.values(parsed.resource).reduce((n: number, items: unknown) => n + Object.keys(items as object).length, 0),
    ).toBe(21);
    expect(parsed.resource.google_compute_instance.ce_test_observer).toBeDefined();
  } finally {
    await rm(root, { recursive: true });
  }
});
test('observer sessions reject legacy or unknown configuration requests before prerequisite or storage calls', async () => {
  if (!GCP_PUBLIC_TERRAFORM_ARTIFACTS) throw new Error('Artifact profile unavailable');
  let touched = false;
  const platform = {
    storage: async () => {
      touched = true;
      throw new Error('unexpected storage');
    },
  } as unknown as CePlatformService;
  const service = {
    assertNewRuntime: async () => {
      touched = true;
    },
    open: async () => ({}) as never,
  };
  for (const version of [undefined, 2, 4, true])
    await expect(
      openGcpTerraformSession(
        platform,
        { ...GCP_PUBLIC_TERRAFORM_ARTIFACTS, intent: current(), configurationVersion: version } as never,
        false,
        service,
      ),
    ).rejects.toThrow();
  expect(touched).toBe(false);
});
