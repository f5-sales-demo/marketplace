import { isIP } from 'node:net';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { azureRelayResourceSource } from './relay-replacement-plan';
import type { AzureCePlan } from './types';

export interface AzureRelayRetainedNic {
  resourceId: string;
  subnetId: string;
  mac: string;
  privateIp: string;
  ownerPlanSha256: string;
}
const require = (value: unknown, message: string): void => {
  if (!value) throw Error(`Azure relay replacement identity: ${message}`);
};
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed cloud record');
  return value as Record<string, unknown>;
};
const unicastMac = (value: unknown) =>
  typeof value === 'string' &&
  /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(value) &&
  (Number.parseInt(value.slice(0, 2), 16) & 1) === 0 &&
  value !== '00:00:00:00:00:00';

const usableSubnetAddress = (address: string, cidr: string | undefined) => {
  if (isIP(address) !== 4 || typeof cidr !== 'string') return false;
  const [network, prefix, extra] = cidr.split('/');
  if (extra !== undefined || isIP(network) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix)) return false;
  const number = (value: string) => value.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  const size = 2 ** (32 - Number(prefix));
  return (
    size >= 8 &&
    number(network) % size === 0 &&
    number(address) > number(network) + 3 &&
    number(address) < number(network) + size - 1
  );
};

export function validAzureRelayRetainedNics(plan: AzureCePlan, value: Record<string, AzureRelayRetainedNic>): boolean {
  return (
    plan.relayProfile?.schemaVersion === 2 && validAzureRetainedNicsForSource(azureRelayResourceSource(plan), value)
  );
}

/** Read-only retained joins against the exact original creation; does not widen any mutation contract. */
export function validAzureRetainedNicsForSource(
  original: AzureCePlan,
  value: Record<string, AzureRelayRetainedNic>,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actions = original.actions.filter((action) => action.kind === 'nic-create');
  const keys = actions.map((action) => `${action.node}:${action.resourceId?.match(/-nic([0-9]+)$/)?.[1]}`);
  if (
    actions.length !== original.topology.nodeCount * original.nics.length ||
    Object.keys(value).sort().join(',') !== keys.sort().join(',') ||
    new Set(Object.values(value).map((row) => row.mac)).size !== actions.length
  )
    return false;
  return actions.every((action) => {
    const index = Number(action.resourceId?.match(/-nic([0-9]+)$/)?.[1]);
    const row = value[`${action.node}:${index}`];
    const nic = original.nics.find((item) => item.index === index);
    const subnet = original.actions.find(
      (item) => item.kind === 'subnet-create' && item.args?.[item.args.indexOf('--name') + 1] === nic?.subnet.name,
    );
    return (
      row &&
      Object.keys(row).sort().join(',') === 'mac,ownerPlanSha256,privateIp,resourceId,subnetId' &&
      typeof row.resourceId === 'string' &&
      lower(row.resourceId) === lower(action.resourceId) &&
      typeof row.subnetId === 'string' &&
      lower(row.subnetId) === lower(subnet?.resourceId) &&
      row.ownerPlanSha256 === original.planSha256 &&
      unicastMac(row.mac) &&
      usableSubnetAddress(row.privateIp, nic?.subnet.cidr)
    );
  });
}

/** Freeze retained MAC, address, subnet and VM attachment before selected-node replacement. */
export async function captureAzureRelayRetainedNics(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  verifyAzureCePlan(plan);
  require(plan.relayProfile?.schemaVersion === 2, 'exact relay replacement required');
  return captureAzureRetainedNicsForSource(azureRelayResourceSource(plan), api, signal);
}

/** Read-only capture against an explicitly verified original creation. Relay mutation guards stay intact. */
export async function captureAzureRetainedNicsForSource(original: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  verifyAzureCePlan(original);
  require(original.intent.operation === 'deploy', 'original creation required');
  const plan = original;
  const result: Record<string, AzureRelayRetainedNic> = {};
  for (const action of original.actions.filter((item) => item.kind === 'nic-create')) {
    signal?.throwIfAborted();
    const raw = await api.exec(
      'az',
      [
        'network',
        'nic',
        'show',
        '--ids',
        action.resourceId as string,
        '--subscription',
        plan.subscription.id,
        '--output',
        'json',
      ],
      signal ? { signal } : undefined,
    );
    signal?.throwIfAborted();
    require(raw.exitCode === 0, 'cloud NIC read unavailable');
    const value = object(JSON.parse(raw.stdout));
    const tags = object(value.tags);
    const vm = original.actions.find((item) => item.kind === 'vm-create' && item.node === action.node);
    require(value.provisioningState === 'Succeeded' &&
      lower(value.location) === lower(plan.region) &&
      lower(value.id) === lower(action.resourceId) &&
      lower(object(value.virtualMachine).id) === lower(vm?.resourceId) &&
      tags['xcsh-managed-by'] === 'azure-ce' &&
      tags['xcsh-execution-engine'] === plan.engine &&
      tags['xcsh-deployment-id'] === plan.deploymentName &&
      tags['xcsh-plan-sha256'] === original.planSha256 &&
      !['nextLink', 'error', 'errors'].some((key) => value[key]), 'retained NIC identity or owner differs');
    require(Array.isArray(value.ipConfigurations) &&
      value.ipConfigurations.length === 1, 'one exact retained IP configuration required');
    const config = object((value.ipConfigurations as unknown[])[0]);
    require(config.privateIPAddressVersion === 'IPv4', 'retained IPv4 configuration required');
    const index = action.resourceId?.match(/-nic([0-9]+)$/)?.[1];
    result[`${action.node}:${index}`] = {
      resourceId: String(value.id),
      subnetId: String(object(config.subnet).id),
      mac: lower(value.macAddress).replaceAll('-', ':'),
      privateIp: String(config.privateIPAddress),
      ownerPlanSha256: original.planSha256,
    };
  }
  require(validAzureRetainedNicsForSource(original, result), 'complete distinct retained NIC joins required');
  return result;
}
