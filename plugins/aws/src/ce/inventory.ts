import type { AwsExecApi } from '../aws/exec';
import { detectAwsError } from '../aws/exec';
import { scopedAwsApi } from './scoped-exec';

export interface AwsCeInventoryInput {
  accountId: string;
  awsProfile?: string;
  regions: string[];
}
type Json = Record<string, unknown>;
function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed AWS inventory evidence');
  return value as Json;
}
function string(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Malformed AWS inventory identity');
  return value;
}
const resourceId = /^(?:i|eni|subnet|vpc)-[0-9a-f]{8,21}$/;
const name = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
function tags(value: unknown): Map<string, string> {
  if (value === undefined) return new Map();
  if (!Array.isArray(value)) throw new Error('Malformed AWS inventory tags');
  const result = new Map<string, string>();
  for (const item of value) {
    const row = record(item);
    if (typeof row.Key !== 'string' || typeof row.Value !== 'string' || result.has(row.Key))
      throw new Error('Malformed AWS inventory tags');
    result.set(row.Key, row.Value);
  }
  return result;
}
async function pages(api: AwsExecApi, command: string, field: string, region: string): Promise<Json[]> {
  const result: Json[] = [];
  const tokens = new Set<string>();
  let token: string | undefined;
  do {
    const response = await api.exec('aws', [
      'ec2',
      command,
      '--region',
      region,
      '--no-paginate',
      '--max-results',
      '100',
      ...(token ? ['--next-token', token] : []),
      '--output',
      'json',
    ]);
    if (response.exitCode !== 0) throw detectAwsError(response.stderr, response.exitCode);
    let raw: Json;
    try {
      raw = record(JSON.parse(response.stdout));
    } catch {
      throw new Error('Malformed AWS inventory page');
    }
    if (!Array.isArray(raw[field])) throw new Error('Missing AWS inventory page collection');
    result.push(...raw[field].map(record));
    if (result.length > 100000) throw new Error('AWS inventory exceeded collection bound');
    if (
      raw.NextToken !== undefined &&
      (typeof raw.NextToken !== 'string' || !raw.NextToken || tokens.has(raw.NextToken))
    )
      throw new Error('AWS inventory pagination is incomplete');
    token = raw.NextToken as string | undefined;
    if (token) tokens.add(token);
    if (tokens.size > 10000) throw new Error('AWS inventory pagination exceeded bound');
  } while (token);
  return result;
}

export async function collectAwsCeInventory(input: AwsCeInventoryInput, executor: AwsExecApi, signal?: AbortSignal) {
  if (
    !/^\d{12}$/.test(input.accountId) ||
    !Array.isArray(input.regions) ||
    !input.regions.length ||
    input.regions.length > 40 ||
    input.regions.some((region) => !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) ||
    new Set(input.regions).size !== input.regions.length
  )
    throw new Error('Invalid AWS inventory scope');
  const api = scopedAwsApi(executor, input.awsProfile, signal);
  const identityResult = await api.exec('aws', ['sts', 'get-caller-identity', '--output', 'json']);
  if (identityResult.exitCode !== 0) throw detectAwsError(identityResult.stderr, identityResult.exitCode);
  const identity = record(JSON.parse(identityResult.stdout));
  if (identity.Account !== input.accountId) throw new Error('AWS inventory account differs from authenticated account');
  const collectedAt = new Date().toISOString();
  const nodes = [];
  for (const region of [...input.regions].sort()) {
    const reservations = await pages(api, 'describe-instances', 'Reservations', region);
    const instances = reservations.flatMap((reservation) => {
      if (!Array.isArray(reservation.Instances)) throw new Error('Malformed AWS reservation');
      return reservation.Instances.map(record);
    });
    const enis = await pages(api, 'describe-network-interfaces', 'NetworkInterfaces', region);
    const eniById = new Map<string, Json>();
    for (const eni of enis) {
      const id = string(eni.NetworkInterfaceId, resourceId);
      if (eniById.has(id)) throw new Error('Duplicate AWS interface identity');
      eniById.set(id, eni);
    }
    const instanceIds = new Set<string>();
    for (const instance of instances) {
      const id = string(instance.InstanceId, resourceId);
      if (instanceIds.has(id)) throw new Error('Duplicate AWS instance identity');
      instanceIds.add(id);
      const resourceTags = tags(instance.Tags);
      const site = resourceTags.get('ves-io-site-name');
      const managed = resourceTags.get('xcsh-managed-by') === 'aws-ce';
      if (!site && !managed) continue;
      const deployment = resourceTags.get('xcsh-deployment-id');
      const engine = resourceTags.get('xcsh-execution-engine');
      const owned =
        managed &&
        name.test(deployment ?? '') &&
        ['native', 'terraform'].includes(engine ?? '') &&
        /^[a-f0-9]{64}$/.test(resourceTags.get('xcsh-plan-sha256') ?? '');
      if (!Array.isArray(instance.NetworkInterfaces)) throw new Error('Missing CE interface attachment evidence');
      const indexes = new Set<number>();
      const macs = new Set<string>();
      const interfaces = instance.NetworkInterfaces.map((value) => {
        const attached = record(value);
        const eniId = string(attached.NetworkInterfaceId, resourceId);
        const eni = eniById.get(eniId);
        if (!eni) return { id: eniId, correlation: 'unavailable' as const };
        const attachment = record(eni.Attachment);
        const index = attachment.DeviceIndex;
        const mac = string(eni.MacAddress, /^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/).toLowerCase();
        if (
          attachment.InstanceId !== id ||
          !Number.isInteger(index) ||
          Number(index) < 0 ||
          indexes.has(Number(index)) ||
          macs.has(mac) ||
          (attached.MacAddress !== undefined && String(attached.MacAddress).toLowerCase() !== mac)
        )
          throw new Error('Ambiguous AWS CE attachment evidence');
        indexes.add(Number(index));
        macs.add(mac);
        return {
          id: eniId,
          correlation: 'instance-attachment-and-mac' as const,
          attachmentIndex: Number(index),
          mac,
          subnetId: string(eni.SubnetId, resourceId),
          vpcId: string(eni.VpcId, resourceId),
        };
      });
      const rawState = record(instance.State).Name;
      nodes.push({
        instanceId: id,
        accountId: input.accountId,
        region,
        siteName: site && name.test(site) ? site : null,
        siteBinding: site && name.test(site) ? 'cloud-tag-only' : 'unavailable',
        deploymentId: deployment && name.test(deployment) ? deployment : null,
        ownership: owned ? 'managed' : managed ? 'ambiguous' : 'unmanaged',
        engine: owned ? engine : null,
        state: ['pending', 'running', 'shutting-down', 'terminated', 'stopping', 'stopped'].includes(String(rawState))
          ? rawState
          : 'unknown',
        interfaces,
        platformRegistration: 'unknown',
        platformHealth: 'unknown',
      });
    }
  }
  return {
    schemaVersion: 2,
    kind: 'aws-ce-inventory',
    source: 'aws-cli-live',
    collectedAt,
    scope: {
      accountId: input.accountId,
      regions: [...input.regions].sort(),
      ...(input.awsProfile ? { awsProfile: input.awsProfile } : {}),
    },
    completeness: 'complete-for-requested-regions',
    selection: 'CE cloud ownership or site tags',
    nodes,
    counts: { instances: nodes.length, interfaces: nodes.reduce((sum, node) => sum + node.interfaces.length, 0) },
    platformEvidence: 'unavailable',
  };
}
