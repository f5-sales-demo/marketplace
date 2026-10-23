import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { GcloudExecApi } from '../gcloud/exec';
import { fingerprint } from './discovery';
import { validateScope } from './validation';

export interface GcpCorporateFundingPolicy {
  schemaVersion: 1;
  project: string;
  expectedOrganizationDomain: string;
  expectedAccountDomain: string;
  expectedBillingAccountName: string;
  fundingAuthority: 'explicit-user-confirmation-in-current-session';
  billingChangesAuthorized: false;
  personalPaymentAuthorized: false;
}
export interface GcpCorporateFundingReceipt {
  schemaVersion: 1;
  project: string;
  accountDomain: string;
  organizationDomain: string;
  billingAccountName: string;
  billingEnabled: true;
  policySha256: string;
  observedAt: string;
  sourceReceipts: Array<{ source: string; sha256: string }>;
}
export async function readGcpCorporateFundingPolicy(
  project: string,
  filename = process.env.XCSH_GCP_FUNDING_POLICY_FILE ?? join(homedir(), '.config', 'xcsh', 'gcp-ce-funding.json'),
) {
  validateScope(project);
  const stat = await lstat(filename);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0 ||
    stat.size > 64 * 1024
  )
    throw new Error('Restricted corporate funding policy required');
  const raw = await readFile(filename, 'utf8');
  const policy = JSON.parse(raw) as GcpCorporateFundingPolicy;
  validatePolicy(policy, project);
  return { policy, policySha256: `sha256:${createHash('sha256').update(raw).digest('hex')}` };
}
function validatePolicy(policy: GcpCorporateFundingPolicy, project: string) {
  if (
    policy.schemaVersion !== 1 ||
    policy.project !== project ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(policy.expectedOrganizationDomain) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(policy.expectedAccountDomain) ||
    !/^billingAccounts\/[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$/.test(policy.expectedBillingAccountName) ||
    policy.fundingAuthority !== 'explicit-user-confirmation-in-current-session' ||
    policy.billingChangesAuthorized !== false ||
    policy.personalPaymentAuthorized !== false
  )
    throw new Error('Explicit corporate funding binding required');
}
/** Read-only funding qualification. Corporate payer classification is explicitly supplied by the authorized user. */
export async function collectGcpCorporateFunding(
  api: GcloudExecApi,
  policy: GcpCorporateFundingPolicy,
  policySha256: string,
  signal?: AbortSignal,
): Promise<GcpCorporateFundingReceipt> {
  validateScope(policy.project);
  validatePolicy(policy, policy.project);
  if (!/^sha256:[a-f0-9]{64}$/.test(policySha256)) throw new Error('Corporate funding policy digest required');
  const sourceReceipts: GcpCorporateFundingReceipt['sourceReceipts'] = [];
  const read = async (source: string, args: string[]) => {
    signal?.throwIfAborted();
    const result = await api.exec('gcloud', [...args, `--project=${policy.project}`, '--format=json', '--quiet'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Corporate funding observation unavailable');
    const value = JSON.parse(result.stdout);
    sourceReceipts.push({ source, sha256: fingerprint(value) });
    return value;
  };
  const accounts = await read('active-account', ['auth', 'list', '--filter=status:ACTIVE']);
  if (
    !Array.isArray(accounts) ||
    accounts.length !== 1 ||
    accounts[0].status !== 'ACTIVE' ||
    typeof accounts[0].account !== 'string' ||
    accounts[0].account.split('@').length !== 2 ||
    accounts[0].account.split('@')[1].toLowerCase() !== policy.expectedAccountDomain
  )
    throw new Error('Active Google account is not the approved corporate identity');
  const billing = await read('project-billing', ['billing', 'projects', 'describe', policy.project]);
  if (
    billing.projectId !== policy.project ||
    billing.billingEnabled !== true ||
    billing.billingAccountName !== policy.expectedBillingAccountName
  )
    throw new Error('Project corporate billing association changed or is unavailable');
  const ancestors = await read('project-ancestors', ['projects', 'get-ancestors', policy.project]);
  const organizations = Array.isArray(ancestors)
    ? ancestors.filter((row) => row.type === 'organization' && /^\d+$/.test(row.id))
    : [];
  if (organizations.length !== 1) throw new Error('Corporate project organization unavailable');
  const organization = await read('organization', ['organizations', 'describe', organizations[0].id]);
  if (organization.displayName?.toLowerCase() !== policy.expectedOrganizationDomain)
    throw new Error('Project is outside the approved corporate organization');
  return {
    schemaVersion: 1,
    project: policy.project,
    accountDomain: policy.expectedAccountDomain,
    organizationDomain: policy.expectedOrganizationDomain,
    billingAccountName: policy.expectedBillingAccountName,
    billingEnabled: true,
    policySha256,
    observedAt: new Date().toISOString(),
    sourceReceipts,
  };
}
export async function collectCurrentGcpCorporateFunding(api: GcloudExecApi, project: string, signal?: AbortSignal) {
  const { policy, policySha256 } = await readGcpCorporateFundingPolicy(project);
  return collectGcpCorporateFunding(api, policy, policySha256, signal);
}
export function assertGcpCorporateFundingCurrent(
  receipt: GcpCorporateFundingReceipt,
  project: string,
  expectedBillingAccountName: string,
) {
  const age = Date.now() - Date.parse(receipt.observedAt);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.project !== project ||
    receipt.billingEnabled !== true ||
    receipt.billingAccountName !== expectedBillingAccountName ||
    !/^billingAccounts\/[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$/.test(receipt.billingAccountName) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(receipt.accountDomain) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(receipt.organizationDomain) ||
    !Array.isArray(receipt.sourceReceipts) ||
    receipt.sourceReceipts.length !== 4 ||
    receipt.sourceReceipts.some((source) => !/^sha256:[a-f0-9]{64}$/.test(source.sha256)) ||
    !/^sha256:[a-f0-9]{64}$/.test(receipt.policySha256) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 5 * 60_000
  )
    throw new Error('Current corporate funding receipt required before billable execution');
}
