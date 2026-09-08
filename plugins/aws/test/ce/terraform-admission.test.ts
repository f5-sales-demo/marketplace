import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { admitAwsTerraformSites } from '../../src/ce/terraform-admission';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import { foundationPlan } from './terraform-fixtures';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture() {
  const base = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = base;
  const full = {
    ...draft,
    deploymentName: base.intent.deploymentName,
    accountId: base.intent.accountId,
    region: base.intent.region,
  };
  const planSha256 = canonicalSha256(full);
  const plan = { ...full, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
  let configuration = renderAwsTerraformFoundation(plan);
  let applied = true;
  let failApply = false;
  const nodes = new Set<number>();
  const records = new Map<string, unknown>();
  const outputs = () => ({
    ce_vpc_id: 'vpc-12345678',
    ce_interfaces: Object.fromEntries(
      [1, 2, 3].flatMap((node) =>
        [0, 1].map((index) => [
          `${node}:${index}`,
          {
            node,
            index,
            role: index ? 'sli' : 'slo',
            site_name: `site-${node}`,
            id: `eni-${String(node * 10 + index).padStart(8, '0')}`,
            subnet_id: `subnet-${String(node * 10 + index).padStart(8, '0')}`,
            mac: `00:11:22:33:0${node}:0${index}`,
            private_ip: `10.0.${node * 2 + index}.4`,
          },
        ]),
      ),
    ),
    ce_instances: Object.fromEntries(
      [...nodes].map((node) => [
        String(node),
        { id: `i-${String(node).padStart(8, '0')}`, site_name: `site-${node}`, hostname: `ce-${node}` },
      ]),
    ),
  });
  const session: TerraformSession = {
    async readOutputs() {
      if (!applied) throw new Error('Terraform outputs require an applied or converged current configuration');
      return outputs();
    },
    async reviseConfiguration(expected, next) {
      if (expected !== hash(configuration)) throw new Error('Terraform configuration revision is stale');
      configuration = next;
      applied = false;
      return hash(next);
    },
    async plan() {
      return {
        schemaVersion: 1,
        deploymentId: 'ce',
        engine: 'terraform',
        backendIdentity: 'local:ce',
        configurationSha256: hash(configuration),
        providerLockSha256: 'lock',
        planSha256: 'binary',
        changes: [{ address: 'aws_instance.next', type: 'aws_instance', actions: ['create'] }],
        noChanges: false,
      };
    },
    async apply() {
      if (failApply) {
        failApply = false;
        throw new Error('interrupted');
      }
      for (const key of Object.keys(JSON.parse(configuration).resource.aws_instance ?? {}))
        nodes.add(Number(key.slice(5)));
      applied = true;
    },
  };
  const storage = {
    async verify() {},
    async read(name: string) {
      if (!records.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(records.get(name));
    },
    async write(name: string, value: unknown) {
      records.set(name, structuredClone(value));
    },
  };
  const api = {
    async exec(_command: string, args: string[]) {
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(
          args[0] === 'sts'
            ? { Account: plan.accountId }
            : {
                NetworkInterfaces: Object.values(outputs().ce_interfaces).map((item) => ({
                  NetworkInterfaceId: item.id,
                  OwnerId: plan.accountId,
                  VpcId: 'vpc-12345678',
                  SubnetId: item.subnet_id,
                  AvailabilityZone: `us-east-1${['a', 'b', 'c'][item.node - 1]}`,
                  MacAddress: item.mac,
                  PrivateIpAddress: item.private_ip,
                  SourceDestCheck: false,
                  Status: nodes.has(item.node) ? 'in-use' : 'available',
                  ...(nodes.has(item.node)
                    ? { Attachment: { InstanceId: `i-${String(item.node).padStart(8, '0')}`, DeviceIndex: item.index } }
                    : {}),
                  TagSet: Object.entries({
                    'xcsh-managed-by': 'aws-ce',
                    'xcsh-execution-engine': 'terraform',
                    'xcsh-deployment-id': 'ce',
                    'xcsh-plan-sha256': plan.planSha256,
                    'ves-io-site-name': item.site_name,
                    'xcsh-node-index': String(item.node),
                    'xcsh-interface-index': String(item.index),
                  }).map(([Key, Value]) => ({ Key, Value })),
                })),
              },
        ),
      };
    },
  };
  const bootstrapped: string[] = [];
  let healthy = false;
  const runtime = {
    async reserveSite() {},
    async bootstrap(_binding: unknown, node: string) {
      bootstrapped.push(node);
      return '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture\n';
    },
    async observeRegistrations() {
      return { status: healthy ? 'healthy' : 'degraded' };
    },
    async approveRegistrations() {
      return { status: healthy ? 'healthy' : 'degraded' };
    },
  };
  return {
    plan,
    session,
    storage,
    api,
    runtime,
    nodes,
    bootstrapped,
    healthy: () => {
      healthy = true;
    },
    interrupt: () => {
      failApply = true;
    },
  };
}
it('admits independent sites cumulatively and waits for registration before the next site', async () => {
  const f = fixture();
  expect((await admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).status).toBe(
    'pending-registration',
  );
  expect([...f.nodes]).toEqual([1]);
  f.healthy();
  expect((await admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).status).toBe(
    'registered-awaiting-interface-configuration',
  );
  expect([...f.nodes]).toEqual([1, 2, 3]);
  expect(f.bootstrapped).toEqual(['ce-1', 'ce-2', 'ce-3']);
  const checkpoint = (await f.storage.read('terraform-admission.json')) as { bootstrapByNode: Record<string, string> };
  expect(checkpoint.bootstrapByNode['1']).toContain('hostname: ce-1');
});
it('resumes after interrupted apply without minting bootstrap again or omitting earlier nodes', async () => {
  const f = fixture();
  f.interrupt();
  await expect(admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).rejects.toThrow(
    'interrupted',
  );
  f.healthy();
  expect((await admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).status).toBe(
    'registered-awaiting-interface-configuration',
  );
  expect(f.bootstrapped).toEqual(['ce-1', 'ce-2', 'ce-3']);
  expect([...f.nodes]).toEqual([1, 2, 3]);
});

it('rejects update/replacement work during initial admission', async () => {
  const f = fixture();
  const plan = f.session.plan.bind(f.session);
  f.session.plan = async (...args) => ({
    ...(await plan(...args)),
    changes: [{ address: 'aws_instance.existing', type: 'aws_instance', actions: ['delete', 'create'] }],
  });
  await expect(admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).rejects.toThrow(
    'alter or replace',
  );
  expect([...f.nodes]).toEqual([]);
});
