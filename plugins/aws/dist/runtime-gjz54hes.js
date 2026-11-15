// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import { AwsExecError } from './runtime-30f0rzjf.js';

// plugins/aws/src/aws/formatters.ts
function normalizeIdentity(raw) {
  return {
    Account: String(raw.Account ?? ''),
    Arn: String(raw.Arn ?? ''),
    UserId: String(raw.UserId ?? ''),
  };
}
function normalizeBucket(raw) {
  return {
    name: String(raw.Name ?? ''),
    creationDate: String(raw.CreationDate ?? ''),
  };
}
function normalizeInstance(raw) {
  const state = raw.State ?? {};
  const placement = raw.Placement ?? {};
  const tags = raw.Tags ?? [];
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
function normalizeReservations(raw) {
  const reservations = raw.Reservations ?? [];
  const out = [];
  for (const reservation of reservations) {
    const instances = reservation.Instances ?? [];
    for (const inst of instances) out.push(normalizeInstance(inst));
  }
  return out;
}
function parseS3LsOutput(raw) {
  const out = [];
  for (const line of raw.split(`
`)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const prefix = line.match(/^\s*PRE (.+)$/);
    if (prefix) {
      out.push({ key: prefix[1], size: null, lastModified: '' });
      continue;
    }
    const match = line.match(/^\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(\d+) (.+)$/);
    if (match) {
      out.push({
        key: match[3],
        size: Number.isSafeInteger(Number(match[2])) ? Number(match[2]) : match[2],
        lastModified: match[1],
      });
    } else {
      throw new AwsExecError(`Malformed S3 listing; complete results cannot be verified.
${raw}`);
    }
  }
  return out;
}
function formatIdentityDetail(identity) {
  return [
    `**Account:** ${identity.Account || '-'}`,
    `**ARN:** ${identity.Arn || '-'}`,
    `**User ID:** ${identity.UserId || '-'}`,
  ].join(`
`);
}
function formatBucketTable(buckets) {
  if (buckets.length === 0) return 'No buckets found.';
  const header = '| Name | Creation Date |';
  const sep = '|------|---------------|';
  const rows = buckets.map((b) => `| ${b.name} | ${b.creationDate || '-'} |`);
  return [header, sep, ...rows].join(`
`);
}
function formatS3ObjectTable(objects) {
  if (objects.length === 0) return 'No objects found.';
  const header = '| Key | Size | Last Modified |';
  const sep = '|-----|------|---------------|';
  const rows = objects.map((o) => `| ${o.key} | ${o.size ?? 'Not applicable (prefix)'} | ${o.lastModified || '-'} |`);
  return [header, sep, ...rows].join(`
`);
}
function formatInstanceTable(instances) {
  if (instances.length === 0) return 'No instances found.';
  const header = '| Instance ID | Name | State | Type | AZ | Private IP | Public IP |';
  const sep = '|-------------|------|-------|------|-----|------------|-----------|';
  const rows = instances.map(
    (i) =>
      `| ${i.instanceId} | ${i.name || '-'} | ${i.state} | ${i.type} | ${i.az} | ${i.privateIp || '-'} | ${i.publicIp || '-'} |`,
  );
  return [header, sep, ...rows].join(`
`);
}

export {
  formatBucketTable,
  formatIdentityDetail,
  formatInstanceTable,
  formatS3ObjectTable,
  normalizeBucket,
  normalizeIdentity,
  normalizeReservations,
  parseS3LsOutput,
};
