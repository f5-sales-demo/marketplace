import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../../src/aws/exec';
import { runAwsSiteReplacement } from '../../src/ce/site-replacement';
import { createTerraformAwsSiteReplacementDriver } from '../../src/ce/terraform-site-replacement';
import { replacementContract, replacementObservation } from './replacement-version-fixtures';
import { terraformReplacementFixture } from './terraform-replacement-fixtures';

// biome-ignore lint/suspicious/noExplicitAny: Heterogeneous AWS response fixtures are intentionally mutable for failure injection.
type Json = Record<string, any>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function fixture(ha = false) {
  const f = terraformReplacementFixture(ha);
  const root = await mkdtemp(join(tmpdir(), 'tf-ce-replacement-'));
  const store = await CeDeploymentStore.open(root, f.replacement.binding.owner);
  const selected = f.replacement.binding.nodes.map((node) => Number(node.split('-').at(-1)));
  const enis: Json[] = [],
    instances: Record<string, Json> = {},
    addresses: Json[] = [];
  const active: Record<string, string> = {};
  for (let node = 1; node <= 3; node++) {
    const id = `i-${12345677 + node}`;
    active[node] = id;
    const site = ha ? 'site' : `site-${node}`;
    const tags = (index?: number) =>
      Object.entries({
        'xcsh-managed-by': 'aws-ce',
        'xcsh-execution-engine': 'terraform',
        'xcsh-deployment-id': 'ce',
        'xcsh-plan-sha256': f.base.planSha256,
        'xcsh-node-index': String(node),
        'ves-io-site-name': site,
        ...(index === undefined ? {} : { 'xcsh-interface-index': String(index) }),
      }).map(([Key, Value]) => ({ Key, Value }));
    instances[id] = {
      InstanceId: id,
      ImageId: f.base.intent.image.amiId,
      InstanceType: f.base.intent.instance.type,
      State: { Name: 'running' },
      Tags: tags(),
    };
    for (let nic = 0; nic < 2; nic++) {
      const role = nic ? 'sli' : 'slo';
      const proof = f.replacement.preparation.interfaces as Json[];
      enis.push({
        NetworkInterfaceId: f.replacement.interfaceIds[`ce-${node}/${role}`] ?? `eni-${22345678 + node * 2 + nic}`,
        SubnetId: `subnet-${12345678 + node * 2 + nic}`,
        VpcId: 'vpc-12345678',
        OwnerId: f.base.accountId,
        MacAddress:
          proof.find((item) => item.node === `ce-${node}` && item.role === role)?.mac ??
          `02:00:00:00:0${node}:0${nic + 1}`,
        PrivateIpAddress: `10.0.${node}.${10 + nic}`,
        AvailabilityZone: f.base.intent.interfaces[nic].subnets[node - 1].availabilityZone,
        Status: 'in-use',
        SourceDestCheck: false,
        Attachment: { InstanceId: id, DeviceIndex: nic, DeleteOnTermination: false },
        TagSet: tags(nic),
      });
    }
    addresses.push({
      AllocationId: f.replacement.elasticIpAllocationIds[`ce-${node}`] ?? `eipalloc-${22345678 + node}`,
      AssociationId: `eipassoc-${12345678 + node}`,
      NetworkInterfaceId: enis.at(-2)?.NetworkInterfaceId,
      Tags: tags(),
    });
  }
  let configuration = f.configuration;
  const events: string[] = [];
  const flags = {
    lostQuiesce: false,
    lostLaunch: false,
    wrongPlanId: false,
    wrongOutput: false,
    partial: false,
    lostState: false,
  };
  let mutated = false;
  const session: TerraformSession = {
    readConfiguration: async (expected) => {
      if (hash(configuration) !== expected) throw new Error('snapshot stale');
      return configuration;
    },
    reviseConfiguration: async (expected, value) => {
      if (expected !== hash(configuration)) throw new Error('Terraform configuration revision is stale');
      configuration = value;
      return hash(value);
    },
    plan: async () => {
      const desired = JSON.parse(configuration).resource.aws_instance ?? {};
      const changes: PlanReceipt['changes'] = [];
      for (const node of selected) {
        const want = !!desired[`node_${node}`];
        for (const type of ['aws_instance', 'aws_eip_association']) {
          const exists =
            !flags.lostState && !!(type === 'aws_instance' ? active[node] : addresses[node - 1].AssociationId);
          if (exists !== want)
            changes.push({ address: `${type}.node_${node}`, type, actions: [want ? 'create' : 'delete'] });
        }
      }
      return {
        ...f.receipt(desired.node_1 ? 'launch' : 'quiesce'),
        configurationSha256: hash(configuration),
        changes,
        noChanges: !changes.length,
      };
    },
    readPlannedResourceIds: async (_receipt, wanted) =>
      Object.fromEntries(
        wanted.map((address) => {
          const node = Number(address.split('node_')[1]);
          return [
            address,
            flags.lostState
              ? null
              : flags.wrongPlanId
                ? 'i-99999999'
                : address.startsWith('aws_instance.')
                  ? (active[node] ?? null)
                  : (addresses[node - 1].AssociationId ?? null),
          ];
        }),
      ),
    apply: async (receipt) => {
      events.push('apply');
      const launching = JSON.parse(configuration).resource.aws_instance?.node_1 !== undefined;
      if (receipt.noChanges) return;
      for (const node of selected) {
        const group = enis.filter((eni) =>
          eni.TagSet.some((tag: Json) => tag.Key === 'xcsh-node-index' && tag.Value === String(node)),
        );
        if (!launching) {
          instances[active[node]].State.Name = 'terminated';
          delete active[node];
          delete addresses[node - 1].AssociationId;
          for (const eni of group) {
            delete eni.Attachment;
            eni.Status = 'available';
          }
        } else {
          const id = `i-${87654320 + node}`;
          active[node] = id;
          instances[id] = { ...instances[`i-${12345677 + node}`], InstanceId: id, State: { Name: 'running' } };
          for (const [index, eni] of group.entries()) {
            eni.Attachment = { InstanceId: id, DeviceIndex: index, DeleteOnTermination: false };
            eni.Status = 'in-use';
          }
          addresses[node - 1].AssociationId = `eipassoc-${87654320 + node}`;
        }
      }
      if (!mutated && ((launching && flags.lostLaunch) || (!launching && flags.lostQuiesce))) {
        mutated = true;
        throw new Error('lost Terraform apply response');
      }
    },
    readOutputs: async () => ({
      ce_vpc_id: 'vpc-12345678',
      ce_interfaces: Object.fromEntries(
        enis.map((eni) => {
          const tag = (key: string) => eni.TagSet.find((t: Json) => t.Key === key).Value;
          const node = Number(tag('xcsh-node-index')),
            index = Number(tag('xcsh-interface-index'));
          return [
            `${node}:${index}`,
            {
              id: eni.NetworkInterfaceId,
              subnet_id: eni.SubnetId,
              mac: eni.MacAddress,
              private_ip: eni.PrivateIpAddress,
              node,
              index,
              role: index ? 'sli' : 'slo',
              site_name: tag('ves-io-site-name'),
            },
          ];
        }),
      ),
      ce_instances: Object.fromEntries(
        Object.entries(active).map(([node, id]) => [
          node,
          {
            id: flags.wrongOutput ? 'i-99999999' : id,
            hostname: `ce-${node}`,
            site_name: ha ? 'site' : `site-${node}`,
          },
        ]),
      ),
    }),
  };
  const api: AwsExecApi = {
    exec: async (_command, args) => {
      const operation = args[1];
      events.push(operation);
      expect(args[args.indexOf('--profile') + 1]).toBe('ce-profile');
      expect(args[args.indexOf('--region') + 1]).toBe('us-east-1');
      let value: Json = {};
      if (operation === 'get-caller-identity')
        value = { Account: f.base.accountId, Arn: `arn:aws:sts::${f.base.accountId}:assumed-role/test/user` };
      else if (operation === 'describe-instances')
        value = { Reservations: [{ Instances: [instances[args[args.indexOf('--instance-ids') + 1]]] }] };
      else if (operation === 'describe-network-interfaces')
        value = { NetworkInterfaces: enis.filter((eni) => args.includes(eni.NetworkInterfaceId)) };
      else if (operation === 'describe-addresses')
        value = { Addresses: addresses.filter((address) => args.includes(address.AllocationId)) };
      else throw new Error('Native cloud mutation is forbidden for Terraform ownership');
      if (flags.partial) value.NextToken = 'remaining';
      return { stdout: JSON.stringify(value), stderr: '', exitCode: 0 };
    },
  };
  const open = () =>
    createTerraformAwsSiteReplacementDriver(f.base, f.replacement, hash(f.configuration), session, store, api, {});
  return {
    ...f,
    open,
    store,
    flags,
    events,
    enis,
    active,
    addresses,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

for (const ha of [false, true])
  test(`Terraform driver replaces ${ha ? 'HA' : 'independent'} site and resumes without native mutations`, async () => {
    const f = await fixture(ha);
    try {
      const driver = await f.open();
      await driver.assertOwnership(f.replacement, 'quiesce');
      await driver.quiesce(f.replacement);
      const result = await driver.launch(f.replacement, f.material);
      expect(Object.keys(result)).toHaveLength(ha ? 3 : 1);
      await driver.assertOwnership(f.replacement, 'complete', result);
      const resumed = await f.open();
      expect(await resumed.launch(f.replacement, f.material)).toEqual(result);
      if (!ha) expect(f.active['2']).toBe('i-12345679');
    } finally {
      await f.cleanup();
    }
  });
for (const phase of ['quiesce', 'launch'])
  test(`Terraform driver recovers interrupted ${phase} with observed identities`, async () => {
    const f = await fixture();
    try {
      const driver = await f.open();
      if (phase === 'quiesce') {
        f.flags.lostQuiesce = true;
        await expect(driver.quiesce(f.replacement)).rejects.toThrow('lost');
      }
      await driver.quiesce(f.replacement);
      if (phase === 'launch') {
        f.flags.lostLaunch = true;
        await expect(driver.launch(f.replacement, f.material)).rejects.toThrow('lost');
      }
      expect(await (await f.open()).launch(f.replacement, f.material)).toEqual({ 'ce-1': 'i-87654321' });
    } finally {
      await f.cleanup();
    }
  });
test('Terraform driver rejects an imported foreign deletion target before apply', async () => {
  const f = await fixture();
  try {
    const driver = await f.open();
    f.flags.wrongPlanId = true;
    await expect(driver.quiesce(f.replacement)).rejects.toThrow('different cloud resource');
    expect(f.events).not.toContain('apply');
  } finally {
    await f.cleanup();
  }
});
test('Terraform driver rejects partial observations and wrong engine resource tags', async () => {
  const f = await fixture();
  try {
    const driver = await f.open();
    f.flags.partial = true;
    await expect(driver.quiesce(f.replacement)).rejects.toThrow();
    f.flags.partial = false;
    f.enis[0].TagSet.find((tag: Json) => tag.Key === 'xcsh-execution-engine').Value = 'native';
    await expect(driver.quiesce(f.replacement)).rejects.toThrow('ownership');
    expect(f.events).not.toContain('apply');
  } finally {
    await f.cleanup();
  }
});
test('Terraform driver refuses changed bootstrap and output identity on resume', async () => {
  const f = await fixture();
  try {
    const driver = await f.open();
    await driver.quiesce(f.replacement);
    await driver.launch(f.replacement, f.material);
    await expect(driver.launch(f.replacement, { 'ce-1': `${f.material['ce-1']}changed: true\n` })).rejects.toThrow(
      'bootstrap changed',
    );
    f.flags.wrongOutput = true;
    await expect(driver.assertOwnership(f.replacement, 'complete', { 'ce-1': 'i-87654321' })).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});

test('Terraform driver stops when a live replacement is missing from Terraform state', async () => {
  const f = await fixture();
  try {
    const driver = await f.open();
    await driver.quiesce(f.replacement);
    await driver.launch(f.replacement, f.material);
    f.flags.lostState = true;
    const applies = f.events.filter((event) => event === 'apply').length;
    await expect(driver.launch(f.replacement, f.material)).rejects.toThrow('reconcile state');
    expect(f.events.filter((event) => event === 'apply')).toHaveLength(applies);
  } finally {
    await f.cleanup();
  }
});

for (const ha of [false, true])
  test(`shared coordinator completes the Terraform ${ha ? 'HA' : 'independent'} replacement loop`, async () => {
    const f = await fixture(ha);
    try {
      const originalBootstrap = Object.fromEntries(
        Object.entries(f.original.resource.aws_instance).map(([name, value]) => [
          name.slice(5),
          Buffer.from((value as Json).user_data_base64, 'base64').toString('utf8'),
        ]),
      );
      const admittedSites = f.base.intent.topology.sites?.map((site) => site.name) ?? ['site'];
      await f.store.write('terraform-admission.json', {
        schemaVersion: 1,
        planSha256: f.base.planSha256,
        configurationSha256: hash(f.configuration),
        bootstrapByNode: originalBootstrap,
        admittedSites,
      });
      const driver = await f.open();
      let uid: string | undefined = 'old-site';
      let creates = 0;
      const runtime = {
        engine: 'terraform' as const,
        observeUpgrade: async () => replacementObservation(f.replacement.binding, uid),
        ownedSiteConfiguration: () => ({ routing: 'original' }),
        observeOwnedSite: async () => {
          if (!uid) throw Object.assign(new Error('absent'), { category: 'not-found' });
          return { system_metadata: { uid }, resource_version: 'one' };
        },
        deleteBootstrapToken: async () => {},
        deleteSite: async () => {
          for (const node of f.replacement.binding.nodes)
            expect(f.active[node.split('-').at(-1) ?? '']).toBeUndefined();
          uid = undefined;
        },
        ensureAwsPreparedSite: async (
          _binding: unknown,
          _preparation: unknown,
          save: (record: unknown) => Promise<void>,
        ) => {
          if (!uid) {
            uid = 'new-site';
            creates++;
          }
          await save({ uid });
        },
        bootstrap: async () => '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture\n',
        approveRegistrations: async () => ({ status: 'healthy' }),
        observeRegistrations: async () => ({ status: 'healthy' }),
        observeAwsRegisteredConfiguration: async () => ({ status: 'configured' }),
        ensureAwsInterfaceMtu: async () => {},
      };
      const run = () =>
        runAwsSiteReplacement(
          f.replacement,
          f.replacement.planSha256,
          driver,
          runtime as never,
          f.store,
          replacementContract,
        );
      expect((await run()).status).toBe('registered-with-configured-interfaces');
      expect((await run()).status).toBe('registered-with-configured-interfaces');
      expect(creates).toBe(1);
      const admission = (await f.store.read('terraform-admission.json')) as Json;
      expect(admission.admittedSites).toEqual(admittedSites);
      expect(admission.bootstrapByNode['1']).not.toBe(originalBootstrap['1']);
      if (!ha) expect(admission.bootstrapByNode['2']).toBe(originalBootstrap['2']);
      const marker = (await f.store.read(`${f.replacement.planId}-terraform-launch.json`)) as Json;
      expect(admission.configurationSha256).toBe(marker.configurationSha256);
      await f.store.write('terraform-admission.json', { ...admission, configurationSha256: '0'.repeat(64) });
      await expect(run()).rejects.toThrow('admission changed');
    } finally {
      await f.cleanup();
    }
  });

for (const ha of [false, true])
  test(`Terraform ${ha ? 'HA' : 'independent'} quiescence gates the exact apply and reports completed recovery`, async () => {
    const f = await fixture(ha);
    try {
      const driver = await f.open();
      const states: string[] = [];
      await expect(
        driver.quiesce(f.replacement, undefined, async (state) => {
          states.push(state);
          throw new Error('version admission rejected');
        }),
      ).rejects.toThrow('version admission rejected');
      expect(f.events).not.toContain('apply');
      const admit = async (state: string) => {
        states.push(state);
      };
      await driver.quiesce(f.replacement, undefined, admit);
      await driver.quiesce(f.replacement, undefined, admit);
      expect(states).toEqual(['intact', 'intact', 'complete']);
    } finally {
      await f.cleanup();
    }
  });

test('Terraform admission recognizes an association-only partial shutdown before VM deletion', async () => {
  const f = await fixture();
  try {
    const driver = await f.open();
    delete f.addresses[0].AssociationId;
    const states: string[] = [];
    await expect(
      driver.quiesce(f.replacement, undefined, async (state) => {
        states.push(state);
        throw new Error('recorded admission required');
      }),
    ).rejects.toThrow('recorded admission required');
    expect(states).toEqual(['partial']);
    expect(f.events).not.toContain('apply');
    const admit = async (state: string) => {
      states.push(state);
    };
    await driver.quiesce(f.replacement, undefined, admit);
    await driver.quiesce(f.replacement, undefined, admit);
    expect(states).toEqual(['partial', 'partial', 'complete']);
  } finally {
    await f.cleanup();
  }
});

test('replacement binds the prior admission even when composed routing changed the current configuration hash', async () => {
  const f = await fixture();
  try {
    const bootstrapByNode = Object.fromEntries(
      Object.entries(f.original.resource.aws_instance).map(([name, value]) => [
        name.slice(5),
        Buffer.from((value as Json).user_data_base64, 'base64').toString('utf8'),
      ]),
    );
    await f.store.write('terraform-admission.json', {
      schemaVersion: 1,
      planSha256: f.base.planSha256,
      configurationSha256: 'a'.repeat(64),
      admittedSites: f.base.intent.topology.sites?.map((site) => site.name),
      bootstrapByNode,
    });
    const driver = await f.open();
    await driver.quiesce(f.replacement);
    const instances = await driver.launch(f.replacement, f.material);
    await driver.finalize?.(f.replacement, instances);
    const admission = (await f.store.read('terraform-admission.json')) as Json;
    expect(admission.configurationSha256).not.toBe('a'.repeat(64));
    await driver.finalize?.(f.replacement, instances);
  } finally {
    await f.cleanup();
  }
});

test('source admission with different bootstrap is rejected before shutdown', async () => {
  const f = await fixture();
  try {
    await f.store.write('terraform-admission.json', {
      schemaVersion: 1,
      planSha256: f.base.planSha256,
      configurationSha256: 'a'.repeat(64),
      admittedSites: ['site-1'],
      bootstrapByNode: {},
    });
    await expect(f.open()).rejects.toThrow('source admission differs');
    expect(f.events).not.toContain('apply');
  } finally {
    await f.cleanup();
  }
});

test('Connect replacement rejects missing automatic routing recovery before any Terraform action', async () => {
  const f = await fixture();
  try {
    f.base.routing = { profile: 'tgw-connect' };
    await expect(f.open()).rejects.toThrow('automatic routing recovery');
    expect(f.events).toHaveLength(0);
    await expect(f.store.read(`${f.replacement.planId}-terraform-source.json`)).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});
