import { formatGcpUserData } from './bootstrap';
import { type GcpBootstrapOwner, type GcpBootstrapStore, storeGcpBootstrap } from './bootstrap-checkout';
import { fingerprint } from './discovery';

export interface GcpBootstrapIssuePlan {
  schemaVersion: 1;
  owner: GcpBootstrapOwner;
  tokenName: string;
  expiresAt: string;
  contractDigest: string;
  sha256: string;
}
export interface GcpBootstrapIssueDriver {
  assertSiteOwnership(owner: GcpBootstrapOwner, signal?: AbortSignal): Promise<void>;
  readToken(name: string, signal?: AbortSignal): Promise<unknown | null>;
  createToken(name: string, owner: GcpBootstrapOwner, signal?: AbortSignal): Promise<unknown>;
}
function token(value: unknown, plan: GcpBootstrapIssuePlan): string {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed bound registration token');
  const row = value as {
    metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
    spec?: { content?: string; site_name?: string; type?: unknown };
  };
  if (
    row.metadata?.name !== plan.tokenName ||
    row.metadata.namespace !== 'system' ||
    row.metadata.labels?.['xcsh-deployment'] !== plan.owner.deploymentName ||
    row.metadata.labels['xcsh-engine'] !== plan.owner.engine ||
    row.metadata.labels['xcsh-node'] !== plan.owner.nodeName ||
    row.spec?.site_name !== plan.owner.siteName ||
    ![1, 'JWT'].includes(row.spec.type as number | string) ||
    typeof row.spec.content !== 'string'
  )
    throw new Error('Registration token ownership differs');
  return row.spec.content;
}

/** Candidate issuer journals submission before contacting XC and consumes through shared private storage. */
async function issueUnlocked(
  store: GcpBootstrapStore,
  plan: GcpBootstrapIssuePlan,
  approvedHash: string,
  qualifiedContractDigest: string,
  driver: GcpBootstrapIssueDriver,
  signal?: AbortSignal,
) {
  const { sha256, ...body } = plan;
  if (
    plan.schemaVersion !== 1 ||
    sha256 !== fingerprint(body) ||
    approvedHash !== sha256 ||
    plan.owner.engine !== 'native' ||
    !/^sha256:[a-f0-9]{64}$/.test(qualifiedContractDigest) ||
    qualifiedContractDigest !== plan.contractDigest ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(plan.tokenName)
  )
    throw new Error('Reviewed native bootstrap contract/authorization differs');
  signal?.throwIfAborted();
  formatGcpUserData({ ...plan.owner, jwt: 'fixtureheader.fixturepayload.fixturesignature', expiresAt: plan.expiresAt });
  const checkpointName = `gcp-bootstrap-issue-${sha256.slice(7)}.json`;
  let checkpoint: { state: 'prepared' | 'submitting' | 'issued'; planHash: string } | undefined;
  try {
    checkpoint = (await store.read(checkpointName)) as typeof checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (
    checkpoint &&
    (checkpoint.planHash !== sha256 || !['prepared', 'submitting', 'issued'].includes(checkpoint.state))
  )
    throw new Error('Bootstrap issuance checkpoint differs');
  if (checkpoint?.state === 'issued') return { issued: true, nodeName: plan.owner.nodeName, replay: false };
  await driver.assertSiteOwnership(plan.owner, signal);
  let response = await driver.readToken(plan.tokenName, signal);
  if (!checkpoint && response !== null) throw new Error('Existing registration token is not owned by this issuance');
  if (checkpoint?.state === 'submitting' && response === null)
    throw new Error('Ambiguous bootstrap submission requires reconciliation');
  if (response === null) {
    checkpoint = { state: 'submitting', planHash: sha256 };
    await store.write(checkpointName, checkpoint);
    signal?.throwIfAborted();
    response = await driver.createToken(plan.tokenName, plan.owner, signal);
  }
  const jwt = token(response, plan);
  let stored: { state?: string; owner?: GcpBootstrapOwner; expiresAt?: string; jwt?: string } | undefined;
  try {
    stored = (await store.read(`gcp-bootstrap-${plan.owner.nodeName}.json`)) as typeof stored;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!stored) await storeGcpBootstrap(store, plan.owner, { ...plan.owner, jwt, expiresAt: plan.expiresAt });
  else if (
    (stored.state !== 'issued' && stored.state !== 'consumed') ||
    fingerprint(stored.owner) !== fingerprint(plan.owner) ||
    stored.expiresAt !== plan.expiresAt ||
    (stored.state === 'issued' && stored.jwt !== jwt) ||
    (stored.state === 'consumed' && stored.jwt !== '')
  )
    throw new Error('Stored bootstrap state differs');
  await store.write(checkpointName, { state: 'issued', planHash: sha256 });
  return { issued: true, nodeName: plan.owner.nodeName, replay: false };
}

export async function issueGcpBootstrap(
  store: GcpBootstrapStore,
  plan: GcpBootstrapIssuePlan,
  approvedHash: string,
  qualifiedContractDigest: string,
  driver: GcpBootstrapIssueDriver,
  signal?: AbortSignal,
) {
  return store.exclusive(() =>
    issueUnlocked(
      {
        read: (name) => store.read(name),
        write: (name, value) => store.write(name, value),
        exclusive: async <T>(fn: () => Promise<T>) => fn(),
      },
      plan,
      approvedHash,
      qualifiedContractDigest,
      driver,
      signal,
    ),
  );
}
