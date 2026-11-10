import { expect, test } from 'bun:test';
import {
  translateGcpPublicTerraformSiteCompute,
  translateGcpTerraformCompute,
  translateGcpTerraformSiteCompute,
} from '../../src/ce/compute-plan';
import { fingerprint } from '../../src/ce/discovery';
import { assertGcpTerraformRequestReason, createGcpTerraformRequestReason } from '../../src/ce/request-reason';
import { intent } from './fixtures';

const versions = { google: '8.7.0', xcsh: '15.13.0', terraform: '1.16.6' };
const scoped = () => {
  const i = intent();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  return i;
};

test('new original request reasons are opaque unique immutable versioned deployment intents', () => {
  const i = scoped();
  const a = createGcpTerraformRequestReason(i),
    b = createGcpTerraformRequestReason(i);
  expect(a.schemaVersion).toBe(1);
  expect(a.scope).toBe('gcp-terraform-deployment');
  expect(a.intentFingerprint).toBe(fingerprint(i));
  expect(a.reason).toMatch(/^xcsh-gcp-[a-f0-9-]{36}$/);
  expect(a.reason).not.toBe(b.reason);
  expect(a.reason).not.toContain(i.project);
  expect(a.reason).not.toContain(i.deploymentName);
  expect(Object.isFrozen(a)).toBe(true);
  assertGcpTerraformRequestReason(a, i, versions.google);
});

test('all supported Terraform translators emit the exact reviewed nonempty provider reason', () => {
  const i = scoped(),
    reason = createGcpTerraformRequestReason(i);
  for (const translated of [
    translateGcpTerraformCompute(i, versions.google, reason),
    translateGcpTerraformSiteCompute(i, versions, reason),
    translateGcpPublicTerraformSiteCompute(i, versions, reason),
  ])
    expect(translated.configuration.provider.google).toEqual([
      { project: i.project, region: i.region, request_reason: reason.reason },
    ]);
});

test('omitted reason preserves historical provider configuration and adds no implicit attribution', () => {
  const i = scoped();
  for (const translated of [
    translateGcpTerraformCompute(i, versions.google),
    translateGcpTerraformSiteCompute(i, versions),
    translateGcpPublicTerraformSiteCompute(i, versions),
  ]) {
    expect(translated.configuration.provider.google).toEqual([{ project: i.project, region: i.region }]);
    expect(JSON.stringify(translated.configuration)).not.toContain('request_reason');
  }
});

test('changed scope, reason schema, unknown fields, malformed IDs and unsupported provider mappings refuse', () => {
  const i = scoped(),
    original = createGcpTerraformRequestReason(i);
  for (const bad of [
    { ...original, schemaVersion: 2 },
    { ...original, scope: 'foreign' },
    { ...original, intentFingerprint: fingerprint({ foreign: true }) },
    { ...original, reason: '' },
    { ...original, reason: `${original.reason}\n` },
    { ...original, reason: 'xcsh-gcp-example-user-identity' },
    { ...original, credential: 'example-private-token' },
    null,
    [],
  ])
    expect(() => translateGcpPublicTerraformSiteCompute(i, versions, bad as typeof original)).toThrow();
  const changed = structuredClone(i);
  changed.diskGiB += 1;
  expect(() => assertGcpTerraformRequestReason(original, changed, versions.google)).toThrow();
  expect(() => translateGcpTerraformCompute(i, '8.6.0', original)).toThrow();
  const native = scoped();
  native.engine = 'native';
  expect(() => createGcpTerraformRequestReason(native)).toThrow();
});
