import { expect, it } from 'bun:test';
import { classifyGcpNetworkChange } from '../../src/ce/replacement';
import { intent } from './fixtures';

it('immutable SLO network or VRF changes require replacement with fresh identity qualification', () => {
  const before = intent(),
    after = structuredClone(before);
  after.sites[0].nodes[0].interfaces[0].network = 'new-outside';
  const result = classifyGcpNetworkChange(before, after);
  expect(result.kind).toBe('replacement-required');
  expect(result.reasons).toEqual(['immutable-slo:node-a']);
  expect(result.requires).toContain('physical interface requalification');
});
it('unchanged SLO can propose network update but cannot change owning engine or topology', () => {
  const before = intent(),
    after = structuredClone(before);
  after.sites[0].nodes[0].interfaces[1].network = 'new-inside';
  expect(classifyGcpNetworkChange(before, after).kind).toBe('network-update-candidate');
  after.engine = 'terraform';
  expect(() => classifyGcpNetworkChange(before, after)).toThrow('ownership');
  after.engine = 'native';
  after.sites[0].nodes = [];
  expect(() => classifyGcpNetworkChange(before, after)).toThrow();
});

it.each(['vrf', 'role'] as const)('refuses unqualified internal interface %s remapping', (field) => {
  const before = intent(),
    after = structuredClone(before);
  if (field === 'vrf') after.sites[0].nodes[0].interfaces[1].vrf = 'new-inside';
  else after.sites[0].nodes[0].interfaces[1].role = 'management';
  const result = classifyGcpNetworkChange(before, after);
  expect(result.kind).toBe('mapping-unavailable');
  expect(result.executable).toBe(false);
  expect(result.mappingBlockers).toEqual([`ce-interface-${field}:node-a:nic1`]);
});

it('retains exact versioned interface deltas and requires address preservation and restoration review', () => {
  const before = intent(),
    after = structuredClone(before);
  after.sites[0].nodes[0].interfaces[1].subnet = 'new-inside';
  after.sites[0].nodes[0].interfaces[1].cidr = '10.4.0.0/24';
  const result = classifyGcpNetworkChange(before, after);
  expect(result.schemaVersion).toBe(2);
  expect(result.kind).toBe('network-update-candidate');
  expect(result.executable).toBe(false);
  expect(result.interfaceChanges).toEqual([
    {
      siteName: 'ce-site',
      nodeName: 'node-a',
      zone: 'northamerica-northeast1-a',
      index: 1,
      original: before.sites[0].nodes[0].interfaces[1],
      desired: after.sites[0].nodes[0].interfaces[1],
    },
  ]);
  expect(result.requires).toContain('original NIC identity and private IP allocation review');
  expect(result.requires).toContain('owned interface and network restoration inventory');
  result.interfaceChanges[0].original.network = 'changed-receipt';
  expect(before.sites[0].nodes[0].interfaces[1].network).toBe('inside');
});

it('routing-only changes do not invent NIC deltas or guest mapping blockers', () => {
  const before = intent(),
    after = structuredClone(before);
  after.routing.destinationCidrs = ['10.5.0.0/24'];
  const result = classifyGcpNetworkChange(before, after);
  expect(result.interfaceChanges).toEqual([]);
  expect(result.mappingBlockers).toEqual([]);
  expect(result.kind).toBe('network-update-candidate');
});

it('immutable SLO replacement retains priority over an unqualified internal VRF change', () => {
  const before = intent(),
    after = structuredClone(before);
  after.sites[0].nodes[0].interfaces[0].network = 'new-outside';
  after.sites[0].nodes[0].interfaces[1].vrf = 'new-inside';
  const result = classifyGcpNetworkChange(before, after);
  expect(result.kind).toBe('replacement-required');
  expect(result.mappingBlockers).toEqual(['ce-interface-vrf:node-a:nic1']);
  expect(result.interfaceChanges).toHaveLength(2);
});
