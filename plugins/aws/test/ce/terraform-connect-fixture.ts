import { canonicalSha256 } from '../../src/ce/canonical';
import type { AwsCeObservation } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

export function connectFixture() {
  const { planId: _id, planSha256: _sha, ...draft } = foundationPlan();
  draft.intent.routing = {
    profile: 'tgw-connect',
    transitGatewayId: 'tgw-12345678',
    customerAsn: 65010,
    transitGatewayAsn: 64512,
    destinationCidrs: [],
    associations: ['tgw-rtb-12345678'],
    propagations: ['tgw-rtb-12345678'],
    connectPeers: [1, 2, 3].flatMap((node) =>
      [0, 1].map((peerIndex) => ({
        node,
        transportInterfaceIndex: peerIndex,
        insideCidr: `169.254.10.${((node - 1) * 2 + peerIndex) * 8}/29`,
      })),
    ),
  };
  const planSha256 = canonicalSha256(draft);
  const plan = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
  const observation = {
    resources: [
      {
        id: 'tgw-12345678',
        exists: true,
        region: 'us-east-1',
        state: {
          TransitGateways: [
            {
              TransitGatewayId: 'tgw-12345678',
              State: 'available',
              Options: { AmazonSideAsn: 64512, TransitGatewayCidrBlocks: ['172.31.255.0/24'] },
            },
          ],
        },
      },
    ],
  } as unknown as AwsCeObservation;
  const bootstrap = Object.fromEntries(
    [1, 2, 3].map((node) => [
      String(node),
      '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture\n',
    ]),
  );
  return { plan, observation, bootstrap };
}
