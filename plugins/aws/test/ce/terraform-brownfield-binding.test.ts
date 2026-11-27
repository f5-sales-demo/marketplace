import { expect, test } from 'bun:test';
import {
  loadAwsTerraformBrownfieldBinding,
  prepareAwsTerraformBrownfieldBinding,
} from '../../src/ce/terraform-brownfield-binding';
import { qualifyAwsTerraformBrownfieldPlacement } from '../../src/ce/terraform-brownfield-placement';
import { brownfieldPlacementFixture } from './terraform-brownfield-fixture';

function fixture() {
  const f = brownfieldPlacementFixture();
  const files = new Map<string, unknown>();
  let calls = 0;
  const storage = {
    owner: {
      deploymentId: f.plan.intent.deploymentName,
      engine: 'terraform' as const,
      provider: 'aws' as const,
      account: f.plan.intent.accountId,
      region: f.plan.intent.region,
    },
    verify: async () => {},
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, v: unknown) => {
      files.set(name, structuredClone(v));
    },
  };
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls++;
      if (args[0] === 'sts')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            Account: f.plan.intent.accountId,
            Arn: 'arn:aws:iam::123456789012:role/example-role',
          }),
        };
      const id = args[args.findIndex((a) => a.endsWith('-ids')) + 1];
      const row = f.observation.resources.find((r) => r.id === id);
      if (!row) throw Error('unexpected resource');
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(row.state) };
    },
  };
  return { ...f, files, storage, api, calls: () => calls };
}
test('prepares and reloads exact brownfield binding from fresh scoped cloud references', async () => {
  const f = fixture();
  const expected = qualifyAwsTerraformBrownfieldPlacement(f.plan, f.observation);
  await expect(prepareAwsTerraformBrownfieldBinding(f.plan, f.storage, f.api)).resolves.toEqual(expected);
  await expect(loadAwsTerraformBrownfieldBinding(f.plan, f.storage, f.api)).resolves.toEqual(expected);
  expect(f.calls()).toBeGreaterThan(12);
});
for (const mode of ['missing', 'foreign-owner', 'drift', 'forged', 'unavailable', 'partial', 'cancelled'] as const)
  test(`brownfield binding rejects ${mode} before session opening`, async () => {
    const f = fixture();
    await prepareAwsTerraformBrownfieldBinding(f.plan, f.storage, f.api);
    if (mode === 'missing') f.files.clear();
    if (mode === 'foreign-owner') f.storage.owner.account = '000000000000';
    if (mode === 'drift')
      (f.observation.resources[0].state.Vpcs as Array<Record<string, unknown>>)[0].CidrBlock = '10.9.0.0/16';
    if (mode === 'forged') f.files.set('terraform-brownfield-placement.json', { sourcePlanSha256: f.plan.planSha256 });
    if (mode === 'unavailable') f.api.exec = async () => ({ exitCode: 1, stderr: 'unavailable', stdout: '' });
    if (mode === 'partial') f.observation.resources[0].state.NextToken = 'opaque';
    const c = new AbortController();
    if (mode === 'cancelled') c.abort();
    await expect(loadAwsTerraformBrownfieldBinding(f.plan, f.storage, f.api, c.signal)).rejects.toThrow();
  });

for (const mode of ['account', 'partition', 'duplicate', 'operational-down', 'mid-read-drift'] as const)
  test(`fresh brownfield observation rejects ${mode}`, async () => {
    const f = fixture();
    await prepareAwsTerraformBrownfieldBinding(f.plan, f.storage, f.api);
    const exec = f.api.exec;
    let reads = 0;
    f.api.exec = async (command, args) => {
      expect(args.slice(-2)).toEqual(['--profile', 'ce-profile']);
      const response = await exec(command, args);
      const value = JSON.parse(response.stdout);
      if (args[0] === 'sts') {
        if (mode === 'account') value.Account = '000000000000';
        if (mode === 'partition') value.Arn = 'arn:aws-cn:iam::123456789012:role/example-role';
      } else if (args[1] === 'describe-vpcs') {
        if (mode === 'duplicate') value.Vpcs.push(structuredClone(value.Vpcs[0]));
        if (mode === 'operational-down') value.Vpcs[0].State = 'pending';
        if (mode === 'mid-read-drift' && ++reads === 2) value.Vpcs[0].CidrBlock = '10.9.0.0/16';
      }
      return { ...response, stdout: JSON.stringify(value) };
    };
    await expect(loadAwsTerraformBrownfieldBinding(f.plan, f.storage, f.api)).rejects.toThrow();
  });

test('terminal brownfield opening keeps fresh reference checks without recreating retired journals', async () => {
  const f = fixture();
  await prepareAwsTerraformBrownfieldBinding(f.plan, f.storage, f.api);
  f.files.delete('terraform-brownfield-placement-opening-observation.json');
  f.files.set('aws-terraform-terminal-cleanup.json', { schemaVersion: 1 });
  const before = f.calls();
  await loadAwsTerraformBrownfieldBinding(f.plan, f.storage, f.api);
  expect(f.calls()).toBeGreaterThan(before);
  expect(f.files.has('terraform-brownfield-placement-opening-observation.json')).toBe(false);
});
