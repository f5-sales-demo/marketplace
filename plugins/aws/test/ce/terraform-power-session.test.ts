import { expect, test } from 'bun:test';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { prepareAwsTerraformBrownfieldBinding } from '../../src/ce/terraform-brownfield-binding';
import { openAwsTerraformPowerSession } from '../../src/ce/terraform-power-session';
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
test('brownfield power session reloads original placement and opens current runner without reconstructing state', async () => {
  const f = fixture();
  await prepareAwsTerraformBrownfieldBinding(f.plan, f.storage, f.api);
  const before = f.calls();
  let opened = 0;
  const session = {} as TerraformSession;
  const terraform: CeTerraformService = {
    open: async (owner, deployment, mode) => {
      opened++;
      expect(owner).toEqual(f.storage.owner);
      expect(mode).toBe('current');
      const c = JSON.parse(deployment.configuration);
      expect(c.resource.aws_vpc).toBeUndefined();
      expect(c.output.ce_vpc_id.value).toBe('vpc-12345678');
      expect(c.resource.aws_network_interface.node_1_nic_0.subnet_id).toBe('subnet-12345678');
      return session;
    },
  };
  expect(await openAwsTerraformPowerSession(f.plan, f.storage as CeDeploymentStore, terraform, f.api)).toBe(session);
  expect(f.calls()).toBeGreaterThan(before);
  expect(opened).toBe(1);
});
for (const mode of ['missing', 'foreign-owner', 'drift', 'forged', 'unavailable', 'partial', 'cancelled'] as const)
  test(`power session ${mode} blocks runner opening`, async () => {
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
    let opened = 0;
    const terraform: CeTerraformService = {
      open: async () => {
        opened++;
        return {} as TerraformSession;
      },
    };
    await expect(
      openAwsTerraformPowerSession(f.plan, f.storage as CeDeploymentStore, terraform, f.api, c.signal),
    ).rejects.toThrow();
    expect(opened).toBe(0);
  });
