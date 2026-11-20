import { expect, it } from 'bun:test';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import {
  assertGcpCorporateFundingCurrent,
  collectGcpCorporateFunding,
  type GcpCorporateFundingPolicy,
  readGcpCorporateFundingPolicy,
} from '../../src/ce/corporate-funding';
import { withGcpCorporateFunding } from '../../src/ce/funding-session';

const policy: GcpCorporateFundingPolicy = {
  schemaVersion: 1,
  project: 'test-project',
  expectedAccountDomain: 'example.com',
  expectedOrganizationDomain: 'example.com',
  expectedBillingAccountName: 'billingAccounts/000000-000000-000000',
  fundingAuthority: 'explicit-user-confirmation-in-current-session',
  billingChangesAuthorized: false,
  personalPaymentAuthorized: false,
};
const hash = `sha256:${'a'.repeat(64)}`;
function fixture() {
  const calls: string[][] = [];
  const values = {
    identity: 'operator@example.com',
    billing: policy.expectedBillingAccountName,
    organization: policy.expectedOrganizationDomain,
  };
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      const value =
        args[0] === 'auth'
          ? [{ account: values.identity, status: 'ACTIVE' }]
          : args[0] === 'billing'
            ? { projectId: policy.project, billingEnabled: true, billingAccountName: values.billing }
            : args[0] === 'organizations'
              ? { displayName: values.organization }
              : [
                  { type: 'project', id: '1' },
                  { type: 'organization', id: '123' },
                ];
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  return { api, calls, values };
}
it('qualifies corporate identity, organization and exact existing billing with read-only scoped commands', async () => {
  const f = fixture();
  const result = await collectGcpCorporateFunding(f.api, policy, hash);
  expect(result.billingAccountName).toBe(policy.expectedBillingAccountName);
  expect(result.sourceReceipts).toHaveLength(4);
  expect(JSON.stringify(result)).not.toContain('operator@example.com');
  expect(f.calls.every((args) => args.includes('--project=test-project'))).toBe(true);
  expect(f.calls.every((args) => !args.some((a) => ['create', 'update', 'enable', 'set'].includes(a)))).toBe(true);
});
it('a personal account, moved billing association or different organization cannot pass funding qualification', async () => {
  for (const key of ['identity', 'billing', 'organization'] as const) {
    const f = fixture();
    f.values[key] =
      key === 'identity'
        ? 'operator@example.org'
        : key === 'billing'
          ? 'billingAccounts/111111-111111-111111'
          : 'example.org';
    await expect(collectGcpCorporateFunding(f.api, policy, hash)).rejects.toThrow();
  }
});
it('expired funding observations cannot authorize billable execution', async () => {
  const f = fixture();
  const receipt = await collectGcpCorporateFunding(f.api, policy, hash);
  receipt.observedAt = '2000-01-01T00:00:00Z';
  expect(() => assertGcpCorporateFundingCurrent(receipt, policy.project, policy.expectedBillingAccountName)).toThrow(
    'Current',
  );
});
it('Terraform binds funding to the exact reviewed binary and rechecks it before billable apply', async () => {
  const f = fixture();
  let applies = 0;
  const receipt: PlanReceipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: 'ce-test',
    backendIdentity: 'local:ce-test',
    configurationSha256: 'a'.repeat(64),
    providerLockSha256: 'a'.repeat(64),
    planSha256: 'a'.repeat(64),
    changes: [{ address: 'google_compute_instance.node', type: 'google_compute_instance', actions: ['create'] }],
    noChanges: false,
  };
  const files = new Map<string, unknown>();
  const store = {
    write: async (n: string, v: unknown) => {
      files.set(n, structuredClone(v));
    },
    read: async (n: string) => structuredClone(files.get(n)),
  };
  const session = {
    plan: async () => receipt,
    apply: async () => {
      applies++;
    },
  } as unknown as TerraformSession;
  const collect = async () => collectGcpCorporateFunding(f.api, policy, hash);
  const wrapped = withGcpCorporateFunding(session, store, f.api, policy.project, collect);
  const plan = await wrapped.plan({});
  f.values.billing = 'billingAccounts/111111-111111-111111';
  await expect(wrapped.apply(plan, {})).rejects.toThrow('billing');
  expect(applies).toBe(0);
  f.values.billing = policy.expectedBillingAccountName;
  await wrapped.apply(plan, {});
  expect(applies).toBe(1);
  await expect(wrapped.apply({ ...plan, configurationSha256: 'b'.repeat(64) }, {})).rejects.toThrow('binding');
  expect(applies).toBe(1);
});
it('cleanup does not require funding access and never switches billing', async () => {
  const f = fixture();
  let applies = 0;
  const session = {
    apply: async () => {
      applies++;
    },
  } as unknown as TerraformSession;
  const wrapped = withGcpCorporateFunding(
    session,
    {
      read: async () => {
        throw new Error('not needed');
      },
      write: async () => {},
    },
    f.api,
    policy.project,
    async () => {
      throw new Error('not needed');
    },
  );
  const receipt = { changes: [{ type: 'google_compute_instance', actions: ['delete'] }] } as PlanReceipt;
  await wrapped.apply(receipt, {});
  expect(applies).toBe(1);
  expect(f.calls).toHaveLength(0);
});

it('funding policy rejects shared files, symlinks and unauthorized payment or billing changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gcp-funding-policy-'));
  try {
    const file = join(root, 'policy.json');
    await writeFile(file, JSON.stringify(policy), { mode: 0o600 });
    expect((await readGcpCorporateFundingPolicy(policy.project, file)).policy.project).toBe(policy.project);
    await chmod(file, 0o644);
    await expect(readGcpCorporateFundingPolicy(policy.project, file)).rejects.toThrow('Restricted');
    await chmod(file, 0o600);
    const link = join(root, 'link.json');
    await symlink(file, link);
    await expect(readGcpCorporateFundingPolicy(policy.project, link)).rejects.toThrow('Restricted');
    for (const field of ['billingChangesAuthorized', 'personalPaymentAuthorized']) {
      await writeFile(file, JSON.stringify({ ...policy, [field]: true }));
      await expect(readGcpCorporateFundingPolicy(policy.project, file)).rejects.toThrow('Explicit');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
