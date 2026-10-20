type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed GCP interface identity evidence');
  return value as Json;
}
export interface GcpExpectedNodeIdentity {
  project: string;
  zone: string;
  instanceId: string;
  nodeName: string;
  siteName: string;
  nics: Array<{ index: number; network: string; subnet: string; role: 'slo' | 'sli'; vrf: string }>;
}
export interface GcpPhysicalInterface {
  cloudNicIndex: number;
  role: 'slo' | 'sli';
  vrf: string;
  device: string;
  mac: string;
  source: 'owned-cloud-vm-and-site-registration';
}

/** Correlate exact owned VM, ONLINE registration and configured interfaces; guest names alone never authorize binding. */
export function correlateGcpPhysicalInterfaces(
  expected: GcpExpectedNodeIdentity,
  cloudValue: unknown,
  registrationValue: unknown,
  configurationValue: unknown,
): GcpPhysicalInterface[] {
  const cloud = object(cloudValue),
    registration = object(registrationValue),
    configuration = object(configurationValue);
  if (
    !/^\d+$/.test(expected.instanceId) ||
    cloud.id !== expected.instanceId ||
    cloud.name !== expected.nodeName ||
    cloud.zone !== `https://www.googleapis.com/compute/v1/projects/${expected.project}/zones/${expected.zone}`
  )
    throw new Error('Owned GCP VM identity mismatch');
  const metadata = object(configuration.metadata);
  if (metadata.name !== expected.siteName || metadata.namespace !== 'system')
    throw new Error('Exact GCP site configuration identity required');
  const spec = object(registration.get_spec),
    infra = object(spec.infra),
    passport = object(spec.passport);
  const status = object(object(registration.object).status);
  if (
    infra.provider !== 'GOOGLE' ||
    String(infra.instance_id) !== expected.instanceId ||
    infra.hostname !== expected.nodeName ||
    infra.availability_zone !== expected.zone ||
    passport.cluster_name !== expected.siteName ||
    status.current_state !== 'ONLINE'
  )
    throw new Error('Registration is not ONLINE for the exact owned GCP node');
  const nodes = object(object(object(configuration.spec).gcp).not_managed).node_list;
  if (!Array.isArray(nodes)) throw new Error('Missing configured GCP node inventory');
  const matches = nodes.map(object).filter((node) => node.hostname === expected.nodeName);
  if (matches.length !== 1) throw new Error('Exact configured GCP node must be unique');
  const configured = matches[0].interface_list;
  const hardware = object(infra.hw_info).network;
  const cloudNics = cloud.networkInterfaces;
  if (
    !Array.isArray(configured) ||
    !Array.isArray(hardware) ||
    !Array.isArray(cloudNics) ||
    configured.length !== expected.nics.length ||
    cloudNics.length !== expected.nics.length
  )
    throw new Error('GCP interface topology evidence is incomplete');
  const used = new Set<number>();
  const macs = new Set<string>();
  return configured
    .map((value) => {
      const nic = object(value),
        ethernet = object(nic.ethernet_interface),
        option = object(nic.network_option);
      if (
        typeof ethernet.device !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(ethernet.device) ||
        typeof ethernet.mac !== 'string' ||
        !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(ethernet.mac)
      )
        throw new Error('Configured device and MAC are required');
      const mac = ethernet.mac;
      if (macs.has(mac)) throw new Error('Duplicate configured MAC');
      macs.add(mac);
      const hw = hardware
        .map(object)
        .filter(
          (item) =>
            item.name === ethernet.device &&
            typeof item.mac_address === 'string' &&
            item.mac_address.toLowerCase() === mac,
        );
      if (hw.length !== 1 || !Array.isArray(hw[0].ip_address)) throw new Error('Device/MAC hardware join is ambiguous');
      const addresses = hw[0].ip_address.map((address) => (typeof address === 'string' ? address.split('/')[0] : ''));
      const indices = cloudNics
        .map(object)
        .flatMap((cloudNic, index) => (addresses.includes(String(cloudNic.networkIP)) ? [index] : []));
      if (indices.length !== 1 || used.has(indices[0])) throw new Error('Cloud address/NIC join is ambiguous');
      const index = indices[0],
        cloudNic = object(cloudNics[index]);
      const wanted = expected.nics.find((item) => item.index === index);
      if (
        !wanted ||
        cloudNic.name !== `nic${index}` ||
        cloudNic.network !== wanted.network ||
        cloudNic.subnetwork !== wanted.subnet
      )
        throw new Error('Cloud NIC network/subnet/order differs');
      const roleField = wanted.role === 'slo' ? 'site_local_network' : 'site_local_inside_network';
      if (
        Object.keys(option).length !== 1 ||
        !Object.hasOwn(option, roleField) ||
        nic.is_primary !== (index === 0) ||
        (wanted.role === 'slo') !== (index === 0)
      )
        throw new Error('Configured role/primary interface differs');
      used.add(index);
      return {
        cloudNicIndex: index,
        role: wanted.role,
        vrf: wanted.vrf,
        device: ethernet.device as string,
        mac,
        source: 'owned-cloud-vm-and-site-registration' as const,
      };
    })
    .sort((a, b) => a.cloudNicIndex - b.cloudNicIndex);
}
