import type { AwsExecApi } from '../aws/exec';
import type { AwsCePlan } from './types';

type Row = Record<string, unknown>;
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Native owner inventory is malformed');
  return value as Row;
};

/** Complete regional owner-tag evidence for a reviewed native plan with no cloud actions. */
export async function collectAwsNativeEmptyCloudInventory(api: AwsExecApi, plan: AwsCePlan, planDigests: string[]) {
  if (
    !['aws', 'aws-us-gov', 'aws-cn'].includes(plan.partition) ||
    plan.engine !== 'native' ||
    plan.intent.operation !== 'teardown' ||
    !/^\d{12}$/.test(plan.accountId) ||
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(plan.region) ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(plan.deploymentName) ||
    !planDigests.length ||
    planDigests.some((value) => !/^[a-f0-9]{64}$/.test(value))
  )
    throw Error('Native inventory scope is invalid');
  const read = async (args: string[]): Promise<Row> => {
    const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json', '--no-paginate']);
    if (result.exitCode !== 0) throw Error('Native owner inventory query is unavailable');
    try {
      return object(JSON.parse(result.stdout));
    } catch {
      throw Error('Native owner inventory response is malformed');
    }
  };
  const identity = await read(['sts', 'get-caller-identity']);
  if (
    identity.Account !== plan.accountId ||
    typeof identity.Arn !== 'string' ||
    !identity.Arn.startsWith(`arn:${plan.partition}:`) ||
    identity.Arn.split(':')[1] !== plan.partition ||
    identity.Arn.split(':')[4] !== plan.accountId
  )
    throw Error('Native inventory authenticated account or partition differs');
  const pages = async (args: string[], field: string, tokenField: string, tokenArg: string, blankEnds = false) => {
    const rows: unknown[] = [],
      tokens = new Set<string>();
    let token: string | undefined;
    for (let page = 0; page < 100; page++) {
      const data = await read([...args, ...(token ? [tokenArg, token] : [])]);
      if (!Array.isArray(data[field])) throw Error('Native owner inventory list is unavailable');
      rows.push(...(data[field] as unknown[]));
      const next = data[tokenField];
      if (next === undefined || (blankEnds && next === '')) return rows;
      if (typeof next !== 'string' || !next || next.length > 4096 || tokens.has(next))
        throw Error('Native owner inventory pagination is malformed');
      tokens.add(next);
      token = next;
    }
    throw Error('Native owner inventory pagination is incomplete');
  };
  const filters = [
    { Name: 'key', Values: ['xcsh-deployment-id'] },
    { Name: 'value', Values: [plan.deploymentName] },
  ];
  const selected = await pages(
    ['ec2', 'describe-tags', '--filters', JSON.stringify(filters)],
    'Tags',
    'NextToken',
    '--next-token',
  );
  const ids = new Map<string, string>();
  for (const raw of selected) {
    const tag = object(raw);
    if (
      typeof tag.ResourceId !== 'string' ||
      !/^[a-z][a-z-]{0,31}-[0-9a-f]{8,21}$/.test(tag.ResourceId) ||
      typeof tag.ResourceType !== 'string' ||
      !/^[a-z][a-z-]{0,62}$/.test(tag.ResourceType) ||
      tag.Key !== 'xcsh-deployment-id' ||
      tag.Value !== plan.deploymentName ||
      ids.has(tag.ResourceId)
    )
      throw Error('Native EC2 owner inventory identity differs');
    ids.set(tag.ResourceId, tag.ResourceType);
  }
  const tags = (values: unknown): Map<string, string> => {
    if (!Array.isArray(values)) throw Error('Native owner tags are unavailable');
    const map = new Map<string, string>();
    for (const raw of values) {
      const row = object(raw);
      if (typeof row.Key !== 'string' || !row.Key || typeof row.Value !== 'string' || map.has(row.Key))
        throw Error('Native owner tags are malformed');
      map.set(row.Key, row.Value);
    }
    if (
      map.get('xcsh-managed-by') !== 'aws-ce' ||
      map.get('xcsh-deployment-id') !== plan.deploymentName ||
      map.get('xcsh-execution-engine') !== 'native' ||
      !planDigests.includes(map.get('xcsh-plan-sha256') ?? '')
    )
      throw Error('Native inventory owner differs');
    return map;
  };
  const resources = new Set<string>();
  const list = [...ids.keys()];
  for (let index = 0; index < list.length; index += 100) {
    const chunk = list.slice(index, index + 100),
      grouped = new Map(chunk.map((id) => [id, [] as unknown[]]));
    const complete = await pages(
      ['ec2', 'describe-tags', '--filters', JSON.stringify([{ Name: 'resource-id', Values: chunk }])],
      'Tags',
      'NextToken',
      '--next-token',
    );
    for (const raw of complete) {
      const row = object(raw);
      if (
        typeof row.ResourceId !== 'string' ||
        !grouped.has(row.ResourceId) ||
        row.ResourceType !== ids.get(row.ResourceId)
      )
        throw Error('Native EC2 inventory join differs');
      const group = grouped.get(row.ResourceId);
      if (!group) throw Error('Native EC2 inventory join is missing');
      group.push(row);
    }
    for (const [id, rows] of grouped) {
      tags(rows);
      resources.add(id);
    }
  }
  const mappings = await pages(
    [
      'resourcegroupstaggingapi',
      'get-resources',
      '--tag-filters',
      JSON.stringify([{ Key: 'xcsh-deployment-id', Values: [plan.deploymentName] }]),
    ],
    'ResourceTagMappingList',
    'PaginationToken',
    '--pagination-token',
    true,
  );
  const seen = new Set<string>();
  for (const raw of mappings) {
    const row = object(raw);
    if (typeof row.ResourceARN !== 'string' || seen.has(row.ResourceARN))
      throw Error('Native tagged resource identity is duplicated or malformed');
    const fields = row.ResourceARN.split(':');
    if (
      fields.length < 6 ||
      fields[0] !== 'arn' ||
      fields[1] !== plan.partition ||
      fields[3] !== plan.region ||
      fields[4] !== plan.accountId ||
      !fields.slice(5).join(':')
    )
      throw Error('Native tagged resource account or region differs');
    seen.add(row.ResourceARN);
    tags(row.Tags);
    const resource = fields.slice(5).join(':').split('/').at(-1);
    if (!resource) throw Error('Native tagged resource suffix is missing');
    resources.add(fields[2] === 'ec2' && ids.has(resource) ? resource : row.ResourceARN);
  }
  return {
    status: resources.size ? ('pending' as const) : ('absent' as const),
    expected: resources.size,
    retired: 0,
    remainingResourceIds: [...resources].sort(),
    observedAt: new Date().toISOString(),
    source: 'authenticated-complete-regional-owner-inventory' as const,
  };
}
