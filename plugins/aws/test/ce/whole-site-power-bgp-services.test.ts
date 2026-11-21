import { expect, test } from 'bun:test';
import type { collectAwsPowerBgpServices } from '../../src/ce/whole-site-power-bgp-services';
import { bgpPowerFixture } from './whole-site-power-bgp-fixtures';

test('composed BGP cloud, logical objects and physical interfaces retain identities through withdrawal/restoration', async () => {
  const f = bgpPowerFixture(),
    up = await f.read();
  expect(up.status).toBe('active');
  expect(up.freshness).toBe('unqualified');
  const original = up.services.platform[0],
    bgp = f.snapshot(f.wire.bgp.name);
  bgp.spec = original.revision.bgpSpec;
  bgp.resourceVersion = 'v2';
  f.withdraw();
  const down = await f.read(up.services.platform);
  expect(down.status).toBe('withdrawn');
  expect(down.servicesSha256).toBe(up.servicesSha256);
  bgp.spec = original.originalSpec;
  bgp.resourceVersion = 'v3';
  f.restore();
  const restored = await f.read(up.services.platform);
  expect(restored.status).toBe('active');
  expect(restored.servicesSha256).toBe(up.servicesSha256);
});
for (const mode of [
  'foreignBgp',
  'foreignConnector',
  'connectorDevice',
  'hardwareUnknown',
  'ambiguous',
  'changeDuringRead',
  'peerMismatch',
  'retainedTamper',
] as const)
  test(`BGP service composition ${mode} rejects`, async () => {
    const f = bgpPowerFixture();
    let retained: Parameters<typeof collectAwsPowerBgpServices>[5];
    if (mode === 'retainedTamper') {
      retained = (await f.read()).services.platform;
      retained[0].bgpUid = 'foreign';
    }
    if (mode === 'foreignBgp') f.snapshot(f.wire.bgp.name).uid = 'foreign';
    if (mode === 'foreignConnector') f.snapshot('ce-gre-1').siteUid = 'foreign';
    if (mode === 'connectorDevice') {
      const spec = f.snapshot('ce-gre-1').spec as {
        gre: { gre_parameters: { tunnel_eps: Array<{ interface: string }> } };
      };
      spec.gre.gre_parameters.tunnel_eps[0].interface = 'ens5';
    }
    if (mode === 'peerMismatch') {
      const spec = f.snapshot(f.wire.bgp.name).spec as { peers: Array<{ external: { address: string } }> };
      spec.peers[0].external.address = '169.254.10.4';
    }
    if (mode === 'hardwareUnknown') f.hardwareUnknown();
    if (mode === 'ambiguous') f.ambiguous();
    if (mode === 'changeDuringRead') f.changeDuringRead();
    await expect(f.read(retained)).rejects.toThrow();
  });
