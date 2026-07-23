import type { AwsBucket, AwsEc2Instance, AwsIdentity, AwsS3Object } from './types';

// ---------------------------------------------------------------------------
// Normalizers (raw aws JSON -> typed structs)
// ---------------------------------------------------------------------------

export function normalizeIdentity(raw: Record<string, unknown>): AwsIdentity {
  return {
    Account: String(raw.Account ?? ''),
    Arn: String(raw.Arn ?? ''),
    UserId: String(raw.UserId ?? ''),
  };
}

export function normalizeBucket(raw: Record<string, unknown>): AwsBucket {
  return {
    name: String(raw.Name ?? ''),
    creationDate: String(raw.CreationDate ?? ''),
  };
}

export function normalizeInstance(raw: Record<string, unknown>): AwsEc2Instance {
  const state = (raw.State as Record<string, unknown>) ?? {};
  const placement = (raw.Placement as Record<string, unknown>) ?? {};
  const tags = (raw.Tags as Array<Record<string, unknown>>) ?? [];
  const nameTag = tags.find((t) => String(t.Key ?? '') === 'Name');
  return {
    instanceId: String(raw.InstanceId ?? ''),
    state: String(state.Name ?? ''),
    type: String(raw.InstanceType ?? ''),
    az: String(placement.AvailabilityZone ?? ''),
    privateIp: String(raw.PrivateIpAddress ?? ''),
    publicIp: String(raw.PublicIpAddress ?? ''),
    name: nameTag ? String(nameTag.Value ?? '') : '',
  };
}

/**
 * Flatten the `Reservations[].Instances[]` shape returned by
 * `aws ec2 describe-instances` into a flat list of typed instances.
 */
export function normalizeReservations(raw: Record<string, unknown>): AwsEc2Instance[] {
  const reservations = (raw.Reservations as Array<Record<string, unknown>>) ?? [];
  const out: AwsEc2Instance[] = [];
  for (const reservation of reservations) {
    const instances = (reservation.Instances as Array<Record<string, unknown>>) ?? [];
    for (const inst of instances) out.push(normalizeInstance(inst));
  }
  return out;
}

/**
 * Parse the text output of `aws s3 ls s3://bucket/prefix/` into typed objects.
 * Data lines look like: `2021-01-01 12:00:00       1234 file.txt`
 * Common-prefix ("directory") lines look like: `                           PRE sub/`
 */
export function parseS3LsOutput(raw: string): AwsS3Object[] {
  const out: AwsS3Object[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    if (trimmed.startsWith('PRE ')) {
      out.push({ key: trimmed.slice(4).trim(), size: 0, lastModified: '' });
      continue;
    }

    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(\d+)\s+(.+)$/);
    if (match) {
      out.push({ key: match[3], size: Number(match[2]), lastModified: match[1] });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatters (typed structs -> markdown)
// ---------------------------------------------------------------------------

export function formatIdentityDetail(identity: AwsIdentity): string {
  return [
    `**Account:** ${identity.Account || '-'}`,
    `**ARN:** ${identity.Arn || '-'}`,
    `**User ID:** ${identity.UserId || '-'}`,
  ].join('\n');
}

export function formatBucketTable(buckets: AwsBucket[]): string {
  if (buckets.length === 0) return 'No buckets found.';
  const header = '| Name | Creation Date |';
  const sep = '|------|---------------|';
  const rows = buckets.map((b) => `| ${b.name} | ${b.creationDate || '-'} |`);
  return [header, sep, ...rows].join('\n');
}

export function formatS3ObjectTable(objects: AwsS3Object[]): string {
  if (objects.length === 0) return 'No objects found.';
  const header = '| Key | Size | Last Modified |';
  const sep = '|-----|------|---------------|';
  const rows = objects.map((o) => `| ${o.key} | ${o.size} | ${o.lastModified || '-'} |`);
  return [header, sep, ...rows].join('\n');
}

export function formatInstanceTable(instances: AwsEc2Instance[]): string {
  if (instances.length === 0) return 'No instances found.';
  const header = '| Instance ID | Name | State | Type | AZ | Private IP | Public IP |';
  const sep = '|-------------|------|-------|------|-----|------------|-----------|';
  const rows = instances.map(
    (i) =>
      `| ${i.instanceId} | ${i.name || '-'} | ${i.state} | ${i.type} | ${i.az} | ${i.privateIp || '-'} | ${i.publicIp || '-'} |`,
  );
  return [header, sep, ...rows].join('\n');
}
