import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256, sha256Hex } from './canonical';
import { normalizeAwsAdminSshPublicKey } from './initial-admin';
import type { AwsCeBootstrapKeyPair, AwsCeIntent, AwsCeObservation, AwsCePlan } from './types';

export function normalizeAwsBootstrapKeyPairName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 255 ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error('An exact EC2 bootstrap key-pair name is required');
  }
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed EC2 key-pair evidence');
  return Object.fromEntries(Object.entries(value));
}

export function parseAwsBootstrapKeyPairs(
  value: unknown,
  region: string,
  requested: string[],
): AwsCeBootstrapKeyPair[] {
  const data = object(value);
  if (
    !Array.isArray(data.KeyPairs) ||
    data.KeyPairs.length !== requested.length ||
    ['NextToken', 'NextMarker', 'nextToken', 'errors'].some((name) => data[name] !== undefined)
  ) {
    throw new Error('Complete EC2 bootstrap key-pair evidence is required');
  }
  const names = new Set<string>();
  const ids = new Set<string>();
  const result: AwsCeBootstrapKeyPair[] = [];
  for (const input of data.KeyPairs) {
    const row = object(input);
    const name = normalizeAwsBootstrapKeyPairName(row.KeyName);
    if (
      !requested.includes(name) ||
      names.has(name) ||
      typeof row.KeyPairId !== 'string' ||
      !/^key-[a-f0-9]{8,21}$/.test(row.KeyPairId) ||
      ids.has(row.KeyPairId)
    ) {
      throw new Error('Foreign, duplicate or unresolved EC2 bootstrap key-pair identity');
    }
    const publicKey = normalizeAwsAdminSshPublicKey(row.PublicKey);
    if (
      !['rsa', 'ed25519'].includes(String(row.KeyType)) ||
      (row.KeyType === 'rsa' ? !publicKey.startsWith('ssh-rsa ') : !publicKey.startsWith('ssh-ed25519 '))
    ) {
      throw new Error('EC2 bootstrap key-pair algorithm evidence differs');
    }
    names.add(name);
    ids.add(row.KeyPairId);
    result.push({ name, id: row.KeyPairId, region, publicKeySha256: sha256Hex(publicKey) });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function observeAwsBootstrapKeyPairs(
  api: AwsExecApi,
  region: string,
  requested: string[],
): Promise<AwsCeBootstrapKeyPair[]> {
  if (
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region) ||
    requested.length !== 1 ||
    new Set(requested).size !== requested.length
  )
    throw new Error('One region-bound EC2 bootstrap key-pair reference is required');
  requested.forEach(normalizeAwsBootstrapKeyPairName);
  const reply = await api.exec('aws', [
    'ec2',
    'describe-key-pairs',
    '--include-public-key',
    '--cli-input-json',
    JSON.stringify({ KeyNames: requested }),
    '--region',
    region,
    '--output',
    'json',
  ]);
  if (reply.exitCode !== 0) throw new Error('EC2 bootstrap key-pair reference is unavailable or unauthorized');
  return parseAwsBootstrapKeyPairs(JSON.parse(reply.stdout), region, requested);
}

export function selectAwsBootstrapKeyPair(
  intent: AwsCeIntent,
  observation: AwsCeObservation,
): AwsCeBootstrapKeyPair | undefined {
  const name = intent.instance.bootstrapKeyPairName;
  if (name === undefined || !['deploy', 'replace-node', 'repair'].includes(intent.operation)) return undefined;
  normalizeAwsBootstrapKeyPairName(name);
  if (observation.identity.accountId !== intent.accountId || observation.identity.partition !== intent.partition) {
    throw new Error('EC2 bootstrap key-pair account binding differs');
  }
  if (!Array.isArray(observation.bootstrapKeyPairs) || observation.bootstrapKeyPairs.length !== 1)
    throw new Error('Complete unambiguous EC2 bootstrap key-pair evidence is required');
  const selected = observation.bootstrapKeyPairs.filter((row) => row.name === name && row.region === intent.region);
  if (
    selected?.length !== 1 ||
    !/^key-[a-f0-9]{8,21}$/.test(selected[0].id) ||
    !/^[a-f0-9]{64}$/.test(selected[0].publicKeySha256)
  ) {
    throw new Error('EC2 bootstrap key-pair identity is missing, malformed or ambiguous');
  }
  return structuredClone(selected[0]);
}

export function assertAwsBootstrapKeyPair(plan: AwsCePlan, current?: AwsCeObservation): void {
  const name = plan.intent.instance.bootstrapKeyPairName;
  const reference = plan.bootstrapKeyPair;
  if (name === undefined) {
    if (reference !== undefined) throw new Error('Unrequested EC2 bootstrap key-pair binding');
    return;
  }
  normalizeAwsBootstrapKeyPairName(name);
  if (!['deploy', 'replace-node', 'repair'].includes(plan.intent.operation) && reference === undefined) return;
  if (
    !reference ||
    reference.name !== name ||
    reference.region !== plan.region ||
    !/^key-[a-f0-9]{8,21}$/.test(reference.id) ||
    !/^[a-f0-9]{64}$/.test(reference.publicKeySha256)
  ) {
    throw new Error('EC2 bootstrap key-pair plan binding differs');
  }
  if (current && canonicalSha256(reference) !== canonicalSha256(selectAwsBootstrapKeyPair(plan.intent, current))) {
    throw new Error('EC2 bootstrap key-pair identity or public key changed before execution');
  }
}

/** Recheck a borrowed boot-key reference immediately before replacement creates a VM. */
export async function revalidateAwsBootstrapKeyPair(plan: AwsCePlan, api: AwsExecApi): Promise<void> {
  assertAwsBootstrapKeyPair(plan);
  if (!plan.bootstrapKeyPair) return;
  const response = await api.exec('aws', ['sts', 'get-caller-identity', '--output', 'json']);
  if (response.exitCode !== 0) throw new Error('EC2 bootstrap key-pair caller identity is unavailable');
  const identity = object(JSON.parse(response.stdout));
  if (
    identity.Account !== plan.accountId ||
    typeof identity.Arn !== 'string' ||
    !identity.Arn.startsWith(`arn:${plan.partition}:`)
  )
    throw new Error('EC2 bootstrap key-pair caller account changed');
  const keys = await observeAwsBootstrapKeyPairs(api, plan.region, [plan.bootstrapKeyPair.name]);
  if (keys.length !== 1 || canonicalSha256(keys[0]) !== canonicalSha256(plan.bootstrapKeyPair)) {
    throw new Error('EC2 bootstrap key-pair identity or public key changed before VM creation');
  }
}
