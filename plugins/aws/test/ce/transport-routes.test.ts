import { describe, expect, it } from 'bun:test';
import { observedConnectCidrs } from '../../src/ce/transport-routes';
import type { AwsCeIntent, AwsCeObservation } from '../../src/ce/types';

const intent = {
  region: 'us-east-1',
  vpc: { cidr: '10.0.0.0/16' },
  routing: {
    transitGatewayId: 'tgw-0123456789abcdef0',
    transitGatewayAsn: 64512,
    connectPeers: [{ transitGatewayAddress: '172.31.240.10' }],
  },
} as AwsCeIntent;
function evidence(): AwsCeObservation {
  return {
    resources: [
      {
        id: intent.routing.transitGatewayId,
        region: intent.region,
        exists: true,
        state: {
          TransitGateways: [
            {
              TransitGatewayId: intent.routing.transitGatewayId,
              State: 'available',
              Options: { AmazonSideAsn: 64512, TransitGatewayCidrBlocks: ['172.31.240.0/24'] },
            },
          ],
        },
      },
    ],
  } as AwsCeObservation;
}

describe('observed GRE transport routes', () => {
  it('uses the exact observed gateway CIDRs', () => {
    expect(observedConnectCidrs(intent, evidence())).toEqual(['172.31.240.0/24']);
  });
  it('rejects incomplete, mismatched and unsafe route evidence', () => {
    const mutations: Array<(value: AwsCeObservation) => void> = [
      (value) => {
        value.resources = [];
      },
      (value) => {
        value.resources.push(value.resources[0]);
      },
      (value) => {
        value.resources[0].region = 'us-west-2';
      },
      (value) => {
        value.resources[0].state.NextToken = 'another-page';
      },
      (value) => {
        value.resources[0].state.TransitGateways = [];
      },
    ];
    for (const mutate of mutations) {
      const value = evidence();
      mutate(value);
      expect(() => observedConnectCidrs(intent, value)).toThrow();
    }
    for (const changes of [
      { TransitGatewayId: 'tgw-11111111111111111' },
      { State: 'pending' },
      { Options: { AmazonSideAsn: 64513, TransitGatewayCidrBlocks: ['172.31.240.0/24'] } },
      ...[
        [],
        ['172.31.240.1/24'],
        ['10.0.0.0/24'],
        ['192.0.2.0/24'],
        ['999.1.2.0/24'],
        ['172.31.240.0/24', '172.31.240.0/25'],
      ].map((cidrs) => ({ Options: { AmazonSideAsn: 64512, TransitGatewayCidrBlocks: cidrs } })),
    ]) {
      const value = evidence();
      Object.assign((value.resources[0].state.TransitGateways as object[])[0], changes);
      expect(() => observedConnectCidrs(intent, value)).toThrow();
    }
  });
});
