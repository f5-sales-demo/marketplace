import { expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { AwsExecApi } from '../../src/aws/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import { createNativeAwsSiteReplacementDriver } from '../../src/ce/native-site-replacement';
import { compileAwsSiteReplacement } from '../../src/ce/site-replacement';
import { siteBindings } from '../../src/ce/topology';
import type { AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

test('native replacement refuses a Terraform source plan before any cloud request', () => {
  let calls = 0;
  expect(() =>
    createNativeAwsSiteReplacementDriver(
      foundationPlan(),
      {
        exec: async () => {
          calls++;
          return { stdout: '{}', stderr: '', exitCode: 0 };
        },
      },
      {} as never,
    ),
  ).toThrow('native');
  expect(calls).toBe(0);
});

async function fixture() {
  const original = foundationPlan();
  const { planId: _id, planSha256: _hash, ...draft } = original;
  const source = {
    ...draft,
    engine: 'native',
    partition: 'aws',
    accountId: '123456789012',
    region: 'us-east-1',
    deploymentName: 'ce',
    intent: { ...draft.intent, engine: 'native' },
    actions: [
      {
        kind: 'instance-run',
        node: 1,
        command: 'aws',
        args: [
          'ec2',
          'run-instances',
          '--image-id',
          draft.intent.image.amiId,
          '--instance-type',
          draft.intent.instance.type,
          '--network-interfaces',
          'DeviceIndex=0,NetworkInterfaceId=__ENI_1_0__',
          'DeviceIndex=1,NetworkInterfaceId=__ENI_1_1__',
          '--user-data',
          'file://__BOOTSTRAP_FILE__',
          '--tag-specifications',
          'ResourceType=instance,Tags=[{Key=xcsh-plan-sha256,Value=__PLAN_SHA256__}]',
          '--region',
          'us-east-1',
          '--output',
          'json',
        ],
      },
    ],
  };
  const hash = canonicalSha256(source);
  const base = { ...source, planId: `aws-ce-${hash.slice(0, 24)}`, planSha256: hash } as AwsCePlan;
  const { binding } = siteBindings(base)[0];
  const oldId = 'i-12345678',
    newId = 'i-87654321';
  const preparation = {
    owner: binding.owner,
    siteName: binding.siteName,
    uid: 'old-site',
    resourceVersion: 'one',
    contractFingerprint: `sha256:${'a'.repeat(64)}`,
    observedAt: new Date().toISOString(),
    source: `/api/config/namespaces/system/securemesh_site_v2s/${binding.siteName}`,
    deviceSource: `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`,
    evidenceKind: 'preboot-interface-configuration-required',
    instances: { 'ce-1': oldId },
    interfaces: ['slo', 'sli'].map((role, index) => ({
      node: 'ce-1',
      role,
      mac: `02:00:00:00:01:0${index + 1}`,
      device: `ens${5 + index}`,
      mtu: 1500,
    })),
    request: { metadata: { name: binding.siteName }, spec: {} },
  };
  const plan = compileAwsSiteReplacement(base, binding.siteName, preparation, {
    interfaceIds: { 'ce-1/slo': 'eni-12345678', 'ce-1/sli': 'eni-12345679' },
    elasticIpAllocationIds: { 'ce-1': 'eipalloc-12345678' },
    bootstrapTokenNames: { 'ce-1': 'observed-token' },
  });
  const tags = (sha: string, nic?: number) =>
    Object.entries({
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'native',
      'xcsh-deployment-id': 'ce',
      'xcsh-plan-sha256': sha,
      'xcsh-node-index': '1',
      'ves-io-site-name': 'site-1',
      ...(nic === undefined ? {} : { 'xcsh-interface-index': String(nic) }),
    }).map(([Key, Value]) => ({ Key, Value }));
  const enis = preparation.interfaces.map((iface, index) => ({
    NetworkInterfaceId: plan.interfaceIds[`ce-1/${iface.role}`],
    OwnerId: base.accountId,
    MacAddress: iface.mac,
    AvailabilityZone: 'us-east-1a',
    VpcId: 'vpc-12345678',
    Status: 'in-use',
    SourceDestCheck: false,
    Attachment: { InstanceId: oldId, DeviceIndex: index, DeleteOnTermination: false } as
      | Record<string, unknown>
      | undefined,
    TagSet: tags(hash, index),
  }));
  const old = {
    InstanceId: oldId,
    ImageId: base.intent.image.amiId,
    InstanceType: base.intent.instance.type,
    Placement: { AvailabilityZone: 'us-east-1a' },
    State: { Name: 'running' },
    Tags: tags(hash),
    NetworkInterfaces: enis.map((eni) => ({ ...eni })),
  };
  let fresh: Record<string, unknown> | undefined;
  const address: Record<string, unknown> = {
    AllocationId: 'eipalloc-12345678',
    AssociationId: 'eipassoc-12345678',
    NetworkInterfaceId: enis[0].NetworkInterfaceId,
    Tags: tags(hash),
  };
  const events: string[] = [];
  const flags = {
    wrongAccount: false,
    partial: false,
    duplicate: false,
    lostLaunch: false,
    invisibleLaunch: false,
    lostTermination: false,
  };
  const directory = await mkdtemp(join(tmpdir(), 'native-replacement-'));
  const storage = await CeDeploymentStore.open(directory, binding.owner);
  const api: AwsExecApi = {
    exec: async (_command, args, options) => {
      options?.signal?.throwIfAborted();
      expect(args[args.indexOf('--profile') + 1]).toBe('ce-profile');
      expect(args[args.indexOf('--region') + 1]).toBe('us-east-1');
      const operation = args[1];
      events.push(operation);
      let value: unknown = {};
      if (operation === 'get-caller-identity')
        value = {
          Account: flags.wrongAccount ? '999999999999' : base.accountId,
          Arn: `arn:aws:sts::${base.accountId}:assumed-role/test/user`,
        };
      else if (operation === 'describe-instances') {
        const filtered = args.includes('--filters');
        const rows = filtered
          ? fresh && !flags.invisibleLaunch
            ? [fresh]
            : []
          : [args[args.indexOf('--instance-ids') + 1] === oldId ? old : fresh];
        value = {
          Reservations: [{ Instances: flags.duplicate && filtered && fresh ? [fresh, fresh] : rows }],
          ...(flags.partial ? { NextToken: 'remaining' } : {}),
        };
      } else if (operation === 'describe-network-interfaces')
        value = {
          NetworkInterfaces: enis.filter(
            (eni) => eni.NetworkInterfaceId === args[args.indexOf('--network-interface-ids') + 1],
          ),
        };
      else if (operation === 'describe-addresses') value = { Addresses: [address] };
      else if (operation === 'terminate-instances') {
        old.State.Name = 'shutting-down';
        if (flags.lostTermination) throw new Error('lost response');
      } else if (operation === 'wait') {
        old.State.Name = 'terminated';
        for (const eni of enis) {
          eni.Attachment = undefined;
          eni.Status = 'available';
        }
      } else if (operation === 'run-instances') {
        const path = args[args.indexOf('--user-data') + 1].slice(7);
        expect((await stat(path)).mode & 0o777).toBe(0o600);
        expect(await readFile(path, 'utf8')).toBe('#cloud-config\nfixture: private-bootstrap\n');
        for (const [index, eni] of enis.entries()) {
          eni.Attachment = { InstanceId: newId, DeviceIndex: index, DeleteOnTermination: false };
          eni.Status = 'in-use';
          eni.SourceDestCheck = true;
        }
        fresh = {
          ...old,
          InstanceId: newId,
          State: { Name: 'pending' },
          Tags: tags(plan.planSha256),
          ClientToken: args[args.indexOf('--client-token') + 1],
          NetworkInterfaces: enis.map((eni) => ({ ...eni })),
        };
        if (flags.lostLaunch) throw new Error('lost response');
        value = { Instances: [fresh] };
      } else if (operation === 'modify-network-interface-attribute') {
        const eni = enis.find((eni) => eni.NetworkInterfaceId === args[args.indexOf('--network-interface-id') + 1]);
        if (!eni) throw new Error('Unexpected interface');
        eni.SourceDestCheck = false;
      } else if (operation === 'associate-address') {
        address.AssociationId = 'eipassoc-87654321';
        address.NetworkInterfaceId = enis[0].NetworkInterfaceId;
      } else throw new Error(`Unexpected operation ${operation}`);
      return { stdout: JSON.stringify(value), stderr: '', exitCode: 0 };
    },
  };
  const driver = createNativeAwsSiteReplacementDriver(base, api, storage);
  return {
    base,
    plan,
    driver,
    storage,
    events,
    flags,
    old,
    enis,
    address,
    cleanup: () => rm(directory, { recursive: true, force: true }),
    launch: () => driver.launch(plan, { 'ce-1': '#cloud-config\nfixture: private-bootstrap\n' }),
  };
}

test('native replacement retains network identity and resumes a completed launch without creating again', async () => {
  const f = await fixture();
  try {
    await f.driver.quiesce(f.plan);
    expect(f.old.State.Name).toBe('terminated');
    delete f.address.AssociationId;
    expect(await f.launch()).toEqual({ 'ce-1': 'i-87654321' });
    expect(await f.launch()).toEqual({ 'ce-1': 'i-87654321' });
    expect(f.events.filter((event) => event === 'run-instances')).toHaveLength(1);
    expect(f.events.filter((event) => event === 'associate-address')).toHaveLength(1);
    expect((await readdir(f.storage.directory)).some((name) => name.startsWith('replacement-bootstrap-'))).toBe(false);
    const records = await Promise.all(
      (await readdir(f.storage.directory)).map((name) => readFile(join(f.storage.directory, name), 'utf8')),
    );
    expect(records.join('')).not.toContain('private-bootstrap');
  } finally {
    await f.cleanup();
  }
});
test('native replacement reconciles lost terminate and launch responses', async () => {
  const f = await fixture();
  try {
    f.flags.lostTermination = true;
    f.flags.lostLaunch = true;
    await f.driver.quiesce(f.plan);
    await f.driver.quiesce(f.plan);
    expect(await f.launch()).toEqual({ 'ce-1': 'i-87654321' });
    expect(f.events.filter((event) => event === 'terminate-instances')).toHaveLength(1);
    expect(f.events.filter((event) => event === 'run-instances')).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});
test('native replacement never repeats an ambiguous launch while its instance is invisible', async () => {
  const f = await fixture();
  try {
    await f.driver.quiesce(f.plan);
    f.flags.lostLaunch = true;
    f.flags.invisibleLaunch = true;
    await expect(f.launch()).rejects.toThrow('unknown');
    await expect(f.launch()).rejects.toThrow();
    expect(f.events.filter((event) => event === 'run-instances')).toHaveLength(1);
    f.flags.invisibleLaunch = false;
    expect(await f.launch()).toEqual({ 'ce-1': 'i-87654321' });
  } finally {
    await f.cleanup();
  }
});
for (const failure of [
  'account',
  'pagination',
  'foreign-attachment',
  'mac',
  'engine',
  'delete-on-termination',
] as const) {
  test(`native replacement refuses ${failure} before termination`, async () => {
    const f = await fixture();
    try {
      if (failure === 'account') f.flags.wrongAccount = true;
      if (failure === 'pagination') f.flags.partial = true;
      if (failure === 'foreign-attachment')
        f.enis[0].Attachment = { ...f.enis[0].Attachment, InstanceId: 'i-99999999' };
      if (failure === 'delete-on-termination')
        f.enis[0].Attachment = { ...f.enis[0].Attachment, DeleteOnTermination: true };
      if (failure === 'mac') f.enis[0].MacAddress = '02:00:00:00:ff:ff';
      if (failure === 'engine')
        f.enis[0].TagSet = f.enis[0].TagSet.map((tag) =>
          tag.Key === 'xcsh-execution-engine' ? { ...tag, Value: 'terraform' } : tag,
        );
      await expect(f.driver.quiesce(f.plan)).rejects.toThrow();
      expect(f.events).not.toContain('terminate-instances');
    } finally {
      await f.cleanup();
    }
  });
}
test('native replacement refuses duplicate client-token candidates and changed bootstrap on resume', async () => {
  const f = await fixture();
  try {
    await f.driver.quiesce(f.plan);
    await f.launch();
    f.flags.duplicate = true;
    await expect(f.launch()).rejects.toThrow('multiple');
    f.flags.duplicate = false;
    await expect(f.driver.launch(f.plan, { 'ce-1': '#cloud-config\nchanged: true\n' })).rejects.toThrow(
      'request differs',
    );
    expect(f.events.filter((event) => event === 'run-instances')).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});

test('native replacement refuses launch before quiescence and cancellation before cloud requests', async () => {
  const f = await fixture();
  try {
    await expect(f.launch()).rejects.toThrow('terminate before');
    expect(f.events).not.toContain('run-instances');
    f.events.length = 0;
    await expect(f.driver.quiesce(f.plan, AbortSignal.abort())).rejects.toThrow();
    expect(f.events).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});

test('native replacement rejects obsolete launch checkpoints without another mutation', async () => {
  const f = await fixture();
  try {
    await f.driver.quiesce(f.plan);
    await f.launch();
    const name = `${f.plan.planId}-1-launch.json`;
    const record = (await f.storage.read(name)) as Record<string, unknown>;
    await f.storage.write(name, { ...record, schemaVersion: 0 });
    f.events.length = 0;
    await expect(f.launch()).rejects.toThrow('request differs');
    expect(f.events).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});

test('native quiescence admission runs before deletion and reports resumed cloud state', async () => {
  const f = await fixture();
  try {
    const states: string[] = [];
    await expect(
      f.driver.quiesce(f.plan, undefined, async (state) => {
        states.push(state);
        throw new Error('version admission rejected');
      }),
    ).rejects.toThrow('version admission rejected');
    expect(f.events).not.toContain('terminate-instances');
    expect(states).toEqual(['intact']);
    const admit = async (state: string) => {
      states.push(state);
    };
    await f.driver.quiesce(f.plan, undefined, admit);
    await f.driver.quiesce(f.plan, undefined, admit);
    expect(states).toEqual(['intact', 'intact', 'complete']);
    expect(f.events.filter((event) => event === 'terminate-instances')).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});

test('native shutdown already in progress is reported as partial before reconciliation', async () => {
  const f = await fixture();
  try {
    f.old.State.Name = 'shutting-down';
    const states: string[] = [];
    await expect(
      f.driver.quiesce(f.plan, undefined, async (state) => {
        states.push(state);
        throw new Error('recorded admission required');
      }),
    ).rejects.toThrow('recorded admission required');
    expect(states).toEqual(['partial']);
    expect(f.events).not.toContain('terminate-instances');
  } finally {
    await f.cleanup();
  }
});
