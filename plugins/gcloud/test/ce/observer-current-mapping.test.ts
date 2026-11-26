import { expect, test } from 'bun:test';
import { translateGcpTerraformObserverSiteCompute } from '../../src/ce/observer-plan';
import { assertGcpTerraformRequestReason, createGcpTerraformRequestReason } from '../../src/ce/request-reason';
import {
  GCP_PUBLIC_TERRAFORM_ARTIFACTS,
  GCP_XCSH15176_OBSERVER_ARTIFACTS,
  GCP_XCSH15178_OBSERVER_ARTIFACTS,
} from '../../src/ce/terraform-public-artifacts';
import { intent } from './fixtures';

function publicKey(value: number) {
  const bytes = Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, value)]);
  return `ssh-ed25519 ${bytes.toString('base64')}`;
}
function originalIntent() {
  const value = intent();
  value.engine = 'terraform';
  value.schemaVersion = 2;
  value.routing.destinationCidrs = [];
  value.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
    ...structuredClone(value.sites[0].nodes[0]),
    name: `node-${suffix}`,
    zone: `northamerica-northeast1-${suffix}`,
  }));
  value.initialAccess = { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: publicKey(1) };
  value.observer = {
    schemaVersion: 1,
    profile: 'original-ha-observer',
    publicKey: publicKey(2),
    sshSourceCidr: '192.0.2.4/32',
  };
  return value;
}

test('current Google provider retains the exact original request correlation mapping', () => {
  const value = originalIntent();
  const reason = createGcpTerraformRequestReason(value);
  expect(() => assertGcpTerraformRequestReason(reason, value, '8.12.0')).not.toThrow();
  expect(() =>
    assertGcpTerraformRequestReason({ ...reason, intentFingerprint: 'b'.repeat(64) }, value, '8.12.0'),
  ).toThrow();
  expect(() => assertGcpTerraformRequestReason(reason, value, '8.12.1')).toThrow();
});

for (const artifact of [GCP_XCSH15176_OBSERVER_ARTIFACTS, GCP_XCSH15178_OBSERVER_ARTIFACTS]) {
  test(`current ${artifact.versions.xcsh} tuple renders the full nonexecutable observer graph without changing public selection`, () => {
    const value = originalIntent();
    const before = JSON.stringify(value);
    const reason = createGcpTerraformRequestReason(value);
    const observer = value.observer;
    if (!observer) throw new Error('Original observer fixture required');
    const plan = translateGcpTerraformObserverSiteCompute(value, artifact.versions, observer, reason);
    expect(plan.schemaVersion).toBe(3);
    expect(plan.executable).toBe(false);
    expect(plan.inventory.ce).toHaveLength(18);
    expect(plan.inventory.observer).toHaveLength(3);
    expect(new Set(plan.inventory.all).size).toBe(21);
    const google = plan.configuration.provider.google;
    expect((Array.isArray(google) ? google[0] : google).request_reason).toBe(reason.reason);
    expect(plan.configuration.terraform.required_providers.google.version).toBe('= 8.12.0');
    expect(plan.configuration.terraform.required_providers.xcsh.version).toBe(`= ${artifact.versions.xcsh}`);
    const vm = plan.configuration.resource.google_compute_instance.ce_test_observer;
    expect(Object.hasOwn(vm, 'service_account')).toBe(false);
    expect(vm.metadata).toEqual({
      'ssh-keys': `ubuntu:${publicKey(2)}`,
      'block-project-ssh-keys': 'TRUE',
      'enable-oslogin': 'FALSE',
    });
    expect(plan.configuration.resource.google_compute_disk.ce_test_observer.lifecycle).toEqual({
      precondition: [
        {
          condition: `\${data.google_compute_image.ce_test_observer.image_id == "4996011480491275419" && data.google_compute_image.ce_test_observer.status == "READY"}`,
          error_message: 'Original pinned Ubuntu observer image identity required',
        },
      ],
    });
    expect(JSON.stringify(value)).toBe(before);
    expect(GCP_PUBLIC_TERRAFORM_ARTIFACTS?.versions).not.toEqual(artifact.versions);
    for (const changed of [
      { ...artifact.versions, xcsh: '15.17.3' },
      { ...artifact.versions, google: '8.12.1' },
    ])
      expect(() => translateGcpTerraformObserverSiteCompute(value, changed, observer, reason)).toThrow();
  });
}
