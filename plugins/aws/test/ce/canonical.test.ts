import { expect, test } from 'bun:test';
import { fingerprintOwnedResources, matchesOwnedResourceFingerprint } from '../../src/ce/canonical';

const resource = {
  id: 'i-fixture',
  region: 'us-east-1',
  exists: true,
  owned: true,
  tags: { 'xcsh-execution-engine': 'native' },
  state: {
    Reservations: [
      { Instances: [{ InstanceId: 'i-fixture', InstanceType: 'm5.2xlarge', State: { Name: 'pending' } }] },
    ],
  },
};
test('resume permits runtime convergence but rejects configuration and ownership drift', () => {
  const running = structuredClone(resource);
  running.state.Reservations[0].Instances[0].State.Name = 'running';
  expect(fingerprintOwnedResources([running])).toBe(fingerprintOwnedResources([resource]));
  running.state.Reservations[0].Instances[0].InstanceType = 'm5.4xlarge';
  expect(fingerprintOwnedResources([running])).not.toBe(fingerprintOwnedResources([resource]));
  const foreign = structuredClone(resource);
  foreign.tags['xcsh-execution-engine'] = 'terraform';
  expect(fingerprintOwnedResources([foreign])).not.toBe(fingerprintOwnedResources([resource]));
});

test('resume accepts only BGP runtime status transitions in an existing owned-resource fingerprint', () => {
  const down = structuredClone(resource);
  Object.assign(down.state, {
    TransitGatewayConnectPeers: [
      {
        ConnectPeerConfiguration: {
          BgpConfigurations: [{ BgpStatus: 'down', PeerAddress: '169.254.1.1' }],
        },
      },
    ],
  });
  const expected = fingerprintOwnedResources([down]);
  const up = structuredClone(down);
  (
    up.state.TransitGatewayConnectPeers[0].ConnectPeerConfiguration.BgpConfigurations[0] as { BgpStatus: string }
  ).BgpStatus = 'up';
  expect(matchesOwnedResourceFingerprint(expected, [up])).toBe(true);
  up.state.TransitGatewayConnectPeers[0].ConnectPeerConfiguration.BgpConfigurations[0].PeerAddress = '169.254.1.2';
  expect(matchesOwnedResourceFingerprint(expected, [up])).toBe(false);
});
