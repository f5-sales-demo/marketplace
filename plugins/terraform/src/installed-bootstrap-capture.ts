import { createHash, randomUUID } from 'node:crypto';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { OriginalGcpBootstrapObservation } from '../../platform/src/ce/gcp-bootstrap-observation';
import type { CePlatformService } from '../../platform/src/ce/service';
import type { BootstrapGrantPublicationOptions } from './bootstrap-grant-publication';
import {
  collectOriginalGcpPreapplyBootstrap,
  type OriginalGcpPreapplyBootstrapEvidence,
} from './gcp-preapply-bootstrap';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import type { InstalledCaptureContext } from './installed-capture-context';
import type { InstalledGcpCapture } from './installed-runtime';
import {
  type InstalledXcshCreationTarget,
  type InstalledXcshReaderOptions,
  openInstalledXcshCreationReader,
  readOriginalInstalledXcshCreation,
} from './installed-xcsh-creation-reader';
import { linuxMonotonicMs } from './linux-clock';
import {
  assertPreparedCreationScopeContext,
  assertPreparedCreationScopeInputs,
  inspectPreparedCreationScope,
  publishOriginalGcpBootstrapGrant,
} from './prepared-creation-scope';
import { assertFinalReaderReserve } from './reader-final-reserve';
import type { ExecutionCaptureAdmission } from './signal-free-executor';
import { joinOriginalXcshCreationBody } from './xcsh-creation-body';

export interface InstalledBootstrapNodeBinding {
  readonly siteName: string;
  readonly tokenName: string;
  readonly nodeName: string;
}
export interface InstalledBootstrapCaptureInput {
  readonly context: InstalledCaptureContext;
  readonly packet: unknown;
  readonly platform: Pick<CePlatformService, 'gcpBootstrapSource' | 'gcpBootstrapObservation'>;
  readonly store: CeDeploymentStore;
  readonly platformContext: string;
  readonly nodes: readonly InstalledBootstrapNodeBinding[];
}
export interface InstalledBootstrapCaptureOptions {
  /** Explicit offline source seams; the installed factory supplies neither. */
  readonly reader?: InstalledXcshReaderOptions;
  readonly publication?: BootstrapGrantPublicationOptions;
}
type Grant = Awaited<ReturnType<typeof publishOriginalGcpBootstrapGrant>>;
const sameActor = (a: ExecutionCaptureAdmission['identity'], b: ExecutionCaptureAdmission['identity']) =>
  (['pid', 'group', 'start', 'boot'] as const).every((key) => a[key] === b[key]);
const name = (value: string) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(value);

/** Original initial-deployment bootstrap stage. Publication is distinct from
 * provider consumption, original VM/NIC ownership, guest and traffic acceptance.
 * The enclosing built-in factory must supply those other stages before release.
 */
export async function openInstalledBootstrapCapture(
  input: InstalledBootstrapCaptureInput,
  options: InstalledBootstrapCaptureOptions = {},
) {
  const { context, packet, platform, store, platformContext } = input;
  const nodes = Object.freeze(input.nodes.map((node) => Object.freeze({ ...node })));
  assertPreparedCreationScopeContext(packet, context);
  const scope = await inspectPreparedCreationScope(packet);
  const source = platform.gcpBootstrapSource?.();
  const openObservation = platform.gcpBootstrapObservation?.bind(platform);
  if (
    !source ||
    !openObservation ||
    !scope.scope ||
    !scope.bootstrapAuthorization ||
    !nodes.length ||
    nodes.some(
      (node) =>
        Object.keys(node).sort().join(',') !== 'nodeName,siteName,tokenName' ||
        ![node.siteName, node.tokenName, node.nodeName].every(name),
    ) ||
    new Set(nodes.map((node) => node.nodeName)).size !== nodes.length ||
    new Set(nodes.map((node) => node.tokenName)).size !== nodes.length
  )
    throw new Error('Original installed bootstrap stage source and bindings required');
  const directory = store.directory;
  const saved = (await store.read('gcp-terraform-input-identity.json')) as {
    intent: {
      project: string;
      region: string;
      deploymentName: string;
      engine: string;
      operation: string;
      platformContext: string;
      sites: Array<{ name: string; nodes: Array<{ name: string }> }>;
    };
    intentFingerprint: string;
    platformContext: string;
  };
  if (
    !saved.intent ||
    saved.intentFingerprint !== fingerprint(saved.intent) ||
    saved.platformContext !== platformContext ||
    saved.intent.platformContext !== platformContext ||
    saved.intent.project !== context.owner.account ||
    saved.intent.region !== context.owner.region ||
    saved.intent.deploymentName !== context.owner.deploymentId ||
    saved.intent.engine !== 'terraform' ||
    saved.intent.operation !== 'deploy' ||
    !Array.isArray(saved.intent.sites) ||
    nodes.some(
      (node) =>
        !saved.intent.sites.some(
          (site) =>
            site.name === node.siteName &&
            Array.isArray(site.nodes) &&
            site.nodes.some((entry) => entry.name === node.nodeName),
        ),
    )
  )
    throw new Error('Original bootstrap stage intent differs');
  const declared = new Set(
    nodes.flatMap((node) => [
      JSON.stringify(['xcsh_securemesh_site_v2', 'system', node.siteName]),
      JSON.stringify(['xcsh_token', 'system', node.tokenName]),
    ]),
  );
  if (
    scope.resources.length !== declared.size ||
    scope.resources.some(
      (target) => !declared.delete(JSON.stringify([target.type_name, target.namespace, target.name])),
    )
  )
    throw new Error('Original bootstrap stage creation target coverage differs');
  const savedHash = fingerprint(saved);
  let callback: OriginalApplyCallbackContext | undefined;
  let actor: ExecutionCaptureAdmission | undefined;
  let reader: Awaited<ReturnType<typeof openInstalledXcshCreationReader>> | undefined;
  let observation: OriginalGcpBootstrapObservation | undefined;
  let pending: Promise<readonly Grant[]> | undefined;
  let failure: unknown;
  let started = false,
    finalStarted = false,
    originalGroupClosed = false,
    closed = false;
  const grants = new Map<string, Grant>();
  const candidates = new Map<string, OriginalGcpPreapplyBootstrapEvidence>();
  const inputs = async () => {
    assertPreparedCreationScopeContext(packet, context);
    await assertPreparedCreationScopeInputs(packet);
    await context.assertInputs();
    await store.verify();
    if (
      store.directory !== directory ||
      fingerprint(await store.read('gcp-terraform-input-identity.json')) !== savedHash ||
      (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
        (key) => store.owner[key] !== context.owner[key],
      )
    )
      throw new Error('Original bootstrap stage input or storage scope changed');
  };
  const guard = async () => {
    if (closed || finalStarted || failure) throw new Error('Original bootstrap stage retired or failed');
    await inputs();
    await context.assertWithinDeadline();
    const now = linuxMonotonicMs();
    if (now < context.budget.start || now >= context.budget.deadline)
      throw new Error('Original bootstrap stage deadline exhausted');
    if (callback) await assertOriginalApplyLifetime(callback);
  };
  const retain = async (phase: string, value: Record<string, unknown>) => {
    await store.verify();
    if (store.directory !== directory) throw new Error('Original bootstrap stage retention directory changed');
    await store.write(`gcp-bootstrap-stage-${randomUUID()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-bootstrap-stage-event',
      phase,
      owner: context.owner,
      planSha256: scope.planSha256,
      scopeFileSha256: scope.scope?.sha256,
      originalBudget: context.budget,
      executor: actor?.identity,
      ...value,
      executionQualified: false,
      guestAcceptanceComplete: false,
    });
  };
  const recordFailure = async (
    phase: string,
    error: unknown,
    details: Record<string, unknown> = {},
  ): Promise<never> => {
    failure ??= error;
    try {
      await retain(phase, {
        ...details,
        errorType: error instanceof Error ? error.name : typeof error,
        ...(error instanceof Error ? { errorMessage: error.message, errorStack: error.stack } : {}),
      });
    } catch (retention) {
      throw new AggregateError([error, retention], 'Original bootstrap failure and retention failed');
    }
    throw error;
  };
  await guard();
  observation = await openObservation(context.owner, platformContext, {
    origin: context.environment.XCSH_API_URL,
    credentialSha256: createHash('sha256').update(context.environment.XCSH_API_TOKEN).digest('hex'),
    targets: scope.resources as Parameters<NonNullable<CePlatformService['gcpBootstrapObservation']>>[2]['targets'],
    assertOriginal: inputs,
  });
  const collect = async (
    node: InstalledBootstrapNodeBinding,
    targets: readonly InstalledXcshCreationTarget[],
    signal?: AbortSignal,
  ) => {
    await guard();
    const siteTarget = targets.find(
      (target) => target.target.type_name === 'xcsh_securemesh_site_v2' && target.target.name === node.siteName,
    );
    const tokenTarget = targets.find(
      (target) => target.target.type_name === 'xcsh_token' && target.target.name === node.tokenName,
    );
    if (!siteTarget || !tokenTarget) return undefined;
    const site = await observation?.read(siteTarget.target, signal);
    const token = await observation?.read(tokenTarget.target, signal);
    if (!site || !token) return undefined;
    const siteBody = await joinOriginalXcshCreationBody({
      context,
      packet,
      result: siteTarget,
      platform: source,
      body: site,
      target: siteTarget.target,
    });
    const tokenBody = await joinOriginalXcshCreationBody({
      context,
      packet,
      result: tokenTarget,
      platform: source,
      body: token,
      target: tokenTarget.target,
    });
    const evidence = await collectOriginalGcpPreapplyBootstrap({
      site: siteBody,
      token: tokenBody,
      platform: source,
      binding: { owner: context.owner, deploymentName: context.owner.deploymentId, ...node },
    });
    const prior = candidates.get(node.nodeName);
    if (
      prior &&
      (prior.bootstrap.jwtSha256 !== evidence.bootstrap.jwtSha256 ||
        prior.siteCreationSha256 !== evidence.siteCreationSha256 ||
        prior.tokenCreationSha256 !== evidence.tokenCreationSha256)
    )
      throw new Error('Original bootstrap stage token or Site identity changed');
    await guard();
    candidates.set(node.nodeName, evidence);
    return { evidence, token: tokenTarget };
  };
  const worker: InstalledGcpCapture = {
    async start(admission, originalCallback) {
      if (started || closed) throw new Error('Original bootstrap stage already started or retired');
      if (originalCallback?.phase !== 'before' || originalCallback.original !== context)
        throw new Error('Original bootstrap before callback required');
      await assertOriginalApplyCallback(originalCallback);
      if (
        admission.directory !== context.executionDirectory ||
        admission.args[0] !== 'apply' ||
        admission.originalStartMs !== context.budget.start ||
        admission.originalDeadlineMs !== context.budget.deadline ||
        !sameActor(admission.identity, originalCallback.execution.identity)
      )
        throw new Error('Original bootstrap stage executor differs');
      started = true;
      callback = originalCallback;
      actor = Object.freeze({ ...admission, identity: Object.freeze({ ...admission.identity }) });
      try {
        await guard();
        reader = await openInstalledXcshCreationReader(context, actor, packet, options.reader);
        const ready = await reader.ready;
        await retain('reader-ready', { reader: ready.reader, readerEvidenceSha256: ready.evidenceSha256 });
        let terminal = false;
        reader.completed.then(
          () => {
            terminal = true;
          },
          () => {
            terminal = true;
          },
        );
        pending = (async () => {
          try {
            while (grants.size !== nodes.length) {
              await guard();
              if (linuxMonotonicMs() >= ready.windowDeadlineMs)
                throw new Error('Original bootstrap target window incomplete');
              const targets = await reader?.availableTargets();
              for (const node of nodes) {
                if (grants.has(node.nodeName)) continue;
                const signal = AbortSignal.timeout(
                  Math.max(1, Math.min(60000, ready.windowDeadlineMs - linuxMonotonicMs())),
                );
                const candidate = await collect(node, targets, signal);
                if (!candidate) continue;
                await guard();
                const grant = await publishOriginalGcpBootstrapGrant(
                  { packet, token: candidate.token, evidence: candidate.evidence, store },
                  options.publication,
                );
                grants.set(node.nodeName, grant);
                await retain('grant-published', { nodeName: node.nodeName, grant });
              }
              if (grants.size !== nodes.length) {
                if (terminal) {
                  await reader?.completed;
                  throw new Error('Original bootstrap reader completed without all grants');
                }
                await Bun.sleep(25);
              }
            }
            return Object.freeze(
              nodes.map((node) => {
                const grant = grants.get(node.nodeName);
                if (!grant) throw new Error('Original bootstrap grant coverage incomplete');
                return grant;
              }),
            );
          } catch (error) {
            return recordFailure('bootstrap-failed', error, {
              publishedCount: grants.size,
              expectedCount: nodes.length,
            });
          }
        })();
        pending.catch(() => {});
        await guard();
        await assertOriginalApplyCallback(originalCallback);
      } catch (error) {
        failure ??= error;
        pending ??= Promise.reject(error);
        pending.catch(() => {});
        return recordFailure('bootstrap-start-failed', error, {
          sourceReaderOpened: !!reader,
          publishedCount: grants.size,
        });
      }
    },
    async assertOriginal() {
      await guard();
    },
    async finalCapture(finished, reserve, finalCallback) {
      if (
        !reserve ||
        !finalCallback ||
        finalCallback.phase !== 'after' ||
        finalCallback.original !== context ||
        finalCallback.reserve !== reserve ||
        !finished.identity ||
        finalStarted
      )
        throw new Error('Original bootstrap final capture admission required');
      await assertOriginalApplyCallback(finalCallback);
      actor ??= finalCallback.execution;
      if (!sameActor(finished.identity, actor.identity) || finished.originalDeadlineMs !== context.budget.deadline)
        throw new Error('Original bootstrap final executor or budget differs');
      await assertFinalReaderReserve(reserve);
      finalStarted = true;
      originalGroupClosed = finished.originalGroupClosed;
      const outcomes = await Promise.allSettled([
        pending ?? Promise.reject(new Error('Original bootstrap startup incomplete')),
        reader?.completed ?? Promise.reject(new Error('Original bootstrap reader not opened')),
      ]);
      await inputs();
      await assertFinalReaderReserve(reserve);
      const result = outcomes[1];
      const raw = result.status === 'fulfilled' ? await readOriginalInstalledXcshCreation(result.value) : undefined;
      await retain('final-capture', {
        publishedCount: grants.size,
        expectedCount: nodes.length,
        creationComplete: result.status === 'fulfilled' && result.value.complete,
        creationEvidenceSha256: raw ? createHash('sha256').update(raw).digest('hex') : undefined,
        originalGroupClosed,
        finalReserve: reserve,
        failures: outcomes.filter((value) => value.status === 'rejected').length,
        providerConsumptionQualified: false,
      });
      await assertFinalReaderReserve(reserve);
      if (
        failure ||
        outcomes.some((value) => value.status === 'rejected') ||
        result.status !== 'fulfilled' ||
        !result.value.complete ||
        grants.size !== nodes.length
      )
        throw new Error('Original bootstrap stage capture incomplete; retain evidence and reconcile without replay');
    },
    async closeAfterExecutorExit() {
      if (closed) return;
      if (!finalStarted || !originalGroupClosed) throw new Error('Original bootstrap stage executor closure required');
      await inputs();
      try {
        await reader?.closeAfterExecutorExit();
      } catch (error) {
        return recordFailure('closure-incomplete', error);
      } finally {
        await observation?.close();
      }
      await retain('closed', { publishedCount: grants.size });
      closed = true;
    },
  };
  return Object.freeze({
    ...worker,
    waitForGrants() {
      if (!pending) throw new Error('Original bootstrap stage has not started');
      return pending;
    },
    async refreshBootstrap(nodeName: string) {
      if (!reader || !grants.has(nodeName)) throw new Error('Original published bootstrap node required');
      const node = nodes.find((value) => value.nodeName === nodeName);
      if (!node) throw new Error('Original published bootstrap binding required');
      try {
        const candidate = await collect(node, await reader.availableTargets());
        if (!candidate) throw new Error('Original bootstrap source refresh unavailable');
        return candidate.evidence;
      } catch (error) {
        failure ??= error;
        return recordFailure('source-refresh-failed', error, { nodeName });
      }
    },
  });
}
