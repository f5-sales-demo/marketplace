import { expect, it } from 'bun:test';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import { projectGcpOperationalSiteStatus } from '../../src/ce/gcp-operational-site-status';

const expected = {
  siteName: 'site-a',
  runtimeIdentitySha256: fingerprint({ uid: 'runtime-id' }),
  nodeName: 'node-a',
  role: 'control-a',
  devices: ['ens4', 'ens5'] as [string, string],
  addresses: ['192.0.2.1', '198.51.100.1'] as [string, string],
};
function fixture() {
  return {
    metadata: { name: 'site-a' },
    system_metadata: { uid: 'runtime-id' },
    status: [
      { node_info: { hostname: 'node-a', role: ['k8s-master-primary'] } },
      {
        metadata: { status_id: 'node-a_SiteStatusMgr', creator_class: 'ver', creator_id: 'site-a', vtrp_stale: false },
        ver_status: {
          ver_instance_name: 'node-a-site-a',
          running_state_status: { state: 'OPERATIONAL_READY' },
          intf_status: expected.devices.map((name, index) => ({
            name,
            ip: { ipv4: { prefix: expected.addresses[index], plen: 24 } },
            network_type: index === 0 ? 'VIRTUAL_NETWORK_SITE_LOCAL' : 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE',
            link_state: true,
            active_state: 'STATE_ACTIVE',
          })),
        },
      },
    ],
  };
}
it('joins the runtime object, selected node and both physical interfaces with sanitized state', () => {
  expect(projectGcpOperationalSiteStatus(fixture(), expected)).toEqual({
    role: 'control-a',
    runtimeIdentitySha256: expected.runtimeIdentitySha256,
    verState: 'OPERATIONAL_READY',
    interfacesUp: [true, true],
  });
});
it('preserves a known inactive interface and rejects identity, role, stale and duplicate status drift', () => {
  const down = fixture();
  down.status[1].ver_status!.intf_status[0].link_state = false;
  expect(projectGcpOperationalSiteStatus(down, expected).interfacesUp).toEqual([false, true]);
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.system_metadata.uid = 'replacement';
    },
    (f: ReturnType<typeof fixture>) => {
      f.status[0].node_info!.role = ['worker'];
    },
    (f: ReturnType<typeof fixture>) => {
      f.status[1].metadata!.vtrp_stale = true;
    },
    (f: ReturnType<typeof fixture>) => {
      f.status.push(f.status[1]);
    },
    (f: ReturnType<typeof fixture>) => {
      f.status[1].ver_status!.intf_status[0].ip.ipv4.prefix = '192.0.2.99';
    },
  ]) {
    const f = fixture();
    change(f);
    expect(() => projectGcpOperationalSiteStatus(f, expected)).toThrow();
  }
});
