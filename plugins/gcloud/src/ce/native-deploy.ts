import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { GcloudExecApi } from '../gcloud/exec';
import { checkoutGcpBootstrap } from './bootstrap-checkout';
import { issueGcpBootstrap } from './bootstrap-issue';
import { assertGcpByolAuthorization, fetchGcpByolDocument } from './byol-terms';
import { translateGcpNativeCompute } from './compute-plan';
import { GCP_CE_API_RELEASE } from './contract';
import { assertGcpCorporateFundingCurrent, collectCurrentGcpCorporateFunding } from './corporate-funding';
import { fingerprint } from './discovery';
import { applyGcpNativeCreation } from './native-create';
import { createGcpNativeCreationDriver } from './native-create-driver';
import { createGcpPreflightPort } from './preflight-port';
import { assertGcpLaunchGates, type GcpQualificationGates } from './qualification-gates';
import type { GcpCeIntent } from './types';

/** Candidate single-node orchestrator; launch gates must be collected by the owning tool, never caller assertions. */
export async function applyGcpNativeDeployment(
  platform: CePlatformService,
  api: GcloudExecApi,
  intent: GcpCeIntent,
  approvedHash: string,
  gates: GcpQualificationGates,
  signal?: AbortSignal,
  funding = collectCurrentGcpCorporateFunding,
) {
  const plan = translateGcpNativeCompute(intent);
  assertGcpLaunchGates(gates, approvedHash);
  if (
    intent.engine !== 'native' ||
    plan.sha256 !== approvedHash ||
    gates.project !== intent.project ||
    gates.region !== intent.region ||
    gates.engine !== 'native' ||
    gates.apiContract.sha256 !== GCP_CE_API_RELEASE.contractDigest ||
    !platform.gcpLifecycle
  )
    throw new Error('Native deployment ownership/qualified contract differs');
  if (!gates.fundingReceipt) throw new Error('Reviewed corporate funding binding required');
  assertGcpCorporateFundingCurrent(gates.fundingReceipt, intent.project, gates.fundingReceipt.billingAccountName);
  const currentFunding = await funding(api, intent.project, signal);
  assertGcpCorporateFundingCurrent(currentFunding, intent.project, gates.fundingReceipt.billingAccountName);
  if (currentFunding.policySha256 !== gates.fundingReceipt.policySha256)
    throw new Error('Corporate funding policy changed after launch review');
  const owner = {
    deploymentId: intent.deploymentName,
    provider: 'gcp' as const,
    engine: 'native' as const,
    account: intent.project,
    region: intent.region,
  };
  const store = await platform.storage(owner);
  const release = await acquireProcessLock(join(store.directory, '.gcp-deployment-lock'));
  try {
    if (intent.image.name.endsWith('-byol') || gates.legalAcceptance === 'authorized-for-access-or-use')
      await assertGcpByolAuthorization(
        intent,
        { query: createGcpPreflightPort(api, intent.project).query, document: fetchGcpByolDocument },
        currentFunding,
        store,
        signal,
      );
    const identity = {
      intent: structuredClone(intent),
      intentFingerprint: fingerprint(intent),
      platformContext: intent.platformContext,
    };
    let saved: unknown;
    try {
      saved = await store.read('gcp-deployment-intent.json');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (saved && fingerprint(saved) !== fingerprint(identity))
      throw new Error('Persisted native deployment intent differs');
    if (!saved) await store.write('gcp-deployment-intent.json', identity);
    const shared = {
      read: (name: string) => store.read(name),
      write: (name: string, value: unknown) => store.write(name, value),
      exclusive: async <T>(fn: () => Promise<T>) => fn(),
    };
    const lifecycle = await platform.gcpLifecycle(owner, intent.platformContext, signal);
    const driver = createGcpNativeCreationDriver(api, shared, store.directory, intent);
    return await applyGcpNativeCreation(shared, intent, approvedHash, driver, signal, async (_action, signal) => {
      await lifecycle.store.exclusive(() => lifecycle.ensureSite(signal));
      const site = intent.sites[0],
        node = site.nodes[0],
        tokenName = `${node.name}-token`;
      if (tokenName.length > 63) throw new Error('Node name leaves no token suffix space');
      const bootstrapOwner = {
        project: intent.project,
        deploymentName: intent.deploymentName,
        siteName: site.name,
        nodeName: node.name,
        engine: 'native' as const,
      };
      const key = `gcp-bootstrap-plan-${node.name}.json`;
      let bootstrap: import('./bootstrap-issue').GcpBootstrapIssuePlan | undefined;
      try {
        bootstrap = (await store.read(key)) as typeof bootstrap;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (!bootstrap) {
        const body = {
          schemaVersion: 1 as const,
          owner: bootstrapOwner,
          tokenName,
          expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          contractDigest: gates.apiContract.sha256,
        };
        bootstrap = { ...body, sha256: fingerprint(body) };
        await store.write(key, bootstrap);
      }
      await issueGcpBootstrap(
        shared,
        bootstrap,
        bootstrap.sha256,
        gates.apiContract.sha256,
        lifecycle.bootstrapDriver(),
        signal,
      );
      const materialKey = `gcp-bootstrap-material-${node.name}.json`;
      let staged: unknown;
      try {
        staged = await store.read(materialKey);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (!staged) {
        const userData = await checkoutGcpBootstrap(shared, bootstrapOwner);
        await store.write(materialKey, {
          ...bootstrapOwner,
          expiresAt: bootstrap.expiresAt,
          userData,
          consumed: false,
        });
      }
    });
  } finally {
    await release();
  }
}
