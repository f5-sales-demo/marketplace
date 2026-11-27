import { fingerprint } from './discovery';
import { type GcpResourceIdentity, validateGcpResourceIdentity } from './ownership';
import { validateScope } from './validation';
export interface GcpNatIntent {
  schemaVersion: 1;
  project: string;
  region: string;
  deploymentName: string;
  engine: 'native' | 'terraform';
  routerName: string;
  natName: string;
  network: GcpResourceIdentity;
  sloSubnet: GcpResourceIdentity;
  observedSubnetNetwork: string;
  egressFirewallVerified: boolean;
}
/** NAT covers only the explicitly owned SLO subnet; public IP removal requires coupled VM planning. */
export function planGcpCloudNat(intent: GcpNatIntent) {
  validateScope(intent.project, intent.region);
  if (intent.schemaVersion !== 1 || !['native', 'terraform'].includes(intent.engine))
    throw new Error('Invalid NAT intent');
  for (const name of [intent.deploymentName, intent.routerName, intent.natName])
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid NAT resource name');
  for (const resource of [intent.network, intent.sloSubnet]) {
    validateGcpResourceIdentity(resource);
    if (
      resource.project !== intent.project ||
      resource.deploymentName !== intent.deploymentName ||
      resource.engine !== intent.engine
    )
      throw new Error('NAT ownership differs');
  }
  if (
    intent.network.kind !== 'network' ||
    intent.sloSubnet.kind !== 'subnetwork' ||
    !intent.sloSubnet.selfLink.includes(`/regions/${intent.region}/`) ||
    intent.observedSubnetNetwork !== intent.network.selfLink
  )
    throw new Error('NAT subnet/network/region identity differs');
  if (intent.egressFirewallVerified !== true) throw new Error('NAT requires separately verified egress firewall path');
  const subnetName = intent.sloSubnet.selfLink.split('/').at(-1);
  const scope = [`--project=${intent.project}`, `--region=${intent.region}`];
  const actions = [
    {
      id: `router-${intent.routerName}`,
      argv: [
        'compute',
        'routers',
        'create',
        intent.routerName,
        ...scope,
        `--network=${intent.network.selfLink}`,
        '--async',
        '--quiet',
        '--format=json',
      ],
      dependencies: [],
    },
    {
      id: `nat-${intent.natName}`,
      argv: [
        'compute',
        'routers',
        'nats',
        'create',
        intent.natName,
        ...scope,
        `--router=${intent.routerName}`,
        '--auto-allocate-nat-external-ips',
        `--nat-custom-subnet-ip-ranges=${subnetName}`,
        '--quiet',
        '--format=json',
      ],
      dependencies: [`router-${intent.routerName}`],
    },
  ];
  const routerKey = intent.routerName.replaceAll('-', '_');
  const resources = {
    google_compute_router: {
      [routerKey]: {
        name: intent.routerName,
        project: intent.project,
        region: intent.region,
        network: intent.network.selfLink,
      },
    },
    google_compute_router_nat: {
      [intent.natName.replaceAll('-', '_')]: {
        name: intent.natName,
        project: intent.project,
        region: intent.region,
        router: `\${google_compute_router.${routerKey}.name}`,
        nat_ip_allocate_option: 'AUTO_ONLY',
        source_subnetwork_ip_ranges_to_nat: 'LIST_OF_SUBNETWORKS',
        subnetwork: [{ name: intent.sloSubnet.selfLink, source_ip_ranges_to_nat: ['PRIMARY_IP_RANGE'] }],
      },
    },
  };
  return {
    schemaVersion: 1,
    engine: intent.engine,
    executable: false,
    actions: intent.engine === 'native' ? actions : [],
    resources: intent.engine === 'terraform' ? resources : {},
    required: [
      'exact reviewed cost and resource inventory',
      'router operation reconciliation',
      'NAT egress observed from CE',
      'bootstrap and registration health',
      'owned NAT/router teardown',
    ],
    sha256: fingerprint(intent),
  };
}
