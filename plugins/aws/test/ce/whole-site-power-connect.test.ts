import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAwsPowerConnectRoutes } from '../../src/ce/whole-site-power-connect';
import { connectPowerFixture } from './whole-site-power-connect-fixtures';

for (const engine of ['native', 'terraform'] as const)
  test(`Connect ${engine} active/withdrawn/restored retains exact cloud service identities`, async () => {
    const f = connectPowerFixture(engine),
      up = await collectAwsPowerConnectRoutes(f.base, f.values, f.api);
    expect(up.status).toBe('active');
    expect(up.traffic).toBe('unknown');
    expect(up.freshness).toBe('unqualified');
    f.routes([]);
    const down = await collectAwsPowerConnectRoutes(f.base, f.values, f.api);
    expect(down.status).toBe('withdrawn');
    expect(down.servicesSha256).toBe(up.servicesSha256);
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
    const restored = await collectAwsPowerConnectRoutes(f.base, f.values, f.api);
    expect(restored.status).toBe('active');
    expect(restored.servicesSha256).toBe(up.servicesSha256);
    expect(canonicalSha256(JSON.parse(JSON.stringify(restored.services)))).toBe(restored.servicesSha256);
    expect(
      f.calls.filter((a) => a[1] === 'search-transit-gateway-routes').map((a) => a[a.indexOf('--filters') + 1]),
    ).toContain('Name=route-search.supernet-of-match,Values=10.200.0.0/16');
  });
for (const mode of [
  'foreignOwner',
  'foreignPlan',
  'foreignPeer',
  'foreignNic',
  'duplicatePeer',
  'missingSessions',
  'partial',
  'unavailable',
  'disabledPropagation',
  'lostAssociation',
  'unresolvedId',
] as const)
  test(`Connect ${mode} cannot produce membership`, async () => {
    const f = connectPowerFixture();
    const first = (op: string, key: string) => (f.data[op][key] as Record<string, unknown>[])[0];
    if (mode === 'foreignOwner')
      first('describe-transit-gateway-attachments', 'TransitGatewayAttachments').ResourceOwnerId = '999999999999';
    if (mode === 'foreignPlan') first('describe-transit-gateway-connects', 'TransitGatewayConnects').Tags = [];
    if (mode === 'foreignPeer')
      first('describe-transit-gateway-connect-peers', 'TransitGatewayConnectPeers').TransitGatewayAttachmentId =
        'tgw-attach-ffffffff';
    if (mode === 'foreignNic')
      first('describe-network-interfaces', 'NetworkInterfaces').MacAddress = '02:00:00:ff:ff:ff';
    if (mode === 'duplicatePeer') {
      const peers = f.data['describe-transit-gateway-connect-peers'].TransitGatewayConnectPeers as unknown[];
      peers.push(peers[0]);
    }
    if (mode === 'missingSessions')
      (
        first('describe-transit-gateway-connect-peers', 'TransitGatewayConnectPeers')
          .ConnectPeerConfiguration as Record<string, unknown>
      ).BgpConfigurations = [];
    if (mode === 'partial') f.partial();
    if (mode === 'unavailable') f.unavailable();
    if (mode === 'disabledPropagation')
      first('get-transit-gateway-route-table-propagations', 'TransitGatewayRouteTablePropagations').State = 'disabled';
    if (mode === 'lostAssociation')
      first('get-transit-gateway-route-table-associations', 'Associations').State = 'disassociated';
    if (mode === 'unresolvedId') f.values.__TGW_CONNECT_PEER_1__ = '__PEER__';
    await expect(collectAwsPowerConnectRoutes(f.base, f.values, f.api)).rejects.toThrow();
  });
for (const cidr of ['10.200.1.0/24', '10.0.0.0/8'])
  test(`Connect overlapping export ${cidr} keeps withdrawal pending`, async () => {
    const f = connectPowerFixture();
    f.routes([
      {
        DestinationCidrBlock: cidr,
        Type: 'propagated',
        State: 'active',
        TransitGatewayAttachments: [
          { TransitGatewayAttachmentId: f.values.__TGW_CONNECT_ATTACHMENT_1_1__, ResourceType: 'connect' },
        ],
      },
    ]);
    expect((await collectAwsPowerConnectRoutes(f.base, f.values, f.api)).status).toBe('pending');
  });
test('Connect missing routes with interrupted BGP sessions cannot qualify withdrawal', async () => {
  const f = connectPowerFixture();
  f.routes([]);
  const peer = (
    f.data['describe-transit-gateway-connect-peers'].TransitGatewayConnectPeers as Array<{
      ConnectPeerConfiguration: { BgpConfigurations: Array<{ BgpStatus: string }> };
    }>
  )[0];
  peer.ConnectPeerConfiguration.BgpConfigurations[0].BgpStatus = 'down';
  expect((await collectAwsPowerConnectRoutes(f.base, f.values, f.api)).status).toBe('pending');
});
for (const mode of ['foreignRoute', 'staticRoute', 'duplicateRoute', 'blackhole'] as const)
  test(`Connect ${mode} cannot substitute route withdrawal`, async () => {
    const f = connectPowerFixture();
    const route = {
      DestinationCidrBlock: '10.200.0.0/16',
      Type: mode === 'staticRoute' ? 'static' : 'propagated',
      State: mode === 'blackhole' ? 'blackhole' : 'active',
      TransitGatewayAttachments: [
        {
          TransitGatewayAttachmentId:
            mode === 'foreignRoute' ? 'tgw-attach-ffffffff' : f.values.__TGW_CONNECT_ATTACHMENT_1_1__,
          ResourceType: 'connect',
        },
      ],
    };
    f.routes(mode === 'duplicateRoute' ? [route, route] : [route]);
    if (mode === 'blackhole')
      expect((await collectAwsPowerConnectRoutes(f.base, f.values, f.api)).status).toBe('pending');
    else await expect(collectAwsPowerConnectRoutes(f.base, f.values, f.api)).rejects.toThrow();
  });

test('Connect changed route across search requests rejects mixed observations', async () => {
  const f = connectPowerFixture();
  let searches = 0;
  const api = {
    exec: async (cmd: string, args: string[]) => {
      const result = await f.api.exec(cmd, args);
      if (args[1] === 'search-transit-gateway-routes' && ++searches === 2) {
        const r = JSON.parse(result.stdout);
        r.Routes[0].State = 'blackhole';
        return { ...result, stdout: JSON.stringify(r) };
      }
      return result;
    },
  };
  await expect(collectAwsPowerConnectRoutes(f.base, f.values, api)).rejects.toThrow('changed during collection');
});
test('Connect route authorization failure cannot qualify absence', async () => {
  const f = connectPowerFixture();
  f.routes([]);
  const api = {
    exec: async (cmd: string, args: string[]) =>
      args[1] === 'search-transit-gateway-routes'
        ? { exitCode: 1, stdout: '', stderr: 'AccessDenied' }
        : f.api.exec(cmd, args),
  };
  await expect(collectAwsPowerConnectRoutes(f.base, f.values, api)).rejects.toThrow('unavailable');
});
