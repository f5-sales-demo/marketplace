import type { AzExecApi } from '../az/exec';
import { type AzureRelayPlan, azureRelayOwnershipTags, verifyAzureRelayPlan } from './relay-plan';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay identity: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed observation');
  return value as Json;
};
const id = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const sameId = (a: unknown, b: string) => id(a) === b.toLowerCase();

/** Re-read exact owned relay cloud resources; this does not qualify FRR or CE telemetry freshness. */
export async function observeAzureRelayIdentity(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  verifyAzureRelayPlan(source, plan);
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const expectedTags = azureRelayOwnershipTags(source, plan);
  const read = async (args: string[], expectedId: string, relay: boolean, located: boolean) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    let raw: Awaited<ReturnType<AzExecApi['exec']>>;
    try {
      raw = await Promise.race([
        api.exec(
          'az',
          [...args, 'show', '--ids', expectedId, '--subscription', plan.subscriptionId, '--output', 'json'],
          { signal: deadline },
        ),
        abort.promise,
      ]);
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
    deadline.throwIfAborted();
    require(raw.exitCode === 0, 'cloud read unavailable');
    let response: unknown;
    try {
      response = JSON.parse(raw.stdout);
    } catch {
      throw Error('Azure relay identity: malformed JSON');
    }
    const value = object(response);
    require(sameId(value.id, expectedId) &&
      value.provisioningState === 'Succeeded' &&
      !['nextLink', 'nextPageToken', 'error', 'errors', 'NextToken'].some(
        (key) => value[key],
      ), 'incomplete resource identity or provisioning');
    if (located) require(value.location === plan.region, 'resource region differs');
    if (relay || expectedId === plan.vnetId) {
      const tags = object(value.tags);
      for (const [key, expected] of Object.entries(expectedTags))
        if (relay || key !== 'xcsh-relay-plan-sha256') require(tags[key] === expected, 'resource owner differs');
    }
    return value;
  };
  await read(['network', 'vnet'], plan.vnetId, false, true);
  const subnet = await read(['network', 'vnet', 'subnet'], plan.sloSubnetId, false, false);
  const prefixes = typeof subnet.addressPrefix === 'string' ? [subnet.addressPrefix] : subnet.addressPrefixes;
  require(Array.isArray(prefixes) &&
    prefixes.length === 1 &&
    prefixes[0] === plan.sloCidr, 'SLO subnet prefix differs');
  const relays = [];
  const macs = new Set<string>();
  for (const relay of plan.relays) {
    const vm = await read(['vm'], relay.vmId, true, true);
    require(object(vm.hardwareProfile).vmSize === plan.vmSize, 'VM size differs');
    const storage = object(vm.storageProfile);
    const disk = object(storage.osDisk);
    require(disk.name === relay.osDiskName &&
      sameId(object(disk.managedDisk).id, relay.osDiskId), 'OS disk attachment differs');
    const image = object(storage.imageReference);
    for (const key of ['publisher', 'offer', 'sku'] as const)
      require(id(image[key]) === plan.hostImage[key].toLowerCase(), 'host image differs');
    require(image.version === plan.hostImage.version &&
      (image.exactVersion === undefined ||
        image.exactVersion === plan.hostImage.version), 'host image version is unresolved or differs');
    const references = object(vm.networkProfile).networkInterfaces;
    require(Array.isArray(references) &&
      references.length === 1 &&
      sameId(object(references[0]).id, relay.nicId), 'VM attachment is incomplete or duplicated');
    const nic = await read(['network', 'nic'], relay.nicId, true, true);
    require(sameId(object(nic.virtualMachine).id, relay.vmId) &&
      nic.enableIPForwarding === true, 'NIC owner or forwarding differs');
    const rawMac = typeof nic.macAddress === 'string' ? nic.macAddress.toLowerCase() : '';
    require(/^(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}$/.test(rawMac), 'NIC MAC unavailable');
    const mac = rawMac.replaceAll('-', ':');
    require((Number.parseInt(mac.slice(0, 2), 16) & 1) === 0 &&
      mac !== '00:00:00:00:00:00' &&
      !macs.has(mac), 'NIC MAC is not distinct unicast identity');
    macs.add(mac);
    const configs = nic.ipConfigurations;
    require(Array.isArray(configs) && configs.length === 1, 'NIC IP configuration missing or duplicated');
    const ip = object((configs as unknown[])[0]);
    require(sameId(ip.id, relay.ipConfigurationId) &&
      ip.name === 'ipconfig1' &&
      (ip.primary === true || ip.primary === undefined) &&
      ip.privateIPAddressVersion === 'IPv4' &&
      ip.privateIPAllocationMethod === 'Static' &&
      ip.privateIPAddress === relay.privateAddress &&
      sameId(object(ip.subnet).id, relay.subnetId), 'NIC IP configuration identity differs');
    relays.push({
      name: relay.name,
      vmId: relay.vmId,
      nicId: relay.nicId,
      osDiskId: relay.osDiskId,
      ipConfigurationId: relay.ipConfigurationId,
      subnetId: relay.subnetId,
      mac,
      address: relay.privateAddress,
      asn: relay.asn,
    });
  }
  deadline.throwIfAborted();
  return {
    status: 'observed' as const,
    source: 'azure-cli-current-identity' as const,
    planId: plan.planId,
    planSha256: plan.planSha256,
    sourcePlanSha256: source.planSha256,
    engine: plan.engine,
    relays,
    observedAt: new Date().toISOString(),
    routing: 'unknown' as const,
    software: 'unknown' as const,
    traffic: 'unknown' as const,
    ceSampleFreshnessQualified: false as const,
  };
}
