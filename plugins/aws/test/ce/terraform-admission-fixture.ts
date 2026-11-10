import { afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { qualifyAwsTerraformBrownfieldPlacement } from '../../src/ce/terraform-brownfield-placement';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import { brownfieldPlacementFixture } from './terraform-brownfield-fixture';
import { foundationPlan } from './terraform-fixtures';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function admissionFixture(ha = false, staticAddressing = false, brownfield = false) {
  const brownfieldFixture = brownfield ? brownfieldPlacementFixture() : undefined;
  const base = brownfieldFixture?.plan ?? foundationPlan(ha);
  if (staticAddressing) {
    for (const item of base.intent.interfaces)
      item.addressing = {
        mode: 'static',
        addresses: item.subnets.map((subnet) => `${subnet.cidr?.split('/')[0].replace(/\.0$/, '.20')}/24`),
      };
  }
  const { planId: _id, planSha256: _sha, ...draft } = base;
  const full = {
    ...draft,
    deploymentName: base.intent.deploymentName,
    accountId: base.intent.accountId,
    region: base.intent.region,
  };
  const planSha256 = canonicalSha256(full);
  const plan = { ...full, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
  let configuration = renderAwsTerraformFoundation(
    plan,
    {},
    brownfieldFixture ? qualifyAwsTerraformBrownfieldPlacement(plan, brownfieldFixture.observation) : undefined,
  );
  let applied = true;
  let failApply = false;
  const nodes = new Set<number>();
  const records = new Map<string, unknown>();
  const siteNameFor = (node: number) =>
    plan.intent.topology.sites?.find((site: { nodeIndexes: number[] }) => site.nodeIndexes.includes(node))?.name ??
    `site-${node}`;
  const outputs = () => ({
    ce_vpc_id: 'vpc-12345678',
    ce_interfaces: Object.fromEntries(
      Array.from({ length: plan.intent.topology.nodeCount }, (_, i) => i + 1).flatMap((node) =>
        [0, 1].map((index) => [
          `${node}:${index}`,
          {
            node,
            index,
            role: index ? 'sli' : 'slo',
            site_name: siteNameFor(node),
            id: `eni-${String(node * 10 + index).padStart(8, '0')}`,
            subnet_id: brownfieldFixture
              ? plan.intent.interfaces[index].subnets[0].subnetId
              : `subnet-${String(node * 10 + index).padStart(8, '0')}`,
            mac: `00:11:22:33:0${node}:0${index}`,
            private_ip: staticAddressing ? `10.0.${index * 3 + node}.20` : `10.0.${node * 2 + index}.4`,
          },
        ]),
      ),
    ),
    ce_instances: Object.fromEntries(
      [...nodes].map((node) => [
        String(node),
        { id: `i-${String(node).padStart(8, '0')}`, site_name: siteNameFor(node), hostname: `ce-${node}` },
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
  const directory = mkdtempSync(join(tmpdir(), 'aws-admission-lifecycle-'));
  directories.push(directory);
  const storage = {
    directory,
    owner: {
      deploymentId: plan.deploymentName,
      engine: 'terraform' as const,
      provider: 'aws' as const,
      account: plan.accountId,
      region: plan.region,
    },
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
      if (brownfieldFixture && args[0] === 'ec2' && args[1] !== 'describe-network-interfaces') {
        const id = args[args.findIndex((a) => a.endsWith('-ids')) + 1];
        const row = brownfieldFixture.observation.resources.find((r) => r.id === id);
        if (!row) throw new Error('unexpected brownfield reference');
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(row.state) };
      }
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(
          args[0] === 'sts'
            ? { Account: plan.accountId, Arn: `arn:aws:iam::${plan.accountId}:role/example-role` }
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
  const ensuredSites: unknown[] = [];
  let healthy = false;
  const runtime = {
    async reserveSite() {},
    async ensureSite(_binding: unknown, intent: unknown) {
      ensuredSites.push(structuredClone(intent));
    },
    async ensureAwsInterfaceMtu() {},
    async observeAwsRegisteredConfiguration() {
      return { status: 'configured' as const };
    },
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
    brownfieldObservation: brownfieldFixture?.observation,
    session,
    storage,
    api,
    runtime,
    nodes,
    bootstrapped,
    ensuredSites,
    healthy: () => {
      healthy = true;
    },
    interrupt: () => {
      failApply = true;
    },
  };
}
