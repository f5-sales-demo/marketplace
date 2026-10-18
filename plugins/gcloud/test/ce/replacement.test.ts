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
