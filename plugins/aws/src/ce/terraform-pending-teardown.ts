import { readdir } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { collectAwsTerraformAbsence } from './terraform-absence';
import { runAwsTerraformCloudTeardown } from './terraform-cloud-teardown';
import { beginAwsTerraformRetirement } from './terraform-lifecycle';
import type { AwsTerraformRetirementInventory } from './terraform-retirement-inventory';
import { verifyAwsTeardownCredentials } from './terraform-teardown';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

type Observation = Awaited<ReturnType<CeRuntime['pendingAdmissionInventory']>>;
type Store = Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write' | 'directory'>;
interface Retirement {
  siteName: string;
  siteUid: string | null;
  physicalSiteUid: null;
  tokens: Array<{ name: string; node: string; uid: string }>;
}
export interface AwsPendingTeardownPlan {
  schemaVersion: 1;
  kind: 'aws-ce-terraform-pending-teardown';
  engine: 'terraform';
  sourcePlanSha256: string;
  sourceJournalSha256: string;
  drain: CePlatformDrainPlan;
  retirement: Retirement[];
  planId: string;
  planSha256: string;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed pending admission journal');
  return value as Record<string, unknown>;
};
const uid = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
async function journal(base: AwsCePlan, storage: Store, siteFingerprint: string) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base);
  if (
    base.engine !== 'terraform' ||
    base.intent.topology.nodeCount !== 1 ||
    selected.length !== 1 ||
    selected[0].binding.nodes.length !== 1 ||
    base.intent.operation !== 'deploy' ||
    canonicalSha256(storage.owner) !== canonicalSha256(selected[0].binding.owner)
  )
    throw new Error('Pending retirement requires the owning Terraform deployment');
  await storage.verify();
  const auth = object(await storage.read('terraform-authorization.json'));
  const workflow = object(await storage.read('terraform-workflow.json'));
  let admission: Record<string, unknown> | null = null;
  try {
    admission = object(await storage.read('terraform-admission.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // A first site request historically preceded admission persistence. Retain that
    // missing provenance; only the original F5 owner journal can qualify recovery.
    const book = object(await storage.read('terraform-f5-resources.json'));
    if (book.schemaVersion !== 1 || canonicalSha256(book.owner) !== canonicalSha256(storage.owner))
      throw new Error('Pending F5 reconciliation state owner differs');
    object(book.resources);
  }
  const bootstrap = admission ? object(admission.bootstrapByNode) : {},
    launched = admission ? object(admission.launchedAtByNode) : {};
  const indexes = selected.flatMap(({ site }) => site.nodeIndexes.map(String));
  if (
    auth.schemaVersion !== 1 ||
    auth.engine !== 'terraform' ||
    auth.planSha256 !== base.planSha256 ||
    auth.mutations !== true ||
    auth.f5StateOwner !== 'terraform' ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    !['network-pending', 'registration-pending'].includes(String(workflow.stage)) ||
    (admission !== null &&
      (admission.schemaVersion !== 1 ||
        admission.planSha256 !== base.planSha256 ||
        !/^[a-f0-9]{64}$/.test(String(admission.configurationSha256)) ||
        !Array.isArray(admission.admittedSites) ||
        admission.admittedSites.length)) ||
    Object.entries(bootstrap).some(([node, value]) => !indexes.includes(node) || !uid(value)) ||
    Object.entries(launched).some(
      ([node, value]) => !indexes.includes(node) || typeof value !== 'string' || !Number.isFinite(Date.parse(value)),
    )
  )
    throw new Error('Pending retirement admission journal differs or registration has advanced');
  const files = await readdir(storage.directory);
  if (files.some((file) => /^(terraform-(registration-|routing-|connect-|direct-|initial-)|ingress-plan-)/.test(file)))
    throw new Error('Post-admission retirement contract is required');
  const siteRecords = [];
  for (const { binding } of selected) {
    let value: unknown;
    try {
      value = await storage.read(`terraform-site-${binding.siteName}.json`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (value !== undefined) {
      const row = object(value);
      if (
        row.siteName !== binding.siteName ||
        !uid(row.uid) ||
        row.contractFingerprint !== siteFingerprint ||
        canonicalSha256(row.owner) !== canonicalSha256(binding.owner)
      )
        throw new Error('Pending site checkpoint differs');
      siteRecords.push(row);
    }
  }
  // Only a digest leaves private storage; bootstrap content is never copied into a public plan.
  return canonicalSha256({ auth, workflow, admission, siteRecords });
}
async function reconcilePendingF5Site(base: AwsCePlan, runtime: CeRuntime, storage: Store, signal?: AbortSignal) {
  let value: unknown;
  try {
    value = await storage.read('terraform-f5-resources.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (value === undefined) return;
  const book = object(value);
  if (book.schemaVersion !== 1 || canonicalSha256(book.owner) !== canonicalSha256(storage.owner))
    throw new Error('Pending F5 reconciliation state owner differs');
  if (book.pending === undefined) return;
  const pending = object(book.pending);
  if (pending.method === 'DELETE') return;
  if (
    ![true, false].includes(pending.submitted as boolean) ||
    (pending.submitted === true && !pending.receipt) ||
    pending.planSha256 !== base.planSha256 ||
    !['POST', 'PUT'].includes(String(pending.method))
  )
    throw new Error('Pending F5 creation or update requires separate interruption reconciliation');
  const { binding } = siteBindings(base)[0];
  const path = '/api/config/namespaces/system/securemesh_site_v2s';
  const metadata = object(object(pending.request).metadata),
    labels = object(metadata.labels);
  const expectedLabels = {
    'xcsh-ce-deployment': storage.owner.deploymentId,
    'xcsh-ce-engine': 'terraform',
    'xcsh-ce-provider': 'aws',
    'xcsh-ce-account': storage.owner.account,
    'xcsh-ce-region': storage.owner.region,
  };
  if (
    ![true, false].includes(pending.submitted as boolean) ||
    (pending.submitted === true && !pending.receipt) ||
    pending.planSha256 !== base.planSha256 ||
    !['POST', 'PUT'].includes(String(pending.method)) ||
    pending.path !== (pending.method === 'POST' ? path : `${path}/${binding.siteName}`) ||
    metadata.name !== binding.siteName ||
    metadata.namespace !== 'system' ||
    Object.entries(expectedLabels).some(([key, value]) => labels[key] !== value)
  )
    throw new Error('Pending F5 creation or update requires separate interruption reconciliation');
  // Both typed services prove the original owner state and cannot replay provider apply.
  if (pending.submitted === true) await runtime.reconcileObservedTerraformResources(storage.owner, signal);
  else await runtime.cancelUnsubmittedTerraformResources(storage.owner, signal);
}
async function verifyF5State(base: AwsCePlan, storage: Store, planned: Retirement[]) {
  let value: unknown;
  try {
    value = await storage.read('terraform-f5-resources.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (value === undefined) {
    if (planned.some((site) => site.siteUid !== null))
      throw new Error('Pending logical site has no owning Terraform state');
    return;
  }
  const book = object(value),
    resources = object(book.resources);
  if (book.schemaVersion !== 1 || canonicalSha256(book.owner) !== canonicalSha256(storage.owner))
    throw new Error('Pending F5 Terraform state owner differs');
  for (const item of Object.values(resources)) {
    const row = object(item),
      site = planned.find((site) => row.path === `/api/config/namespaces/system/securemesh_site_v2s/${site.siteName}`);
    if (!site || row.type !== 'xcsh_securemesh_site_v2' || !uid(row.uid) || row.uid !== site.siteUid)
      throw new Error('Pending F5 state resource differs from the selected logical UID');
  }
  if (book.pending !== undefined) {
    const pending = object(book.pending);
    if (
      pending.method !== 'DELETE' ||
      pending.planSha256 !== base.planSha256 ||
      !planned.some((site) => pending.path === `/api/config/namespaces/system/securemesh_site_v2s/${site.siteName}`)
    )
      throw new Error('Pending F5 creation or update requires separate interruption reconciliation');
  }
}
function fresh(receipt: Observation, base: AwsCePlan, site: string, ingress: string) {
  const at = Date.parse(receipt.observedAt);
  if (
    receipt.status !== 'observed' ||
    canonicalSha256(receipt.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner) ||
    receipt.siteContractFingerprint !== site ||
    receipt.ingressContractFingerprint !== ingress ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000
  )
    throw new Error('Fresh pending admission inventory is unavailable');
  return receipt;
}
function identities(base: AwsCePlan, receipt: Extract<Observation, { status: 'observed' }>): Retirement[] {
  const selected = siteBindings(base),
    seen = new Set<string>();
  if (receipt.sites.length !== selected.length) throw new Error('Pending site inventory is incomplete');
  const unique = (value: string) => {
    if (seen.has(value)) throw new Error('Duplicate pending identity');
    seen.add(value);
  };
  const retirement = selected.map(({ binding, site }) => {
    const matches = receipt.sites.filter((row) => row.siteName === binding.siteName);
    if (
      matches.length !== 1 ||
      matches[0].physicalSiteUid !== null ||
      !(matches[0].siteUid === null || uid(matches[0].siteUid))
    )
      throw new Error('Pending site identity differs');
    if (matches[0].siteUid !== null) unique(matches[0].siteUid);
    const tokens = receipt.resources
      .filter((row) => row.siteName === binding.siteName)
      .map((row) => {
        const nodeIndex = binding.nodes.indexOf(String(row.node));
        const expected = `${base.deploymentName.slice(0, 40)}-${site.nodeIndexes[nodeIndex]}-${base.planSha256.slice(0, 12)}`;
        if (
          row.kind !== 'tokens' ||
          row.namespace !== 'system' ||
          nodeIndex < 0 ||
          row.name !== expected ||
          !uid(row.uid)
        )
          throw new Error('Pending token is outside the original admission plan');
        unique(row.uid);
        unique(`token:${row.name}`);
        return { name: row.name, node: String(row.node), uid: row.uid };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { siteName: binding.siteName, siteUid: matches[0].siteUid, physicalSiteUid: null, tokens };
  });
  if (retirement.reduce((n, row) => n + row.tokens.length, 0) !== receipt.resources.length)
    throw new Error('Unexpected pending resource');
  return retirement.sort((a, b) => a.siteName.localeCompare(b.siteName));
}
function compile(
  base: AwsCePlan,
  journalSha: string,
  site: string,
  ingress: string,
  retirement: Retirement[],
): AwsPendingTeardownPlan {
  const draft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-terraform-pending-teardown' as const,
    engine: 'terraform' as const,
    sourcePlanSha256: base.planSha256,
    sourceJournalSha256: journalSha,
    drain: {
      schemaVersion: 1 as const,
      owner: siteBindings(base)[0].binding.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: site,
      ingressContractFingerprint: ingress,
      sites: [],
      listeners: [],
      origins: [],
    },
    retirement,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-pending-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
function subset(base: AwsCePlan, planned: Retirement[], receipt: Observation, site: string, ingress: string) {
  const actual = identities(base, fresh(receipt, base, site, ingress));
  for (const row of actual) {
    const target = planned.find((target) => target.siteName === row.siteName);
    if (
      !target ||
      (row.siteUid !== null && row.siteUid !== target.siteUid) ||
      row.tokens.some(
        (token) => !target.tokens.some((expected) => canonicalSha256(token) === canonicalSha256(expected)),
      )
    )
      throw new Error('Pending identity was substituted after preparation');
  }
  return actual;
}
export async function prepareAwsPendingTeardown(
  base: AwsCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
  base = structuredClone(base);
  signal?.throwIfAborted();
  if (runtime.engine !== 'terraform') throw new Error('Pending teardown runtime engine differs');
  const before = await journal(base, storage, runtime.contract.fingerprint);
  await reconcilePendingF5Site(base, runtime, storage, signal);
  const receipt = fresh(
    await runtime.pendingAdmissionInventory(
      siteBindings(base).map((row) => row.binding),
      ['default'],
      contract,
      signal,
    ),
    base,
    runtime.contract.fingerprint,
    contract.fingerprint,
  );
  const retirement = identities(base, receipt);
  let admissionMissing = false;
  try {
    await storage.read('terraform-admission.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    admissionMissing = true;
  }
  if (admissionMissing && receipt.resources.length)
    throw new Error('Missing admission provenance cannot authorize token retirement');
  for (const row of retirement) {
    let checkpoint: unknown;
    try {
      checkpoint = await storage.read(`terraform-site-${row.siteName}.json`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (checkpoint !== undefined && row.siteUid !== null && object(checkpoint).uid !== row.siteUid)
      throw new Error('Pending live site UID differs from its checkpoint');
  }
  await verifyF5State(base, storage, retirement);
  if (before !== (await journal(base, storage, runtime.contract.fingerprint)))
    throw new Error('Pending admission journal changed during preparation');
  const plan = compile(base, before, runtime.contract.fingerprint, contract.fingerprint, retirement);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
interface Driver {
  engine: 'terraform';
  siteContractFingerprint: string;
  ingressContractFingerprint: string;
  observe(signal?: AbortSignal): Promise<Observation>;
  reconcilePlatform(signal?: AbortSignal): Promise<void>;
  revokeToken(site: Retirement, token: Retirement['tokens'][number], signal?: AbortSignal): Promise<void>;
  retireCloud(
    signal?: AbortSignal,
  ): Promise<{ status: 'terraform-state-retired'; sourcePlanSha256: string; finalPlanSha256: string }>;
  deleteSite(site: Retirement, signal?: AbortSignal): Promise<{ status: 'deleted' | 'pending' }>;
}
export async function coordinateAwsPendingTeardown(
  base: AwsCePlan,
  input: AwsPendingTeardownPlan,
  authorized: string,
  storage: Store,
  driver: Driver,
  signal?: AbortSignal,
) {
  base = structuredClone(base);
  const plan = structuredClone(input);
  const validate = async () => {
    signal?.throwIfAborted();
    if (
      driver.engine !== 'terraform' ||
      authorized !== plan.planSha256 ||
      (await journal(base, storage, driver.siteContractFingerprint)) !== plan.sourceJournalSha256 ||
      canonicalSha256(plan) !==
        canonicalSha256(
          compile(
            base,
            plan.sourceJournalSha256,
            driver.siteContractFingerprint,
            driver.ingressContractFingerprint,
            plan.retirement,
          ),
        )
    )
      throw new Error('Pending teardown authorization, plan or journal differs');
    await verifyF5State(base, storage, plan.retirement);
    // Revalidate immutable planned identities independently of the current subset.
    identities(base, {
      status: 'observed',
      owner: plan.drain.owner,
      siteContractFingerprint: driver.siteContractFingerprint,
      ingressContractFingerprint: driver.ingressContractFingerprint,
      startedAt: '',
      observedAt: '',
      sources: [],
      sites: plan.retirement.map(({ siteName, siteUid, physicalSiteUid }) => ({ siteName, siteUid, physicalSiteUid })),
      resources: plan.retirement.flatMap((site) =>
        site.tokens.map((token) => ({
          ...token,
          kind: 'tokens' as const,
          namespace: 'system',
          siteName: site.siteName,
        })),
      ),
    });
  };
  const observe = async () => {
    await validate();
    return subset(
      base,
      plan.retirement,
      await driver.observe(signal),
      driver.siteContractFingerprint,
      driver.ingressContractFingerprint,
    );
  };
  // Reject invalid authorization, changed journals and unknown/substituted live identities before persisting retirement.
  await observe();
  await beginAwsTerraformRetirement(base, plan, storage);
  let current = await observe();
  for (const target of plan.retirement)
    for (const token of target.tokens) {
      current = await observe();
      if (current.some((site) => site.tokens.some((row) => row.name === token.name)))
        await driver.revokeToken(target, token, signal);
    }
  current = await observe();
  if (current.some((site) => site.tokens.length)) throw new Error('Pending bootstrap revocation is still converging');
  const cloud = await driver.retireCloud(signal);
  if (
    cloud.status !== 'terraform-state-retired' ||
    cloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(cloud.finalPlanSha256)
  )
    throw new Error('Pending cloud retirement lacks the bound no-change receipt');
  await observe();
  await driver.reconcilePlatform(signal);
  for (const target of plan.retirement) {
    current = await observe();
    if (current.some((site) => site.siteName === target.siteName && site.siteUid !== null)) {
      const result = await driver.deleteSite(target, signal);
      if (result.status !== 'deleted')
        return {
          status: 'pending-platform-retirement' as const,
          sourcePlanSha256: base.planSha256,
          planSha256: plan.planSha256,
          cloudInventory: 'unknown' as const,
        };
    }
  }
  current = await observe();
  if (current.some((site) => site.siteUid !== null || site.tokens.length))
    throw new Error('Pending platform retirement has not converged');
  let finalBook: unknown;
  try {
    finalBook = await storage.read('terraform-f5-resources.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (finalBook !== undefined) {
    const book = object(finalBook);
    if (Object.keys(object(book.resources)).length || book.pending !== undefined)
      throw new Error('F5 Terraform state retirement remains incomplete');
  }
  const receipt = {
    status: 'resources-retired-awaiting-inventory' as const,
    owner: storage.owner,
    sourcePlanSha256: base.planSha256,
    planSha256: plan.planSha256,
    finalPlanSha256: cloud.finalPlanSha256,
    cloudInventory: 'unknown' as const,
    observedAt: new Date().toISOString(),
  };
  await storage.write('aws-terraform-pending-teardown-receipt.json', receipt);
  return receipt;
}
export async function runAwsPendingTeardown(
  base: AwsCePlan,
  plan: AwsPendingTeardownPlan,
  authorized: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  session: TerraformSession,
  storage: CeDeploymentStore,
  api: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  if (runtime.engine !== 'terraform') throw new Error('Pending teardown runtime engine differs');
  await verifyAwsTeardownCredentials(base, api, signal);
  const bindings = siteBindings(base),
    binding = (site: Retirement) => {
      const found = bindings.find((row) => row.binding.siteName === site.siteName);
      if (!found) throw new Error('Pending site is outside deployment');
      return found.binding;
    };
  const retired = await coordinateAwsPendingTeardown(
    base,
    plan,
    authorized,
    storage,
    {
      engine: 'terraform',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      observe: (signal) =>
        runtime.pendingAdmissionInventory(
          bindings.map((row) => row.binding),
          ['default'],
          contract,
          signal,
        ),
      revokeToken: (site, token, signal) =>
        runtime.deleteBootstrapTokenExact(binding(site), token.node, token.name, token.uid, signal),
      reconcilePlatform: (signal) => runtime.reconcileTerraformResources(storage.owner, signal),
      retireCloud: (signal) => runAwsTerraformCloudTeardown(base, session, storage, api, env, signal),
      deleteSite: (site, signal) => runtime.deleteSiteExact(binding(site), String(site.siteUid), signal),
    },
    signal,
  );
  if (retired.status !== 'resources-retired-awaiting-inventory') return retired;
  const inventory = (await storage.read('terraform-cloud-teardown-inventory.json')) as AwsTerraformRetirementInventory;
  const observation = await collectAwsTerraformAbsence(base, inventory, api, signal);
  await storage.write('aws-terraform-teardown-cloud-absence.json', observation);
  return {
    ...retired,
    status:
      observation.status === 'absent-or-retired'
        ? ('ce-retired-supporting-infrastructure-unverified' as const)
        : ('pending-cloud-inventory' as const),
    cloudInventory: observation.status,
  };
}
