/** Pinned FRR 10.4.1 default-entrypoint layout verified in an isolated Linux namespace. */
export const relayCapabilities = [
  'NET_ADMIN',
  'NET_RAW',
  'SYS_ADMIN',
  'NET_BIND_SERVICE',
  'SETUID',
  'SETGID',
  'SETPCAP',
  'KILL',
  'CHOWN',
];
export const relayGroups = ['frr', 'frrvty'];
export const relayTmpfs = {
  '/var/run/frr': 'rw,nosuid,size=16m,mode=1777',
  '/tmp': 'rw,noexec,nosuid,size=16m',
  '/var/lib/frr': 'rw,nosuid,size=16m,mode=1777',
  '/var/tmp/frr': 'rw,nosuid,size=16m,mode=1777',
};
export const relayDaemons = ['mgmtd', 'zebra', 'bgpd', 'watchfrr', 'staticd'];
