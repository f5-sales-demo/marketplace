import { expect, it } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  assertAwsBootstrapKeyPair,
  normalizeAwsBootstrapKeyPairName,
  observeAwsBootstrapKeyPairs,
  parseAwsBootstrapKeyPairs,
  revalidateAwsBootstrapKeyPair,
  selectAwsBootstrapKeyPair,
} from '../../src/ce/bootstrap-key-pair';
import { canonicalSha256 } from '../../src/ce/canonical';
import { discoverAwsCompute } from '../../src/ce/discovery';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import type { AwsCeObservation, AwsCePlan } from '../../src/ce/types';
import { createAwsCePlanTool } from '../../src/tools/aws-ce-plan';
import { createAwsComputeDiscoverTool } from '../../src/tools/aws-compute-discover';
import { DiscoveryFixtureApi, discoveryFixtureCapabilities, discoveryFixtureFetch } from './discovery-fixture';
import { foundationPlan } from './terraform-fixtures';

const region = 'us-east-1';
const name = 'fixture-bootstrap';
const bytes = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
function wire(part: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(part.length);
  return Buffer.concat([length, part]);
}
const publicKey = `ssh-ed25519 ${Buffer.concat([wire(Buffer.from('ssh-ed25519')), wire(bytes)]).toString('base64')}`;
const row = { KeyName: name, KeyPairId: 'key-0123456789abcdef0', KeyType: 'ed25519', PublicKey: publicKey };
const binding = parseAwsBootstrapKeyPairs({ KeyPairs: [row] }, region, [name])[0];
function boundPlan(keyName = name): AwsCePlan {
  const plan = foundationPlan();
  plan.region = region;
  plan.intent.instance.bootstrapKeyPairName = keyName;
  plan.instance = plan.intent.instance;
  plan.bootstrapKeyPair = { ...binding, name: keyName };
  const { planId: _id, planSha256: _sha, ...draft } = plan;
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
}
function observation(): AwsCeObservation {
  return {
    identity: { accountId: '123456789012', partition: 'aws' },
    bootstrapKeyPairs: [binding],
  } as AwsCeObservation;
}

it('retains only public key digest with exact regional name and ID', () => {
  expect(binding).toEqual({
    name,
    id: row.KeyPairId,
    region,
    publicKeySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(JSON.stringify(binding)).not.toContain(publicKey);
});
it('rejects incomplete, paginated, duplicate, foreign and malformed key evidence', () => {
  for (const data of [
    {},
    { KeyPairs: [] },
    { KeyPairs: [row], NextToken: 'next' },
    { KeyPairs: [row, row] },
    { KeyPairs: [{ ...row, KeyName: 'foreign' }] },
    { KeyPairs: [{ ...row, KeyPairId: '__UNRESOLVED__' }] },
    { KeyPairs: [{ ...row, PublicKey: 'private-key-material' }] },
    { KeyPairs: [{ ...row, KeyType: 'rsa' }] },
  ])
    expect(() => parseAwsBootstrapKeyPairs(data, region, [name])).toThrow();
});
it('rejects invalid names while preserving literal valid names', () => {
  for (const value of [undefined, true, '', ' ', 'x'.repeat(256), 'name\nother', 'name\0']) {
    expect(() => normalizeAwsBootstrapKeyPairName(value)).toThrow();
  }
  expect(normalizeAwsBootstrapKeyPairName(name)).toBe(name);
});
it('fetches the actual public-key EC2 schema and refuses service failures', async () => {
  const calls: string[][] = [];
  const result = await observeAwsBootstrapKeyPairs(
    {
      exec: async (_command, args) => {
        calls.push(args);
        return { stdout: JSON.stringify({ KeyPairs: [row] }), stderr: '', exitCode: 0 };
      },
    },
    region,
    [name],
  );
  expect(result).toEqual([binding]);
  expect(calls[0]).toContain('--include-public-key');
  expect(calls[0]).toContain(JSON.stringify({ KeyNames: [name] }));
  await expect(
    observeAwsBootstrapKeyPairs({ exec: async () => ({ stdout: '', stderr: 'AccessDenied', exitCode: 1 }) }, region, [
      name,
    ]),
  ).rejects.toThrow('unavailable or unauthorized');
});
it('requires exact account, regional selection and current immutable key identity', () => {
  const plan = boundPlan();
  const baseline = observation();
  expect(selectAwsBootstrapKeyPair(plan.intent, baseline)).toEqual(binding);
  expect(() => assertAwsBootstrapKeyPair(plan, baseline)).not.toThrow();
  for (const current of [
    { ...baseline, identity: { ...baseline.identity, accountId: 'example-foreign-account' } },
    { ...baseline, bootstrapKeyPairs: [] },
    { ...baseline, bootstrapKeyPairs: [binding, binding] },
    { ...baseline, bootstrapKeyPairs: [{ ...binding, region: 'us-west-2' }] },
    { ...baseline, bootstrapKeyPairs: [{ ...binding, id: 'key-fedcba9876543210' }] },
    { ...baseline, bootstrapKeyPairs: [{ ...binding, publicKeySha256: 'f'.repeat(64) }] },
  ])
    expect(() => assertAwsBootstrapKeyPair(plan, current)).toThrow();
});
it('renders existing EC2 key name without changing F5 cloud-init or creating a key resource', () => {
  const bootstrap = '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-only\n';
  const config = JSON.parse(renderAwsTerraformFoundation(boundPlan(), { '1': bootstrap }));
  expect(config.resource.aws_instance.node_1.key_name).toBe(name);
  expect(Buffer.from(config.resource.aws_instance.node_1.user_data_base64, 'base64').toString()).toBe(bootstrap);
  expect(config.resource.aws_key_pair).toBeUndefined();
});
it('teardown need not resolve or delete an already-retired borrowed key', () => {
  const plan = boundPlan();
  plan.intent.operation = 'teardown';
  delete plan.bootstrapKeyPair;
  expect(selectAwsBootstrapKeyPair(plan.intent, observation())).toBeUndefined();
  expect(() => assertAwsBootstrapKeyPair(plan)).not.toThrow();
});

it('replacement revalidation refuses a changed real key-pair ID and a foreign caller before creation', async () => {
  const plan = boundPlan();
  plan.accountId = plan.intent.accountId;
  plan.partition = plan.intent.partition;
  const calls: string[] = [];
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args[1]);
      return {
        stdout: JSON.stringify(
          args[0] === 'sts'
            ? { Account: plan.accountId, Arn: `arn:aws:sts::${plan.accountId}:assumed-role/test/session` }
            : { KeyPairs: [row] },
        ),
        stderr: '',
        exitCode: 0,
      };
    },
  };
  await revalidateAwsBootstrapKeyPair(plan, api);
  expect(calls).toEqual(['get-caller-identity', 'describe-key-pairs']);
  const drift = {
    exec: async (_command: string, args: string[]) => ({
      stdout: JSON.stringify(
        args[0] === 'sts'
          ? { Account: plan.accountId, Arn: `arn:aws:sts::${plan.accountId}:assumed-role/test/session` }
          : { KeyPairs: [{ ...row, KeyPairId: 'key-fedcba9876543210' }] },
      ),
      stderr: '',
      exitCode: 0,
    }),
  };
  await expect(revalidateAwsBootstrapKeyPair(plan, drift)).rejects.toThrow('changed before VM creation');
  await expect(
    revalidateAwsBootstrapKeyPair(plan, {
      exec: async () => ({
        stdout: JSON.stringify({ Account: 'example-foreign-account', Arn: 'arn:aws:iam::999999999999:user/test' }),
        stderr: '',
        exitCode: 0,
      }),
    }),
  ).rejects.toThrow('caller account changed');
});

it('advertises the borrowed key on both public schemas without accepting private-key objects', () => {
  const pi = { typebox: { Type } } as never;
  const property =
    createAwsCePlanTool(pi).parameters.properties.intent.properties.instance.properties.bootstrapKeyPairName;
  expect(property).toBeDefined();
  if (!property) throw new Error('Public boot-key schema missing');
  expect(Value.Check(property, name)).toBe(true);
  expect(Value.Check(property, { privateKey: 'invalid' })).toBe(false);
  const names = createAwsComputeDiscoverTool(pi).parameters.properties.bootstrapKeyPairNames;
  expect(names).toBeDefined();
  if (!names) throw new Error('Public discovery key schema missing');
  expect(Value.Check(names, [name])).toBe(true);
  for (const value of [[], [name, name], [{ privateKey: 'invalid' }]]) expect(Value.Check(names, value)).toBe(false);
});
it('joins actual discovery with region-bound public-key evidence and rejects failure without dummy success', async () => {
  const input = {
    accountId: '123456789012',
    partition: 'aws' as const,
    deploymentName: 'fixture',
    requiredEnis: 2,
    nodeCount: 1 as const,
    brownfieldResourceIds: [],
    resourceRegion: region,
    bootstrapKeyPairNames: [name],
    f5Capabilities: discoveryFixtureCapabilities,
  };
  const fixture = new DiscoveryFixtureApi();
  const api = {
    exec: async (command: string, args: string[]) =>
      args[1] === 'describe-key-pairs'
        ? { stdout: JSON.stringify({ KeyPairs: [row] }), stderr: '', exitCode: 0 }
        : fixture.exec(command, args),
  };
  const observed = await discoverAwsCompute(input, api, discoveryFixtureFetch as typeof fetch);
  expect(observed.bootstrapKeyPairs).toEqual([binding]);
  expect(observed.identity.accountId).toBe(input.accountId);
  const callsBefore = fixture.calls.length;
  await expect(
    discoverAwsCompute({ ...input, resourceRegion: undefined }, api, discoveryFixtureFetch as typeof fetch),
  ).rejects.toThrow('explicit region-local');
  expect(fixture.calls.length).toBe(callsBefore);
  await expect(
    discoverAwsCompute(
      input,
      {
        exec: async (command, args) =>
          args[1] === 'describe-key-pairs'
            ? { stdout: '', stderr: 'AccessDenied', exitCode: 1 }
            : fixture.exec(command, args),
      },
      discoveryFixtureFetch as typeof fetch,
    ),
  ).rejects.toThrow('key-pair');
});
it('rejects partial or foreign extra key evidence instead of filtering it into a complete binding', () => {
  const plan = boundPlan();
  for (const extra of [
    { ...binding, name: 'foreign' },
    { ...binding, region: 'us-west-2' },
  ]) {
    expect(() => assertAwsBootstrapKeyPair(plan, { ...observation(), bootstrapKeyPairs: [binding, extra] })).toThrow();
  }
});
it('escapes Terraform template syntax while preserving the exact EC2 key name and API bootstrap bytes', () => {
  const plan = boundPlan(`__PLAN_SHA256__ \${var.key} %{if true}`);
  const bootstrap = '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: unchanged\n';
  const config = JSON.parse(renderAwsTerraformFoundation(plan, { '1': bootstrap }));
  expect(config.resource.aws_instance.node_1.key_name).toBe(`__PLAN_SHA256__ $\${var.key} %%{if true}`);
  expect(Buffer.from(config.resource.aws_instance.node_1.user_data_base64, 'base64').toString()).toBe(bootstrap);
});
