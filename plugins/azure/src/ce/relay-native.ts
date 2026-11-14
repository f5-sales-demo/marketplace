import { renderAzureRelayCloudInit } from './relay-cloud-init';
import { type AzureRelayPlan, azureRelayOwnershipTags, verifyAzureRelayPlan } from './relay-plan';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
export interface AzureRelayNativeRequest {
  kind: 'relay-public-ip-create' | 'relay-nic-create' | 'relay-vm-create' | 'relay-peer-create';
  resourceId: string;
  apiVersion: string;
  body: Json;
  args: string[];
  dependsOn: string[];
}

function publicKey(value: string): string {
  if (typeof value !== 'string' || value.length > 8192 || /[\r\n]/.test(value))
    throw Error('Azure relay native: one SSH public key required');
  const match = /^(ssh-ed25519|ssh-rsa) ([A-Za-z0-9+/]+={0,2})(?: [^\r\n]+)?$/.exec(value);
  if (!match) throw Error('Azure relay native: unsupported or malformed SSH public key');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.toString('base64').replace(/=+$/, '') !== match[2].replace(/=+$/, ''))
    throw Error('Azure relay native: malformed SSH key encoding');
  let offset = 0;
  const field = () => {
    if (offset + 4 > bytes.length) throw Error('Azure relay native: truncated SSH key');
    const size = bytes.readUInt32BE(offset);
    offset += 4;
    if (size > bytes.length - offset) throw Error('Azure relay native: truncated SSH key');
    const result = bytes.subarray(offset, offset + size);
    offset += size;
    return result;
  };
  if (field().toString() !== match[1]) throw Error('Azure relay native: SSH key type differs');
  if (match[1] === 'ssh-ed25519') {
    if (field().length !== 32) throw Error('Azure relay native: invalid Ed25519 key length');
  } else {
    const exponent = field();
    const modulus = field();
    if (exponent.length < 1 || exponent.length > 8 || modulus.length < 256 || modulus.length > 1025)
      throw Error('Azure relay native: invalid RSA key size');
  }
  if (offset !== bytes.length) throw Error('Azure relay native: trailing SSH key data');
  return `${match[1]} ${match[2]}`;
}

/** Compile explicit ARM create requests. Execution must establish absence/ownership and checkpoint each resource before issuing these requests. */
export function compileAzureRelayNativeRequests(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  sshPublicKey: string,
): AzureRelayNativeRequest[] {
  verifyAzureRelayPlan(source, plan);
  if (plan.engine !== 'native' || source.subscription.cloud !== 'AzureCloud')
    throw Error('Azure relay native: native AzureCloud owner required');
  const key = publicKey(sshPublicKey);
  const tags = azureRelayOwnershipTags(source, plan);
  const actions: AzureRelayNativeRequest[] = [];
  const add = (
    kind: AzureRelayNativeRequest['kind'],
    resourceId: string,
    apiVersion: string,
    body: Json,
    dependsOn: string[],
  ) => {
    actions.push({
      kind,
      resourceId,
      apiVersion,
      body,
      dependsOn,
      args: [
        'rest',
        '--method',
        'put',
        '--url',
        `https://management.azure.com${resourceId}?api-version=${apiVersion}`,
        '--subscription',
        plan.subscriptionId,
        '--body',
        JSON.stringify(body),
        '--output',
        'json',
      ],
    });
  };
  for (const relay of plan.relays) {
    if (relay.publicIpId)
      add(
        'relay-public-ip-create',
        relay.publicIpId,
        '2024-05-01',
        {
          location: plan.region,
          tags,
          sku: { name: 'Standard' },
          properties: { publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4' },
        },
        [],
      );
    add(
      'relay-nic-create',
      relay.nicId,
      '2024-05-01',
      {
        location: plan.region,
        tags,
        properties: {
          enableIPForwarding: true,
          enableAcceleratedNetworking: false,
          ipConfigurations: [
            {
              name: 'ipconfig1',
              properties: {
                primary: true,
                privateIPAddressVersion: 'IPv4',
                privateIPAllocationMethod: 'Static',
                privateIPAddress: relay.privateAddress,
                subnet: { id: relay.subnetId },
                ...(relay.publicIpId ? { publicIPAddress: { id: relay.publicIpId } } : {}),
              },
            },
          ],
        },
      },
      [relay.subnetId, ...(relay.publicIpId ? [relay.publicIpId] : [])],
    );
    const customData = renderAzureRelayCloudInit(source, plan, relay.name);
    if (Buffer.byteLength(customData) > 65535)
      throw Error('Azure relay native: cloud-init exceeds ARM customData limit');
    add(
      'relay-vm-create',
      relay.vmId,
      '2024-07-01',
      {
        location: plan.region,
        tags,
        properties: {
          hardwareProfile: { vmSize: plan.vmSize },
          storageProfile: {
            imageReference: {
              publisher: plan.hostImage.publisher,
              offer: plan.hostImage.offer,
              sku: plan.hostImage.sku,
              version: plan.hostImage.version,
            },
            osDisk: {
              name: relay.osDiskName,
              createOption: 'FromImage',
              caching: 'ReadWrite',
              managedDisk: { storageAccountType: 'StandardSSD_LRS' },
              deleteOption: 'Delete',
            },
          },
          osProfile: {
            computerName: relay.name,
            adminUsername: 'xcsh',
            customData: Buffer.from(customData).toString('base64'),
            linuxConfiguration: {
              disablePasswordAuthentication: true,
              provisionVMAgent: true,
              ssh: { publicKeys: [{ path: '/home/xcsh/.ssh/authorized_keys', keyData: key }] },
            },
          },
          networkProfile: {
            networkInterfaces: [{ id: relay.nicId, properties: { primary: true, deleteOption: 'Detach' } }],
          },
        },
      },
      [relay.nicId],
    );
    add(
      'relay-peer-create',
      `${plan.routeServerId}/bgpConnections/${relay.name}`,
      '2024-05-01',
      { properties: { peerAsn: relay.asn, peerIp: relay.privateAddress } },
      [plan.routeServerId, relay.nicId, relay.vmId],
    );
  }
  return actions;
}
