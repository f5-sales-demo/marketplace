import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { buildAwsRouting, routingValidators } from '../../../platform/src/ce/wire-routing';
import schema from '../../../platform/test/fixtures/aws-routing-schema.json';
import { collectAwsPowerBgpServices } from '../../src/ce/whole-site-power-bgp-services';
import { connectPowerFixture } from './whole-site-power-connect-fixtures';

export function bgpPowerFixture(engine: 'native' | 'terraform' = 'native') {
  const f = connectPowerFixture(engine, 'site-a'),
    validate = routingValidators(schema.schemas.network, schema.schemas.marketplace),
    fingerprint = `sha256:${'f'.repeat(64)}`;
  const wire = buildAwsRouting(
    'site-a',
    65010,
    64512,
    [
      {
        name: 'ce-gre-1',
        node: 'ce-1',
        interfaceName: 'ens6',
        interfaceMtu: 1500,
        awsGreAddress: '100.64.0.1',
        ceInsideAddress: '169.254.10.1',
        awsBgpAddresses: ['169.254.10.2', '169.254.10.3'],
      },
    ],
    ['10.0.0.0/16'],
    validate,
  );
  const values: Record<string, string> = {
    ...f.values,
    [`__XC_ROUTING_${wire.bgp.name}__`]: 'bgp-one',
    '__XC_ROUTING_ce-gre-1__': 'connector-one',
  };
  const snapshots = new Map<string, Record<string, unknown>>();
  const binding = {
    owner: {
      deploymentId: f.base.deploymentName,
      engine: f.base.engine,
      provider: 'aws',
      account: f.base.accountId,
      region: f.base.region,
    },
    siteName: 'site-a',
    nodes: ['ce-1'],
  };
  for (const [kind, item, uid] of [
    ['bgp', wire.bgp, 'bgp-one'],
    ['external_connector', wire.connectors[0], 'connector-one'],
  ] as const)
    snapshots.set(item.name, {
      binding,
      kind,
      name: item.name,
      uid,
      siteUid: 'site-one',
      resourceVersion: 'v1',
      spec: structuredClone(item.spec),
      contractFingerprint: fingerprint,
      collectedAt: new Date().toISOString(),
    });
  let status: 'active' | 'withdrawn' = 'active',
    hardwareUnknown = false,
    ambiguous = false,
    changeDuringRead = false,
    reads = 0;
  const runtime = {
    contract: { fingerprint, validateRouting: validate },
    observePowerRouting: async (_binding: unknown, _kind: unknown, name: string) => {
      reads++;
      const value = structuredClone(snapshots.get(name));
      if (changeDuringRead && reads > 2 && name === wire.bgp.name && value) value.resourceVersion = 'changed';
      return value;
    },
    observeRegisteredDevices: async () => ({
      status: hardwareUnknown ? 'unknown' : 'observed',
      interfaces: [0, 1].map((index) => ({
        node: 'ce-1',
        role: index ? 'sli' : 'slo',
        mac: f.values[`__ENI_1_${index}_MAC__`],
        device: index ? 'ens6' : 'ens5',
      })),
    }),
    observeBgpRoutes: async () => ({
      status: 'observed',
      owner: binding.owner,
      siteName: 'site-a',
      contractFingerprint: fingerprint,
      nodes: [
        {
          node: 'ce-1',
          routingInstances: [
            {
              name: 'inside',
              tables: Array.from({ length: ambiguous ? 2 : 1 }, (_, i) => ({
                name: `inet.${i}`,
                imported: [],
                exported: ['10.200.0.0/16'],
              })),
            },
          ],
        },
      ],
    }),
    observeBgpServiceMembership: async () => ({
      status,
      owner: binding.owner,
      siteName: 'site-a',
      siteUid: 'site-one',
      contractFingerprint: fingerprint,
      freshness: 'unqualified',
      traffic: 'unknown',
    }),
  } as unknown as CeRuntime;
  const read = (retained?: Parameters<typeof collectAwsPowerBgpServices>[5]) =>
    collectAwsPowerBgpServices(f.base, values, f.api, runtime, undefined, retained);
  return {
    ...f,
    values,
    runtime,
    wire,
    binding,
    snapshots,
    snapshot: (name: string) => {
      const snapshot = snapshots.get(name);
      if (!snapshot) throw Error('Synthetic routing snapshot missing');
      return snapshot;
    },
    read,
    withdraw: () => {
      status = 'withdrawn';
      f.routes([]);
    },
    restore: () => {
      status = 'active';
      f.routes([
        {
          DestinationCidrBlock: '10.200.0.0/16',
          Type: 'propagated',
          State: 'active',
          TransitGatewayAttachments: [
            { TransitGatewayAttachmentId: f.values.__TGW_CONNECT_ATTACHMENT_1_1__, ResourceType: 'connect' },
          ],
        },
      ]);
    },
    hardwareUnknown: () => {
      hardwareUnknown = true;
    },
    ambiguous: () => {
      ambiguous = true;
    },
    changeDuringRead: () => {
      changeDuringRead = true;
    },
  };
}
