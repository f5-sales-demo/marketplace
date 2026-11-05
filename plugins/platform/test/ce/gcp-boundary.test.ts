import { expect, test } from 'bun:test';
import { correlateCeInterfaces } from '../../src/ce/interface-evidence';
import { VerifiedCeContract } from '../../src/ce/verified-contract';

test('GCP runtime methods cannot fall through to AWS bootstrap or telemetry mappings', () => {
  const contract = Object.create(VerifiedCeContract.prototype) as VerifiedCeContract;
  expect(() => contract.bootstrapQuery('gcp')).toThrow('GCP');
  expect(() => contract.configurationPath('gcp', 'site-test')).toThrow('GCP');
  expect(() => contract.bgpPeersPath('gcp', 'site-test')).toThrow('GCP');
  expect(() => contract.bgpRoutesPath('gcp', 'site-test')).toThrow('GCP');
  expect(() => correlateCeInterfaces({}, {}, {}, [], 'gcp')).toThrow('GCP');
});
