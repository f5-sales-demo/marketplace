import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { verifyAwsTerraformDestroyOwnership } from '../../src/ce/terraform-destroy-ownership';
import { retireAwsTerraformMetadata } from '../../src/ce/terraform-metadata-retirement';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

const roots: string[] = [];
function instanceTags(current: Map<string, { Key: string; Value: string }[]>) {
  const tags = current.get('i-12345678');
  if (!tags?.length) throw Error('Original test instance tags unavailable');
  return tags;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const initial = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = initial;
  const normalized = {
    ...draft,
    intent: { ...draft.intent, partition: 'aws' as const },
    deploymentName: initial.intent.deploymentName,
    accountId: initial.intent.accountId,
    region: initial.intent.region,
  };
  const hash = canonicalSha256(normalized);
  const plan = { ...normalized, planId: `aws-ce-${hash.slice(0, 24)}`, planSha256: hash };
  const profile = plan.intent.awsProfile;
  if (typeof profile !== 'string') throw Error('Original test profile unavailable');
  const root = await mkdtemp(join(tmpdir(), 'aws-metadata-retirement-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, siteBindings(plan)[0].binding.owner);
  const tags = Object.entries({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.intent.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'xcsh-node-index': '1',
  })
    .map(([Key, Value]) => ({ Key, Value }))
    .sort((a, b) => a.Key.localeCompare(b.Key));
  const material = {
    schemaVersion: 1,
    engine: 'terraform',
    accountId: plan.intent.accountId,
    region: plan.intent.region,
    deploymentId: plan.intent.deploymentName,
    sourcePlanSha256: plan.planSha256,
    terraformPlanSha256: 'd'.repeat(64),
    resources: [
      { type: 'aws_instance', id: 'i-12345678' },
      { type: 'aws_subnet', id: 'subnet-12345678' },
    ],
    tgwEdges: [],
    metadata: [
      { type: 'aws_instance', id: 'i-12345678', address: 'aws_instance.node_1', tags },
      {
        type: 'aws_subnet',
        id: 'subnet-12345678',
        address: 'aws_subnet.node_1_nic_1',
        tags: [...tags, { Key: 'xcsh-interface-index', Value: '1' }].sort((a, b) => a.Key.localeCompare(b.Key)),
      },
    ],
  };
  const inventory = { ...material, sha256: canonicalSha256(material) };
  await store.write('terraform-cloud-teardown-inventory.json', inventory);
  await store.write('terraform-cloud-teardown.json', {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    phase: 'retired',
  });
  const current = new Map(inventory.metadata.map((row) => [row.id, structuredClone(row.tags)]));
  const regional = new Map<string, { Key: string; Value: string }[]>();
  const regionalMutations: { ResourceARNList: string[]; TagKeys: string[] }[] = [];
  let regionalFailure: 'none' | 'before' | 'after' | 'ack-only' | 'failed-map' = 'none';
  let regionalPage: unknown;
  const arn = (id: string) =>
    `arn:aws:ec2:${plan.intent.region}:${plan.intent.accountId}:${id.startsWith('i-') ? 'instance' : 'subnet'}/${id}`;
  let account = plan.intent.accountId,
    state = 'terminated',
    error = '',
    pagination = false;
  let failure: 'none' | 'after-delete' | 'before-delete' | 'ack-only' = 'none';
  const mutations: unknown[] = [],
    reads: string[] = [];
  const api = {
    async exec(command: string, argv: string[], options?: { signal?: AbortSignal }) {
      expect(command).toBe('aws');
      expect(argv[argv.indexOf('--profile') + 1]).toBe(profile);
      expect(argv[argv.indexOf('--region') + 1]).toBe(plan.intent.region);
      options?.signal?.throwIfAborted();
      const op = argv[1];
      reads.push(op);
      const input = argv.includes('--cli-input-json') ? JSON.parse(argv[argv.indexOf('--cli-input-json') + 1]) : {};
      if (error) return { exitCode: 1, stdout: '', stderr: error };
      let response: unknown;
      if (op === 'get-caller-identity') response = { Account: account };
      else if (op === 'describe-instances')
        response = {
          Reservations:
            state === 'absent' ? [] : [{ Instances: [{ InstanceId: 'i-12345678', State: { Name: state } }] }],
        };
      else if (op === 'describe-subnets') response = { Subnets: [] };
      else if (op === 'get-resources')
        response = regionalPage ?? {
          ResourceTagMappingList: [...regional]
            .filter(([id, tags]) =>
              input.ResourceARNList
                ? input.ResourceARNList.includes(arn(id))
                : tags.some((tag) => tag.Key === 'xcsh-deployment-id' && tag.Value === plan.intent.deploymentName),
            )
            .map(([id, Tags]) => ({ ResourceARN: arn(id), Tags })),
        };
      else if (op === 'untag-resources') {
        regionalMutations.push(structuredClone(input));
        if (regionalFailure === 'before') {
          regionalFailure = 'none';
          return { exitCode: 1, stdout: '', stderr: 'request timed out' };
        }
        if (regionalFailure === 'failed-map')
          response = {
            FailedResourcesMap: {
              [input.ResourceARNList[0]]: {
                StatusCode: 403,
                ErrorCode: 'AccessDeniedException',
                ErrorMessage: 'denied',
              },
            },
          };
        else {
          if (regionalFailure !== 'ack-only')
            for (const [id, tags] of regional)
              if (input.ResourceARNList.includes(arn(id)))
                regional.set(
                  id,
                  tags.filter((tag) => !input.TagKeys.includes(tag.Key)),
                );
          if (regionalFailure === 'after') {
            regionalFailure = 'none';
            return { exitCode: 1, stdout: '', stderr: 'request timed out' };
          }
          response = { FailedResourcesMap: {} };
        }
      } else if (op === 'describe-tags') {
        const selected = input.Filters?.find((f: { Name: string }) => f.Name === 'resource-id')?.Values;
        const rows = [...current]
          .filter(([id]) => !selected || selected.includes(id))
          .flatMap(([ResourceId, values]) =>
            values.map((tag) => ({
              ResourceId,
              ResourceType: ResourceId.startsWith('i-') ? 'instance' : 'subnet',
              ...tag,
            })),
          );
        const deployment = input.Filters?.some((f: { Name: string }) => f.Name === 'key');
        response = {
          Tags: deployment
            ? rows.filter((row) => row.Key === 'xcsh-deployment-id' && row.Value === plan.intent.deploymentName)
            : rows,
          ...(pagination ? { NextToken: 13 } : {}),
        };
      } else if (op === 'delete-tags') {
        mutations.push(structuredClone(input));
        const id = input.Resources[0];
        if (failure === 'before-delete') {
          failure = 'none';
          return { exitCode: 1, stdout: '', stderr: 'request timed out' };
        }
        if (failure !== 'ack-only')
          current.set(
            id,
            (current.get(id) ?? []).filter(
              (tag) =>
                !input.Tags.some(
                  (target: { Key: string; Value: string }) => target.Key === tag.Key && target.Value === tag.Value,
                ),
            ),
          );
        if (failure === 'after-delete') {
          failure = 'none';
          return { exitCode: 1, stdout: '', stderr: 'request timed out' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      } else throw Error(`Unexpected operation ${op}`);
      return { exitCode: 0, stdout: JSON.stringify(response), stderr: '' };
    },
  };
  return {
    plan,
    store,
    inventory,
    current,
    regional,
    regionalMutations,
    arn,
    setRegionalFailure: (value: typeof regionalFailure) => {
      regionalFailure = value;
    },
    setRegionalPage: (value: unknown) => {
      regionalPage = value;
    },
    mutations,
    reads,
    api,
    setAccount: (value: string) => {
      account = value;
    },
    setState: (value: string) => {
      state = value;
    },
    setError: (value: string) => {
      error = value;
    },
    setFailure: (value: typeof failure) => {
      failure = value;
    },
    setPagination: () => {
      pagination = true;
    },
    run: (signal?: AbortSignal) => retireAwsTerraformMetadata(plan, store, api, signal),
  };
}

test('retires exact conditional ownership tags with empty DeleteTags stdout and verifies replay without mutation', async () => {
  const f = await fixture();
  f.current.get('i-12345678')?.push({ Key: 'customer-label', Value: 'preserve' });
  const result = await f.run();
  expect(result.status).toBe('metadata-retired');
  expect(f.mutations).toHaveLength(2);
  expect(f.current.get('i-12345678')).toEqual([{ Key: 'customer-label', Value: 'preserve' }]);
  const original = await f.store.read('aws-terraform-metadata-retirement.json');
  const mutations = f.mutations.length;
  await f.run();
  expect(f.mutations).toHaveLength(mutations);
  expect(await f.store.read('aws-terraform-metadata-retirement.json')).toEqual(original);
});

for (const mode of [
  'running',
  'foreign-account',
  'foreign-tags',
  'duplicate-tags',
  'unknown-origin',
  'missing-origin',
  'partial',
  'unauthorized',
  'phase',
  'cancelled',
]) {
  test(`refuses ${mode} before metadata mutation`, async () => {
    const f = await fixture();
    if (mode === 'running') f.setState('running');
    if (mode === 'foreign-account') f.setAccount('000000000000');
    if (mode === 'foreign-tags') instanceTags(f.current)[0].Value = 'foreign';
    if (mode === 'duplicate-tags') instanceTags(f.current).push({ ...instanceTags(f.current)[0] });
    if (mode === 'unknown-origin') f.current.set('subnet-87654321', structuredClone(f.inventory.metadata[0].tags));
    if (mode === 'missing-origin') {
      const { sha256: _sha, metadata: _metadata, ...material } = f.inventory;
      await f.store.write('terraform-cloud-teardown-inventory.json', {
        ...material,
        sha256: canonicalSha256(material),
      });
    }
    if (mode === 'partial') f.setPagination();
    if (mode === 'unauthorized') f.setError('UnauthorizedOperation');
    if (mode === 'phase') await f.store.write('terraform-cloud-teardown.json', { phase: 'destroy-pending' });
    await expect(f.run(mode === 'cancelled' ? AbortSignal.abort() : undefined)).rejects.toThrow();
    expect(f.mutations).toHaveLength(0);
  });
}

for (const mode of ['after-delete', 'before-delete'] as const) {
  test(`resolves ${mode} ambiguity from durable original intent and fresh resource/tag reads`, async () => {
    const f = await fixture();
    f.setFailure(mode);
    await expect(f.run()).rejects.toThrow();
    const pending = (await f.store.read('aws-terraform-metadata-retirement.json')) as { pending: unknown };
    expect(pending.pending).not.toBeNull();
    expect((await f.run()).status).toBe('metadata-retired');
    expect(f.mutations).toHaveLength(mode === 'after-delete' ? 2 : 3);
  });
}

test('does not treat a successful DeleteTags acknowledgement as retirement', async () => {
  const f = await fixture();
  f.setFailure('ack-only');
  await expect(f.run()).rejects.toThrow('Metadata deletion acknowledged without verified retirement');
  expect(f.mutations).toHaveLength(1);
  expect(
    ((await f.store.read('aws-terraform-metadata-retirement.json')) as { pending: unknown }).pending,
  ).not.toBeNull();
});

for (const body of ['', '{', 'null', '[]']) {
  for (const phase of ['before-delete', 'after-delete']) {
    test(`rejects invalid observation JSON ${JSON.stringify(body)} ${phase}`, async () => {
      const f = await fixture();
      const exec = f.api.exec.bind(f.api);
      f.api.exec = async (command, argv, options) => {
        const result = await exec(command, argv, options);
        if (argv[1] === 'describe-tags' && (phase === 'before-delete' || f.mutations.length > 0))
          return { ...result, stdout: body };
        return result;
      };
      await expect(f.run()).rejects.toThrow();
      expect(f.mutations).toHaveLength(phase === 'before-delete' ? 0 : 1);
      if (phase === 'after-delete')
        expect(
          ((await f.store.read('aws-terraform-metadata-retirement.json')) as { pending: unknown }).pending,
        ).not.toBeNull();
    });
  }
}

test('refuses foreign tags and forged intent after ambiguous submission', async () => {
  for (const mode of ['tag', 'intent']) {
    const f = await fixture();
    f.setFailure('before-delete');
    await expect(f.run()).rejects.toThrow();
    if (mode === 'tag') instanceTags(f.current)[0].Value = 'foreign';
    else {
      const checkpoint = (await f.store.read('aws-terraform-metadata-retirement.json')) as Record<string, unknown>;
      await f.store.write('aws-terraform-metadata-retirement.json', { ...checkpoint, inventorySha256: 'f'.repeat(64) });
    }
    await expect(f.run()).rejects.toThrow();
    expect(f.mutations).toHaveLength(1);
  }
});

test('persists original intent before mutation and rejects interrupted intent storage', async () => {
  const f = await fixture();
  const write = f.store.write.bind(f.store);
  f.store.write = async (name, value) => {
    if (name === 'aws-terraform-metadata-retirement.json' && Reflect.get(value as object, 'pending'))
      throw Error('intent storage interrupted');
    return write(name, value);
  };
  await expect(f.run()).rejects.toThrow('intent storage interrupted');
  expect(f.mutations).toHaveLength(0);
});

test('resumes a partially committed ambiguous request using its exact original conditional values', async () => {
  const f = await fixture();
  f.setFailure('before-delete');
  await expect(f.run()).rejects.toThrow();
  f.current.set(
    'i-12345678',
    instanceTags(f.current).filter((tag) => tag.Key === 'xcsh-node-index'),
  );
  expect((await f.run()).status).toBe('metadata-retired');
  const requests = f.mutations as { Resources: string[]; Tags: unknown[] }[];
  expect(requests[0]).toEqual(requests[1]);
});

test('rejects a substituted tag resource type even when its ID and values match', async () => {
  const f = await fixture();
  const exec = f.api.exec.bind(f.api);
  f.api.exec = async (command, argv, options) => {
    const result = await exec(command, argv, options);
    if (argv[1] === 'describe-tags') {
      const body = JSON.parse(result.stdout);
      body.Tags = body.Tags.map((row: object) => ({ ...row, ResourceType: 'security-group' }));
      return { ...result, stdout: JSON.stringify(body) };
    }
    return result;
  };
  await expect(f.run()).rejects.toThrow();
  expect(f.mutations).toHaveLength(0);
});

test('rejects foreign node/interface projection with a recomputed local inventory digest', async () => {
  const f = await fixture();
  const { sha256: _sha, ...material } = structuredClone(f.inventory);
  material.metadata[1].address = 'aws_subnet.node_2_nic_1';
  await f.store.write('terraform-cloud-teardown-inventory.json', { ...material, sha256: canonicalSha256(material) });
  await expect(f.run()).rejects.toThrow('projection differs');
  expect(f.mutations).toHaveLength(0);
});

test('captures live subnet metadata against the original destroy projection and rejects a changed node before destruction', async () => {
  const f = await fixture();
  const tags = structuredClone(f.inventory.metadata[1].tags);
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    operation: 'destroy',
    deploymentId: f.plan.intent.deploymentName,
    backendIdentity: `local:${f.plan.intent.deploymentName}`,
    planSha256: 'd'.repeat(64),
    configurationSha256: 'c'.repeat(64),
    noChanges: false,
    changes: [{ address: 'aws_subnet.node_1_nic_1', type: 'aws_subnet', actions: ['delete'] }],
  };
  const session = {
    readPlannedResourceFields: async () => ({
      'aws_subnet.node_1_nic_1': { id: 'subnet-12345678', region: f.plan.intent.region },
    }),
  };
  const api = {
    exec: async (_command: string, args: string[]) => {
      if (!['get-caller-identity', 'describe-subnets'].includes(args[1]))
        throw Error('Unexpected pre-destroy mutation');
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(
          args[1] === 'get-caller-identity'
            ? { Account: f.plan.intent.accountId }
            : { Subnets: [{ SubnetId: 'subnet-12345678', Tags: tags }] },
        ),
      };
    },
  };
  const run = () => verifyAwsTerraformDestroyOwnership(f.plan, receipt as never, session as never, api, {});
  const original = await run();
  expect(original.inventory.metadata).toEqual([
    { type: 'aws_subnet', id: 'subnet-12345678', address: 'aws_subnet.node_1_nic_1', tags },
  ]);
  const node = tags.find((tag) => tag.Key === 'xcsh-node-index');
  if (!node) throw Error('Original test node metadata unavailable');
  node.Value = '2';
  await expect(run()).rejects.toThrow('projection differs');
});

test('captures an attached volume through its original instance and refuses duplicate attachment provenance', async () => {
  const f = await fixture();
  const tags = f.inventory.metadata[0].tags;
  const disks = [{ Ebs: { VolumeId: 'vol-12345678' } }];
  const values = {
    'aws_instance.node_1': { id: 'i-12345678', region: f.plan.intent.region },
    'aws_network_interface.node_1_nic_0': { id: 'eni-12345678', region: f.plan.intent.region },
  };
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    operation: 'destroy',
    deploymentId: f.plan.intent.deploymentName,
    backendIdentity: `local:${f.plan.intent.deploymentName}`,
    planSha256: 'd'.repeat(64),
    configurationSha256: 'c'.repeat(64),
    noChanges: false,
    changes: Object.keys(values).map((address) => ({ address, type: address.split('.')[0], actions: ['delete'] })),
  };
  const session = { readPlannedResourceFields: async () => values };
  const responses: Record<string, unknown> = {
    'get-caller-identity': { Account: f.plan.intent.accountId },
    'describe-instances': {
      Reservations: [
        {
          Instances: [
            {
              InstanceId: 'i-12345678',
              Tags: tags,
              NetworkInterfaces: [{ NetworkInterfaceId: 'eni-12345678' }],
              BlockDeviceMappings: disks,
            },
          ],
        },
      ],
    },
    'describe-network-interfaces': {
      NetworkInterfaces: [
        { NetworkInterfaceId: 'eni-12345678', TagSet: [...tags, { Key: 'xcsh-interface-index', Value: '0' }] },
      ],
    },
    'describe-volumes': { Volumes: [{ VolumeId: 'vol-12345678', Tags: tags }] },
  };
  const api = {
    exec: async (_command: string, args: string[]) => {
      if (!Object.hasOwn(responses, args[1])) throw Error('Unexpected pre-destroy mutation');
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(responses[args[1]]) };
    },
  };
  const run = () => verifyAwsTerraformDestroyOwnership(f.plan, receipt as never, session as never, api, {});
  const original = await run();
  expect(original.inventory.metadata).toEqual(
    expect.arrayContaining([
      {
        type: 'aws_ebs_volume',
        id: 'vol-12345678',
        address: 'aws_instance.node_1',
        parentInstanceId: 'i-12345678',
        tags,
      },
    ]),
  );
  disks.push({ Ebs: { VolumeId: 'vol-12345678' } });
  await expect(run()).rejects.toThrow('Ambiguous attached volume');
});

test('retires a stale regional entry for the original absent instance and preserves unrelated keys', async () => {
  const f = await fixture();
  f.current.clear();
  f.setState('absent');
  f.regional.set('i-12345678', [
    ...structuredClone(f.inventory.metadata[0].tags),
    { Key: 'customer-label', Value: 'preserve' },
  ]);
  expect((await f.run()).status).toBe('metadata-retired');
  expect(f.mutations).toHaveLength(0);
  expect(f.regionalMutations).toEqual([
    { ResourceARNList: [f.arn('i-12345678')], TagKeys: f.inventory.metadata[0].tags.map((t) => t.Key).sort() },
  ]);
  expect(f.regional.get('i-12345678')).toEqual([{ Key: 'customer-label', Value: 'preserve' }]);
  const count = f.regionalMutations.length;
  const checkpoint = await f.store.read('aws-terraform-metadata-retirement.json');
  await f.run();
  expect(f.regionalMutations).toHaveLength(count);
  expect(await f.store.read('aws-terraform-metadata-retirement.json')).toEqual(checkpoint);
});

for (const scenario of [
  'unknown-id',
  'foreign-account',
  'foreign-region',
  'wrong-type',
  'duplicate-row',
  'duplicate-key',
  'foreign-value',
  'malformed',
  'partial',
  'missing-map',
]) {
  test(`refuses regional ${scenario} before any metadata mutation`, async () => {
    const f = await fixture();
    const row = { ResourceARN: f.arn('i-12345678'), Tags: structuredClone(f.inventory.metadata[0].tags) };
    if (scenario === 'unknown-id') row.ResourceARN = f.arn('i-87654321');
    if (scenario === 'foreign-account')
      row.ResourceARN = row.ResourceARN.replace(f.plan.intent.accountId, '000000000000');
    if (scenario === 'foreign-region') row.ResourceARN = row.ResourceARN.replace(f.plan.intent.region, 'us-west-2');
    if (scenario === 'wrong-type') row.ResourceARN = row.ResourceARN.replace(':instance/', ':subnet/');
    if (scenario === 'duplicate-key') row.Tags.push({ ...row.Tags[0] });
    if (scenario === 'foreign-value') row.Tags[0].Value = 'foreign';
    const page: Record<string, unknown> = { ResourceTagMappingList: scenario === 'duplicate-row' ? [row, row] : [row] };
    if (scenario === 'malformed') page.ResourceTagMappingList = null;
    if (scenario === 'partial') page.PaginationToken = 13;
    if (scenario === 'missing-map') delete page.ResourceTagMappingList;
    f.setRegionalPage(page);
    await expect(f.run()).rejects.toThrow();
    expect(f.mutations).toHaveLength(0);
    expect(f.regionalMutations).toHaveLength(0);
  });
}

for (const mode of ['before', 'after'] as const)
  test(`replays regional ${mode} ambiguity from durable original intent`, async () => {
    const f = await fixture();
    f.current.clear();
    f.regional.set('i-12345678', structuredClone(f.inventory.metadata[0].tags));
    f.setRegionalFailure(mode);
    await expect(f.run()).rejects.toThrow();
    const pending = (await f.store.read('aws-terraform-metadata-retirement.json')) as {
      regional?: { pending: unknown };
    };
    expect(pending.regional?.pending).not.toBeNull();
    expect((await f.run()).status).toBe('metadata-retired');
    expect(f.regionalMutations).toHaveLength(mode === 'after' ? 1 : 2);
    if (mode === 'before') expect(f.regionalMutations[0]).toEqual(f.regionalMutations[1]);
  });

for (const mode of ['ack-only', 'failed-map'] as const)
  test(`regional ${mode} cannot qualify retirement`, async () => {
    const f = await fixture();
    f.current.clear();
    f.regional.set('i-12345678', structuredClone(f.inventory.metadata[0].tags));
    f.setRegionalFailure(mode);
    await expect(f.run()).rejects.toThrow();
    expect(f.regionalMutations).toHaveLength(1);
    const saved = (await f.store.read('aws-terraform-metadata-retirement.json')) as {
      phase: string;
      regional?: { pending: unknown };
    };
    expect(saved.phase).toBe('retiring');
    expect(saved.regional?.pending).not.toBeNull();
  });

test('rejects changed regional ownership after an interrupted submission', async () => {
  const f = await fixture();
  f.current.clear();
  f.regional.set('i-12345678', structuredClone(f.inventory.metadata[0].tags));
  f.setRegionalFailure('before');
  await expect(f.run()).rejects.toThrow();
  const current = f.regional.get('i-12345678');
  if (!current?.length) throw Error('Original regional test tags unavailable');
  current[0].Value = 'foreign';
  await expect(f.run()).rejects.toThrow();
  expect(f.regionalMutations).toHaveLength(1);
});

test('stores regional intent before submission and rejects failed persistence', async () => {
  const f = await fixture();
  f.current.clear();
  f.regional.set('i-12345678', structuredClone(f.inventory.metadata[0].tags));
  const write = f.store.write.bind(f.store);
  f.store.write = async (name, value) => {
    if (
      name === 'aws-terraform-metadata-retirement.json' &&
      (value as { regional?: { pending: unknown } }).regional?.pending
    )
      throw Error('regional intent interrupted');
    return write(name, value);
  };
  await expect(f.run()).rejects.toThrow('regional intent interrupted');
  expect(f.regionalMutations).toHaveLength(0);
});

for (const body of [null, [], undefined])
  test(`rejects invalid failed-resource map ${String(body)}`, async () => {
    const f = await fixture();
    f.current.clear();
    f.regional.set('i-12345678', structuredClone(f.inventory.metadata[0].tags));
    const exec = f.api.exec.bind(f.api);
    f.api.exec = async (command, args, options) => {
      if (args[1] === 'untag-resources')
        return {
          exitCode: 0,
          stdout: JSON.stringify(body === undefined ? {} : { FailedResourcesMap: body }),
          stderr: '',
        };
      return exec(command, args, options);
    };
    await expect(f.run()).rejects.toThrow();
    expect(((await f.store.read('aws-terraform-metadata-retirement.json')) as { phase: string }).phase).toBe(
      'retiring',
    );
  });

test('rejects repeated regional pagination tokens before mutation', async () => {
  const f = await fixture();
  f.setRegionalPage({ ResourceTagMappingList: [], PaginationToken: 'repeated' });
  await expect(f.run()).rejects.toThrow();
  expect(f.mutations).toHaveLength(0);
  expect(f.regionalMutations).toHaveLength(0);
});

test('rejects a partial original-ARN batch before mutation', async () => {
  const f = await fixture();
  const exec = f.api.exec.bind(f.api);
  f.api.exec = async (command, args, options) => {
    const result = await exec(command, args, options);
    if (args[1] === 'get-resources' && JSON.parse(args[args.indexOf('--cli-input-json') + 1]).ResourceARNList)
      return { ...result, stdout: JSON.stringify({ ResourceTagMappingList: [], PaginationToken: 'partial' }) };
    return result;
  };
  await expect(f.run()).rejects.toThrow();
  expect(f.mutations).toHaveLength(0);
  expect(f.regionalMutations).toHaveLength(0);
});

test('rejects a forged regional request digest on replay', async () => {
  const f = await fixture();
  f.current.clear();
  f.regional.set('i-12345678', structuredClone(f.inventory.metadata[0].tags));
  f.setRegionalFailure('before');
  await expect(f.run()).rejects.toThrow();
  const saved = (await f.store.read('aws-terraform-metadata-retirement.json')) as {
    regional: { pending: { requestSha256: string } };
  };
  saved.regional.pending.requestSha256 = 'f'.repeat(64);
  await f.store.write('aws-terraform-metadata-retirement.json', saved);
  await expect(f.run()).rejects.toThrow('pending regional');
  expect(f.regionalMutations).toHaveLength(1);
});

test('unresolved execution partition cannot mutate metadata', async () => {
  const f = await fixture();
  const { planId: _id, planSha256: _sha, ...base } = structuredClone(f.plan);
  const input = { ...base, intent: { ...base.intent, partition: undefined } };
  const hash = canonicalSha256(input);
  const plan = { ...input, planId: `aws-ce-${hash.slice(0, 24)}`, planSha256: hash };
  await expect(retireAwsTerraformMetadata(plan as unknown as typeof f.plan, f.store, f.api)).rejects.toThrow();
  expect(f.mutations).toHaveLength(0);
  expect(f.regionalMutations).toHaveLength(0);
});

for (const kind of ['missing', 'partial'])
  test(`retired regional ${kind} proof cannot be repaired by mutating sealed custody`, async () => {
    const f = await fixture();
    await f.run();
    const saved = (await f.store.read('aws-terraform-metadata-retirement.json')) as {
      regional?: { completed: string[]; pending: unknown };
    };
    if (kind === 'missing') delete saved.regional;
    else {
      if (!saved.regional) throw Error('Original regional custody missing');
      saved.regional.completed = [];
    }
    await f.store.write('aws-terraform-metadata-retirement.json', saved);
    const count = f.mutations.length;
    await expect(f.run()).rejects.toThrow();
    expect(f.mutations).toHaveLength(count);
    expect(await f.store.read('aws-terraform-metadata-retirement.json')).toEqual(saved);
  });
