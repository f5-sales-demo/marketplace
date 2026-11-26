import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { validateIntent } from '../../gcloud/src/ce/validation';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import {
  handoffOriginalEarlyGcpBootstrapVm,
  joinOriginalEarlyGcpBootstrapVm,
  joinOriginalFinalGcpBootstrapVm,
} from './gcp-bootstrap-vm-binding';
import { openInstalledGcpCloudSerialReader } from './gcp-cloud-serial-reader';
import { collectInstalledOriginalCeAudit, collectInstalledOriginalObserverAudit } from './gcp-insert-audit-evidence';
import { collectOriginalEarlyGcpInsertIdentity, type OriginalEarlyGcpInsertIdentity } from './gcp-insert-evidence';
import { closeOriginalGcpObserverClientInstallation } from './gcp-observer-client-delivery';
import { captureOriginalGcpObserverImage, openInstalledGcpObserverImageReader } from './gcp-observer-image';
import {
  bindOriginalGcpObserverFinalImage,
  collectOriginalGcpObserverInsertIdentity,
  readOriginalGcpObserverAuditSource,
} from './gcp-observer-insert-evidence';
import { closeOriginalGcpSshClientProfile } from './gcp-ssh-client-profile';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { type InstalledApplyTraceDispatch, openInstalledApplyTraceStage } from './installed-apply-trace-stage';
import { scheduleInstalledBeforeGuestRound } from './installed-before-guest-round';
import {
  collectInstalledOriginalBootstrapReaderSources,
  openInstalledBootstrapCapture,
} from './installed-bootstrap-capture';
import type { InstalledCaptureContext } from './installed-capture-context';
import { createInstalledCaptureCoordinator, type InstalledCaptureStage } from './installed-capture-coordinator';
import { openInstalledGcpCeAccess } from './installed-ce-access';
import { collectInstalledCeInsertWitnesses } from './installed-ce-insert-witnesses';
import { collectInstalledOriginalDeleteReaderSources, openInstalledDeleteCapture } from './installed-delete-capture';
import { openInstalledGcpGuestBinding } from './installed-guest-binding';
import {
  collectInstalledOriginalGuestReaderClosures,
  collectInstalledOriginalGuestRound,
  openInstalledFinalGuestWorker,
  openInstalledGuestWorker,
} from './installed-guest-worker';
import { readOriginalApplyGcpInventory } from './installed-initial-inventory';
import { openInstalledInventoryCaptureStage } from './installed-inventory-capture-stage';
import { openInstalledGcpObserverAccess } from './installed-observer-access';
import { collectInstalledObserverInsertWitnesses } from './installed-observer-insert-witnesses';
import { type InstalledProviderWindow, openInstalledProviderReader } from './installed-provider-reader';
import { type InstalledGcpCapture, readOwnedInstalledInput } from './installed-runtime';
import { openInstalledGcpSshClientProfile } from './installed-ssh-clients';
import { resolveInstalledGcpVersionProfile } from './installed-version-profile';
import { openInstalledVmCapture } from './installed-vm-capture';
import { serializeInstalledVmCapture } from './installed-vm-operation-queue';
import { linuxMonotonicMs } from './linux-clock';
import { collectInstalledOriginalAccessReaderSources } from './original-access-reader-source';
import { closeOriginalCaptureSources, closeOriginalGuestSources } from './original-capture-source-closure';
import { corroborateOriginalGoogleRpcProvider } from './original-google-provider-source';
import type { OriginalInputBinding } from './original-input-monitor';
import { assertSameOriginalInput, monitorOriginalInputs } from './original-input-monitor';
import {
  assertOriginalReaderGroupInputs,
  type OriginalReaderSourceClosure,
  persistOriginalReaderGroupSet,
} from './original-reader-group-closure';
import { prepareOriginalCreationScope } from './prepared-creation-scope';
import { assertOriginalTerraformPlanProjection } from './runner';
import type { CeTerraformRuntimeRequest } from './service';

type Observer = Awaited<ReturnType<typeof openInstalledGcpObserverAccess>>;
type Ce = Awaited<ReturnType<typeof openInstalledGcpCeAccess>>;
type Binding = Awaited<ReturnType<typeof openInstalledGcpGuestBinding>>;
type Worker = Awaited<ReturnType<typeof openInstalledGuestWorker>>;
type VmCapture = Awaited<ReturnType<typeof openInstalledVmCapture>>;
type Node = {
  siteName: string;
  nodeName: string;
  tokenName: string;
  zone: string;
  identity?: OriginalEarlyGcpInsertIdentity;
  bootstrapVm?: Awaited<ReturnType<typeof joinOriginalEarlyGcpBootstrapVm>>;
  access?: Ce;
  binding?: Binding;
  worker?: Worker;
  round?: Promise<unknown>;
  roundActive?: boolean;
  nextRoundAtMs?: number;
  finalAccess?: Ce;
  finalBinding?: Binding;
  finalWorker?: Worker;
  finalRound?: unknown;
  failure?: unknown;
};

/** The installed producer has no transport, command, clock or issuer override.
 * The original controller supplies every execution and final callback. Source
 * composition does not replace operational, traffic or publication acceptance. */
export function createInstalledGcpCaptureFactory() {
  return (request: CeTerraformRuntimeRequest, context: InstalledCaptureContext): InstalledGcpCapture => {
    if (
      context?.kind !== 'original-installed-gcp-capture-context' ||
      context.schemaVersion !== 2 ||
      request.owner?.provider !== 'gcp' ||
      request.owner.engine !== 'terraform' ||
      request.deployment?.engine !== 'terraform' ||
      request.deployment.deploymentId !== context.owner.deploymentId ||
      join(request.directory, request.deployment.deploymentId) !== context.executionDirectory ||
      context.budget.deadline - context.budget.start !== 7200000 ||
      (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
        (key) => request.owner[key] !== context.owner[key],
      )
    )
      throw new Error('Original complete capture factory request/context required');
    let store: CeDeploymentStore | undefined;
    let groupInputs: Readonly<Record<string, OriginalInputBinding>> | undefined;
    let requiredReaderSources: readonly string[] = [];
    let collectReaderSources: (() => Promise<readonly OriginalReaderSourceClosure[]>) | undefined;
    const persist = async (event: Readonly<Record<string, unknown>>) => {
      if (!store) throw new Error('Original factory storage is not prepared');
      await store.verify();
      await store.write(`gcp-complete-factory-${randomUUID()}.json`, {
        schemaVersion: 1,
        kind: 'original-installed-complete-capture-factory-event',
        owner: context.owner,
        originalBudget: context.budget,
        ...event,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      });
    };
    const preparationSources: Array<{ name: string; close(): void | Promise<void> }> = [];
    let preparationFailed = false;
    let preparing: Promise<void> | undefined;
    let closure: Promise<void> | undefined;
    let closing = false;
    let preparationClosure: Promise<void> | undefined;
    const ownPreparation = (name: string, close: () => void | Promise<void>) => {
      preparationSources.push({ name, close });
    };
    const closePreparation = () => {
      preparationClosure ??= closeOriginalCaptureSources([...preparationSources].reverse());
      return preparationClosure;
    };
    const coordinated = createInstalledCaptureCoordinator(context, {
      persist,
      async stages(original) {
        if (original !== context) throw new Error('Original factory preparation context required');
        await context.assertInputs();
        await context.assertWithinDeadline();
        const plan = await context.readOriginalPlanSource?.();
        if (!plan) throw new Error('Original owning plan required for complete capture factory');
        await assertOriginalTerraformPlanProjection(plan);
        if (
          plan.directory !== context.executionDirectory ||
          plan.scope.cloud !== 'gcp' ||
          plan.scope.account !== context.owner.account ||
          plan.scope.region !== context.owner.region ||
          plan.receipt.deploymentId !== context.owner.deploymentId
        )
          throw new Error('Original factory owning plan scope differs');
        const originalStore = await request.platform.storage(context.owner);
        store = originalStore;
        await store.verify();
        if (store.directory !== request.directory)
          throw new Error('Original initial factory storage directory differs');
        const admitted = context.inputs['workspace:gcp-terraform-input-identity.json'];
        if (!admitted) throw new Error('Original factory intent input required');
        const raw = await readOwnedInstalledInput(admitted.path);
        assertSameOriginalInput(admitted, raw.binding);
        const saved = JSON.parse(raw.bytes.toString()) as {
          intent: GcpCeIntent;
          intentFingerprint: string;
          platformContext: string;
        };
        validateIntent(saved.intent);
        const intent = saved.intent;
        if (
          saved.intentFingerprint !== fingerprint(intent) ||
          saved.platformContext !== intent.platformContext ||
          intent.engine !== 'terraform' ||
          intent.operation !== 'deploy' ||
          intent.project !== context.owner.account ||
          intent.region !== context.owner.region ||
          intent.deploymentName !== context.owner.deploymentId ||
          intent.schemaVersion !== 2 ||
          !intent.observer ||
          intent.sites.length !== 1 ||
          intent.sites[0].nodes.length !== 3
        )
          throw new Error('Original complete factory requires the qualified initial three-node observer scope');
        const nodes: Node[] = intent.sites.flatMap((site) =>
          site.nodes.map((node) => ({
            siteName: site.name,
            nodeName: node.name,
            tokenName: `${node.name}-token`,
            zone: node.zone,
          })),
        );
        const binding = {
          terraformVersion: plan.terraformVersion,
          providerLockSha256: plan.receipt.providerLockSha256,
        };
        const version = resolveInstalledGcpVersionProfile(binding);
        const providers = await context.readProviderInputs();
        const provider =
          providers[`registry.terraform.io/hashicorp/google:terraform-provider-google_v${version.googleVersion}_x5`];
        if (!provider || provider.sha256 !== version.googleProviderSha256)
          throw new Error('Original factory Google provider package required');
        if (plan.receipt.operation === 'destroy') {
          const deletion = await openInstalledDeleteCapture({ context, store, plan, intent });
          ownPreparation('delete', () => deletion.closeAfterExecutorExit());
          requiredReaderSources = Object.freeze(['delete-output']);
          collectReaderSources = () => collectInstalledOriginalDeleteReaderSources(deletion);
          await persist({
            phase: 'assembled',
            operation: 'destroy',
            stages: [{ name: 'delete' }],
            resourceCount: plan.resources.filter((row) => row.mode === 'managed').length,
          });
          return [{ name: 'delete', worker: deletion }];
        }
        const observerPlans = plan.resources.filter((row) => {
          const name = row.fields.name;
          return (
            row.type === 'google_compute_instance' &&
            row.mode === 'managed' &&
            row.actions.includes('create') &&
            name?.status === 'known' &&
            !nodes.some((node) => node.nodeName === name.value)
          );
        });
        const observerName = observerPlans[0]?.fields.name;
        if (observerPlans.length !== 1 || observerName?.status !== 'known' || typeof observerName.value !== 'string')
          throw new Error('Original factory unique observer instance required');
        const observerNode = observerName.value;
        const packet = await prepareOriginalCreationScope(context);
        const inventory = await openInstalledInventoryCaptureStage({ context, store, platform: request.platform });
        ownPreparation('inventory', () => inventory.closeAfterExecutorExit());
        const bootstrap = await openInstalledBootstrapCapture({
          context,
          store,
          packet,
          platform: request.platform,
          platformContext: saved.platformContext,
          nodes: nodes.map(({ siteName, nodeName, tokenName }) => ({ siteName, nodeName, tokenName })),
        });
        ownPreparation('bootstrap', () => bootstrap.closeAfterExecutorExit());
        const adc = await readOwnedInstalledInput(context.inputs.adc.path);
        assertSameOriginalInput(context.inputs.adc, adc.binding);
        const imageReader = await openInstalledGcpObserverImageReader(context);
        const image = await captureOriginalGcpObserverImage(imageReader);
        let observerIdentity: Awaited<ReturnType<typeof collectOriginalGcpObserverInsertIdentity>> | undefined;
        const profile = await openInstalledGcpSshClientProfile();
        ownPreparation('ssh-profile', () => closeOriginalGcpSshClientProfile(profile));
        const cloud = await openInstalledGcpCloudSerialReader(context);
        ownPreparation('cloud-reader', () => cloud.close());
        let finalCloud: Awaited<ReturnType<typeof openInstalledGcpCloudSerialReader>> | undefined;
        let before: OriginalApplyCallbackContext | undefined, after: OriginalApplyCallbackContext | undefined;
        let vm: VmCapture | undefined;
        let observer: Observer | undefined, finalObserver: Observer | undefined;
        let providerReader: Awaited<ReturnType<typeof openInstalledProviderReader>> | undefined;
        const windows: InstalledProviderWindow[] = [];
        const windowPromises: Promise<InstalledProviderWindow>[] = [];
        let observing = false,
          finishing = false,
          observerInserted = false;
        let observation: Promise<void> | undefined;
        let providerSchedule: Promise<void> | undefined;
        let providerFailure: unknown, observationFailure: unknown;
        const useBefore = async () => {
          if (!before || finishing) throw new Error('Original factory before lifetime retired');
          await assertOriginalApplyLifetime(before);
          return before;
        };
        const admit = async (source: InstalledApplyTraceDispatch) => {
          if (!vm || !before || source.callback !== before || source.callback.phase !== 'before')
            throw new Error('Original factory insert before sources required');
          if (source.target.name === observerNode) {
            const beforeImageReader = await openInstalledGcpObserverImageReader(context, before);
            const beforeImage = await captureOriginalGcpObserverImage(beforeImageReader);
            if (beforeImage.creationTimestamp !== image.creationTimestamp)
              throw new Error('Original factory observer image changed before insertion');
            const identity = await collectOriginalGcpObserverInsertIdentity({
              callback: before,
              baseline: await inventory.readBaseline(before),
              response: source.response,
              binding,
              imageReader: beforeImageReader,
              image: beforeImage,
            });
            observerIdentity = identity;
            await vm.admitObserver(identity);
            observerInserted = true;
          } else {
            const node = nodes.find((node) => node.nodeName === source.target.name);
            if (!node || node.identity) throw new Error('Original factory unique CE insert required');
            node.identity = await collectOriginalEarlyGcpInsertIdentity({
              originalPlan: plan,
              response: source.response,
              binding,
            });
            await vm.admitCe(node.identity);
          }
        };
        const observe = async () => {
          const callback = await useBefore();
          if (!vm) throw new Error('Original factory VM stage required');
          const originalVm = vm;
          const baseline = await readOriginalApplyGcpInventory(await inventory.readBaseline(callback));
          const prepared = await Promise.allSettled([
            (async () => {
              if (
                !observer &&
                observerInserted &&
                baseline.cloud.some((row) => row.role === 'observer' && row.target.kind === 'instance')
              ) {
                const view = await originalVm.reconcile(observerNode);
                if (view) {
                  const serial = await originalVm.captureSerial(observerNode, '0');
                  if (String(serial.source.contents ?? '').includes('SHA256:')) {
                    observer = await openInstalledGcpObserverAccess({
                      vm: serial.vm,
                      serial: serial.evidence,
                      callback,
                      store: originalStore,
                      profile,
                    });
                    await observer.initialize();
                  }
                }
              }
            })(),
            ...nodes.map(async (node) => {
              if (!node.identity || node.access || node.failure) return;
              const view = await originalVm.reconcile(node.nodeName);
              if (!view) return;
              const serial = await originalVm.captureSerial(node.nodeName, '0');
              if (!String(serial.source.contents ?? '').includes('SHA256:')) return;
              await bootstrap.waitForGrants();
              const token = await bootstrap.refreshBootstrap(node.nodeName);
              node.bootstrapVm = await joinOriginalEarlyGcpBootstrapVm({
                context,
                callback,
                identity: node.identity,
                bootstrap: token,
                vm: serial.vm as Parameters<typeof joinOriginalEarlyGcpBootstrapVm>[0]['vm'],
              });
              node.access = await openInstalledGcpCeAccess({
                vm: serial.vm,
                bootstrapVm: node.bootstrapVm,
                bootstrap: token,
                serial: serial.evidence,
                callback,
                store: originalStore,
              });
            }),
          ]);
          if (prepared.some((result) => result.status === 'rejected'))
            throw new AggregateError(
              prepared.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
              'Original independent observer or CE access preparation refused',
            );
          if (observer) {
            const clients = (await observer.read()).clients;
            for (const node of nodes) {
              if (!node.access || node.binding || node.failure) continue;
              await node.access.initialize(clients);
              node.binding = await openInstalledGcpGuestBinding({
                ce: await node.access.read(),
                observer: await observer.read(),
                callback,
              });
              node.worker = await openInstalledGuestWorker(node.binding);
              await node.worker.initialize();
              await persist({ phase: 'before-guest-ready', nodeName: node.nodeName, worker: node.worker.evidence() });
            }
          }
          for (const node of nodes) {
            if (node.worker && !node.failure) await scheduleInstalledBeforeGuestRound(node, callback, persist);
          }
        };
        const scheduleObservation = () => {
          if (finishing || observing || observationFailure) return;
          observing = true;
          observation = observe()
            .catch(async (error) => {
              observationFailure ??= error;
              await persist({
                phase: 'observation-refused',
                errorType: error instanceof Error ? error.name : typeof error,
              });
            })
            .finally(() => {
              observing = false;
            });
        };
        const observerRoles = ['wire', 'trust', 'peer', 'delivery', 'abi', 'renewal'];
        const sourceName = (phase: string, node: Node, role: string) =>
          `${phase}-ce-${fingerprint(node.nodeName).slice(7, 23)}-${role}`;
        requiredReaderSources = Object.freeze([
          'provider',
          'xcsh',
          'bootstrap-publisher',
          'guest-before',
          'guest-final',
          ...['before', 'final'].flatMap((phase) => observerRoles.map((role) => `${phase}-observer-${role}`)),
          ...nodes.flatMap((node) =>
            ['before', 'final'].flatMap((phase) => ['wire', 'trust'].map((role) => sourceName(phase, node, role))),
          ),
        ]);
        collectReaderSources = async () => {
          const tasks: Array<Promise<readonly OriginalReaderSourceClosure[]>> = [
            (async () => {
              if (!providerReader) return [{ name: 'provider', attemptCount: 0, witnesses: [] }];
              const witnesses = await providerReader.readerClosureWitnesses();
              return [{ name: 'provider', attemptCount: providerReader.captures().length, witnesses }];
            })(),
            collectInstalledOriginalBootstrapReaderSources(bootstrap),
          ];
          for (const phase of ['before', 'final'] as const) {
            tasks.push(
              (async () => {
                const workers = nodes
                  .map((node) => (phase === 'before' ? node.worker : node.finalWorker))
                  .filter((worker): worker is Worker => !!worker);
                const results = await Promise.allSettled(workers.map(collectInstalledOriginalGuestReaderClosures));
                const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
                if (failures.length)
                  throw new AggregateError(failures, `Original ${phase} guest source collection incomplete`);
                return [
                  {
                    name: `guest-${phase}`,
                    attemptCount: workers.reduce((sum, worker) => sum + worker.evidence().submissions, 0),
                    witnesses: results.flatMap((result) => (result.status === 'fulfilled' ? [...result.value] : [])),
                  },
                ];
              })(),
            );
            tasks.push(
              (async () => {
                const original = phase === 'before' ? observer : finalObserver;
                const sources = original
                  ? await collectInstalledOriginalAccessReaderSources(original)
                  : observerRoles.map((role) => ({ name: `observer-${role}`, attemptCount: 0, witnesses: [] }));
                return sources.map((source) => ({ ...source, name: `${phase}-${source.name}` }));
              })(),
            );
            for (const node of nodes)
              tasks.push(
                (async () => {
                  const original = phase === 'before' ? node.access : node.finalAccess;
                  const sources = original
                    ? await collectInstalledOriginalAccessReaderSources(original)
                    : ['wire', 'trust'].map((role) => ({ name: `ce-${role}`, attemptCount: 0, witnesses: [] }));
                  return sources.map((source) => ({ ...source, name: sourceName(phase, node, source.name.slice(3)) }));
                })(),
              );
          }
          const outcomes = await Promise.allSettled(tasks);
          const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));
          if (failures.length)
            throw new AggregateError(failures, 'Original complete factory reader source coverage incomplete');
          return Object.freeze(
            outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [...outcome.value] : [])),
          );
        };

        const trace = await openInstalledApplyTraceStage({
          context,
          store,
          providerPath: provider.path,
          onResponse: admit,
          onObservation: async () => {
            scheduleObservation();
          },
        });
        const providerWorker: InstalledGcpCapture = {
          async start(admission, callback) {
            if (!callback || callback.original !== context || callback.phase !== 'before')
              throw new Error('Original factory provider callback required');
            before = callback;
            providerReader = await openInstalledProviderReader(context, admission);
            const startWindow = () => {
              if (!providerReader) throw new Error('Original provider source unavailable');
              const pending = providerReader.startStderrWindow();
              const result = pending.complete.then((window) => {
                windows.push(window);
                return window;
              });
              result.catch((error) => {
                providerFailure ??= error;
              });
              windowPromises.push(result);
              return pending.ready;
            };
            await startWindow();
            providerSchedule = (async () => {
              let next = linuxMonotonicMs() + 30000;
              while (!finishing) {
                await Bun.sleep(100);
                if (!finishing && linuxMonotonicMs() >= next) {
                  await useBefore();
                  await startWindow();
                  next = linuxMonotonicMs() + 30000;
                }
              }
            })().catch((error) => {
              providerFailure ??= error;
            });
          },
          async assertOriginal() {
            await context.assertInputs();
            if (providerFailure) throw providerFailure;
          },
          async finalCapture(_capture, _reserve, callback) {
            if (!callback) throw new Error('Original factory final provider callback required');
            after = callback;
            finishing = true;
            await providerSchedule;
            const results = await Promise.allSettled(windowPromises);
            if (providerFailure || !windows.length || results.some((result) => result.status === 'rejected'))
              throw new Error('Original factory provider observation incomplete');
            await assertOriginalApplyCallback(callback);
            await persist({ phase: 'provider-windows', hashes: windows.map((window) => window.evidenceSha256) });
          },
          async closeAfterExecutorExit() {
            await providerReader?.close();
          },
        };
        const vmWorker: InstalledGcpCapture = {
          async start(_admission, callback) {
            if (!callback) throw new Error('Original factory VM callback required');
            before = callback;
            vm = serializeInstalledVmCapture(
              await openInstalledVmCapture({
                callback,
                baseline: await inventory.readBaseline(callback),
                reader: cloud,
              }),
            );
          },
          async assertOriginal() {
            await context.assertInputs();
          },
          async finalCapture(_capture, _reserve, callback) {
            if (!callback?.reserve || !vm) throw new Error('Original factory final VM sources required');
            after = callback;
            finishing = true;
            await observation;
            finalCloud = await openInstalledGcpCloudSerialReader(context, undefined, undefined, {
              admission: callback.execution,
              reserve: callback.reserve,
            });
            if (observerIdentity) {
              const finalImageReader = await openInstalledGcpObserverImageReader(context, callback);
              await bindOriginalGcpObserverFinalImage(observerIdentity, callback, finalImageReader);
            }
            const report = await vm.finalCapture(callback, finalCloud);
            await persist({ phase: 'final-vm', report });
            if (!report.vmCoverageComplete || report.failures.length)
              throw new Error('Original factory final VM coverage incomplete');
          },
          async closeAfterExecutorExit() {
            await closeOriginalCaptureSources([
              {
                name: 'final-cloud-reader',
                close: async () => {
                  await finalCloud?.close();
                },
              },
              { name: 'before-cloud-reader', close: () => cloud.close() },
            ]);
          },
        };
        const guestWorker: InstalledGcpCapture = {
          async start() {},
          async assertOriginal() {
            await context.assertInputs();
          },
          async finalCapture(_capture, _reserve, callback) {
            if (!callback || !vm) throw new Error('Original factory final guest source unavailable');
            after = callback;
            finishing = true;
            const serial = await vm.readSerialPacket(observerNode, callback);
            // An attempted delivery requires its exact durable installation;
            // missing/truncated proof cannot select a second delivery.
            const installation = observer?.coverage().clientDeliveryAttempted
              ? await observer.readInstallation()
              : undefined;
            finalObserver = await openInstalledGcpObserverAccess({
              vm: serial.vm,
              serial: serial.evidence,
              callback,
              store: originalStore,
              profile,
              ...(installation ? { installation } : {}),
            });
            await finalObserver.initialize();
            const clients = (await finalObserver.read()).clients;
            const originalVmStage = vm;
            const originalFinalObserver = finalObserver;
            const results = await Promise.allSettled(
              nodes.map(async (node) => {
                if (!node.identity) throw new Error('Original inserted guest identity unavailable');
                await node.round?.catch(() => undefined);
                const packet = await originalVmStage.readSerialPacket(node.nodeName, callback);
                const token = await bootstrap.refreshBootstrap(node.nodeName, callback);
                const coupled = node.bootstrapVm
                  ? await handoffOriginalEarlyGcpBootstrapVm(node.bootstrapVm, {
                      callback,
                      bootstrap: token,
                      vm: packet.vm as Parameters<typeof handoffOriginalEarlyGcpBootstrapVm>[1]['vm'],
                    })
                  : await joinOriginalFinalGcpBootstrapVm({
                      context,
                      callback,
                      bootstrap: token,
                      identity: node.identity,
                      vm: packet.vm as Parameters<typeof joinOriginalFinalGcpBootstrapVm>[0]['vm'],
                    });
                node.finalAccess = await openInstalledGcpCeAccess({
                  vm: packet.vm,
                  bootstrapVm: coupled,
                  bootstrap: token,
                  serial: packet.evidence,
                  callback,
                  store: originalStore,
                });
                await node.finalAccess.initialize(clients);
                const finalSources = {
                  ce: await node.finalAccess.read(),
                  observer: await originalFinalObserver.read(),
                  callback,
                };
                if (node.binding) await node.binding.handoff(finalSources);
                else node.binding = await openInstalledGcpGuestBinding(finalSources);
                await node.worker?.dispose();
                node.finalWorker = await openInstalledFinalGuestWorker(node.binding, callback);
                await node.finalWorker.initialize();
                node.finalRound = await collectInstalledOriginalGuestRound(node.finalWorker);
                await persist({
                  phase: 'final-round',
                  nodeName: node.nodeName,
                  report: node.finalRound,
                  priorFailureRetained: !!node.failure,
                  firstBootstrapJoinPhase: node.bootstrapVm ? 'before' : 'after',
                  worker: node.finalWorker.evidence(),
                });
              }),
            );
            await persist({
              phase: 'final-guest',
              expected: nodes.length,
              captured: results.filter((result) => result.status === 'fulfilled').length,
              beforeObservationFailed: !!observationFailure,
              beforeGuestFailures: nodes.filter((node) => node.failure).length,
            });
            if (
              results.some((result) => result.status === 'rejected') ||
              observationFailure ||
              nodes.some((node) => node.failure)
            )
              throw new Error('Original factory guest capture incomplete; before failure retained');
          },
          async closeAfterExecutorExit() {
            const failures: unknown[] = [];
            try {
              await closeOriginalGuestSources(nodes);
            } catch (error) {
              failures.push(error);
            }
            for (const phase of ['before', 'final'] as const) {
              const workers = nodes
                .map((node) => (phase === 'before' ? node.worker : node.finalWorker))
                .filter((worker): worker is Worker => !!worker);
              const attemptCount = workers.reduce((sum, worker) => sum + worker.evidence().submissions, 0);
              const results = await Promise.allSettled(workers.map(collectInstalledOriginalGuestReaderClosures));
              const witnesses = results.flatMap((result) => (result.status === 'fulfilled' ? [...result.value] : []));
              for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
              if (results.some((result) => result.status === 'rejected') || attemptCount !== witnesses.length) {
                failures.push(new Error(`Original factory guest ${phase} attempt coverage incomplete`));
                continue;
              }
              try {
                await persist({
                  phase: 'guest-reader-groups',
                  source: `guest-${phase}`,
                  attemptCount,
                  witnesses,
                  closureFailureRetained: failures.length > 0,
                });
              } catch (error) {
                failures.push(error);
              }
            }
            if (failures.length)
              throw new AggregateError(failures, 'Original factory guest closure or source retention incomplete');
          },
        };
        const accessWorker: InstalledGcpCapture = {
          async start() {},
          async assertOriginal() {
            await context.assertInputs();
          },
          async finalCapture() {},
          async closeAfterExecutorExit() {
            await closeOriginalCaptureSources([
              ...nodes.flatMap((node) => [
                {
                  name: `${node.nodeName}:final-access`,
                  close: async () => {
                    await node.finalAccess?.close(after);
                  },
                },
                {
                  name: `${node.nodeName}:before-access`,
                  close: async () => {
                    await node.access?.close(after);
                  },
                },
              ]),
              {
                name: 'final-observer-access',
                close: async () => {
                  await finalObserver?.close(after);
                },
              },
              {
                name: 'before-observer-access',
                close: async () => {
                  await observer?.close(after);
                },
              },
            ]);
            if (observer) closeOriginalGcpObserverClientInstallation(await observer.readInstallation());
            closeOriginalGcpSshClientProfile(profile);
          },
        };
        const correspondenceWorker: InstalledGcpCapture = {
          async start() {},
          async assertOriginal() {
            await context.assertInputs();
          },
          async finalCapture(_capture, _reserve, callback) {
            if (!callback) throw new Error('Original factory final correspondence callback required');
            const transcript = await trace.readTranscript(callback);
            const correspondences = [];
            for (const rpc of transcript.rpcs) {
              if (rpc.rpc !== 'ApplyResourceChange' || rpc.resourceType !== 'google_compute_instance') continue;
              const matching = windows.filter((window) =>
                window.observations.some((row) => row.candidate.pid === rpc.providerPid),
              );
              correspondences.push(await corroborateOriginalGoogleRpcProvider({ rpc, windows: matching, binding }));
            }
            await persist({ phase: 'provider-correspondence', correspondences });
            const ceWitnesses = await collectInstalledCeInsertWitnesses({
              ...transcript,
              targets: transcript.targets.filter((target) => nodes.some((node) => node.nodeName === target.name)),
              windows,
            });
            await persist({
              phase: 'ce-insert-witnesses',
              sources: ceWitnesses.map(({ target, witnesses }) => ({ target, witnesses })),
            });
            if (!finalCloud) throw new Error('Original factory final audit reader unavailable');
            const baseline = await inventory.readBaseline(callback);
            for (const { candidate } of ceWitnesses) {
              const audit = await collectInstalledOriginalCeAudit({
                source: candidate,
                reader: finalCloud,
                baseline,
                callback,
              });
              await persist({ phase: 'ce-insert-audit', source: audit });
            }
            if (!observerIdentity || !vm) throw new Error('Original observer audit sources unavailable');
            const observerSource = await readOriginalGcpObserverAuditSource(observerIdentity, callback, baseline);
            const observerBodies = transcript.bodies.filter(
              (body) =>
                body.requestBodySha256 === observerSource.value.requestBodySha256 &&
                body.responseBodySha256 === observerSource.value.responseBodySha256,
            );
            const observerStarts = transcript.hooks.filter(
              (hook) => hook.address === observerSource.value.address && hook.phase === 'apply_start',
            );
            const observerEnds = transcript.hooks.filter(
              (hook) => hook.address === observerSource.value.address && hook.phase === 'apply_complete',
            );
            const observerRpcs = transcript.rpcs.filter(
              (rpc) => rpc.rpcRequestId === observerBodies[0]?.rpcRequestId && rpc.rpc === 'ApplyResourceChange',
            );
            if (
              observerBodies.length !== 1 ||
              observerStarts.length !== 1 ||
              observerEnds.length !== 1 ||
              observerRpcs.length !== 1
            )
              throw new Error('Original factory observer witness sources absent or ambiguous');
            const observerWitness = await collectInstalledObserverInsertWitnesses({
              identity: observerIdentity,
              callback,
              baseline,
              originalPlan: transcript.originalPlan,
              configuration: transcript.configuration,
              binding,
              providerPath: transcript.providerPath,
              body: observerBodies[0],
              started: observerStarts[0],
              completed: observerEnds[0],
              rpc: observerRpcs[0],
              windows: windows.filter((window) =>
                window.observations.some((row) => row.candidate.pid === observerRpcs[0].providerPid),
              ),
            });
            await persist({ phase: 'observer-insert-witnesses', source: observerWitness });
            const observerPacket = await vm.readSerialPacket(observerNode, callback);
            const observerAudit = await collectInstalledOriginalObserverAudit({
              identity: observerIdentity,
              vm: observerPacket.vm as Parameters<typeof collectInstalledOriginalObserverAudit>[0]['vm'],
              reader: finalCloud,
              baseline,
              callback,
            });
            await persist({ phase: 'observer-insert-audit', source: observerAudit });
            if (ceWitnesses.length !== nodes.length)
              throw new Error('Original factory CE insertion witnesses incomplete');
            if (correspondences.length !== nodes.length + 1)
              throw new Error('Original factory insert RPC correspondence incomplete');
          },
          async closeAfterExecutorExit() {},
        };
        const stages: InstalledCaptureStage[] = [
          { name: 'inventory', worker: inventory, closeAfter: ['vm', 'guest', 'trace', 'bootstrap'] },
          { name: 'bootstrap', worker: bootstrap, closeAfter: ['guest', 'access'] },
          { name: 'provider', worker: providerWorker, closeAfter: ['correspondence'] },
          { name: 'vm', worker: vmWorker, finalAfter: ['trace'], closeAfter: ['guest', 'access'] },
          { name: 'trace', worker: trace, closeAfter: ['correspondence', 'vm', 'guest'] },
          { name: 'correspondence', worker: correspondenceWorker, finalAfter: ['trace', 'provider', 'vm'] },
          { name: 'access', worker: accessWorker, closeAfter: ['guest'] },
          { name: 'guest', worker: guestWorker, finalAfter: ['vm', 'bootstrap', 'correspondence'] },
        ];
        await persist({
          phase: 'assembled',
          stages: stages.map(({ name, finalAfter, closeAfter }) => ({ name, finalAfter, closeAfter })),
          resourceCount: plan.resources.filter((row) => row.mode === 'managed' && row.actions.includes('create'))
            .length,
        });
        return stages;
      },
    });
    return {
      ...coordinated,
      prepare(original) {
        if (original !== context) return Promise.reject(new Error('Original factory preparation context required'));
        if (closing) return Promise.reject(new Error('Original factory is closed for preparation'));
        preparing ??= (async () => {
          try {
            await coordinated.prepare?.(original);
          } catch (error) {
            preparationFailed = true;
            try {
              await closePreparation();
            } catch (closure) {
              throw new AggregateError([error, closure], 'Original factory preparation and source closure failed');
            }
            throw error;
          }
        })();
        return preparing;
      },
      start(admission, callback) {
        if (closing) return Promise.reject(new Error('Original factory is closed for startup'));
        return coordinated.start(admission, callback);
      },
      assertOriginal() {
        if (closing) return Promise.reject(new Error('Original factory is closed for source verification'));
        return coordinated.assertOriginal();
      },
      closeAfterExecutorExit() {
        closing = true;
        closure ??= (async () => {
          await preparing?.catch(() => undefined);
          const failures: unknown[] = [];
          try {
            if (!preparing) {
              // A normal prerequisite may refuse before the factory has ever
              // prepared stages. Retain that exact no-reader path; never claim
              // assembled roles for an attempted or partial preparation.
              if (preparationSources.length) throw new Error('Original unprepared source state differs');
              const originalStore = await request.platform.storage(context.owner);
              await originalStore.verify();
              if (originalStore.directory !== request.directory)
                throw new Error('Original unprepared factory storage directory differs');
              store = originalStore;
              const admittedInputs = structuredClone(context.inputs);
              const assertUnpreparedInputs = async () => {
                const monitor = await monitorOriginalInputs(admittedInputs);
                try {
                  await originalStore.verify();
                  await monitor.assertOriginal();
                } finally {
                  monitor.close();
                }
              };
              await assertUnpreparedInputs();
              requiredReaderSources = Object.freeze(['factory-preparation']);
              collectReaderSources = async () => {
                if (preparing || preparationSources.length) throw new Error('Original never-prepared source required');
                await assertUnpreparedInputs();
                return Object.freeze([
                  Object.freeze({ name: 'factory-preparation', attemptCount: 0, witnesses: Object.freeze([]) }),
                ]);
              };
              await persist({ phase: 'unprepared-source-closed', preparationInvoked: false, nativeReaderAttempts: 0 });
            }
            if (!preparing || preparationFailed) await closePreparation();
            else await coordinated.closeAfterExecutorExit();
          } catch (error) {
            failures.push(error);
          }
          if (collectReaderSources) {
            try {
              if (!store) throw new Error('Original factory source store unavailable');
              const sources = await collectReaderSources();
              groupInputs = await persistOriginalReaderGroupSet({
                store,
                owner: context.owner,
                requiredSources: requiredReaderSources,
                sources,
              });
              await persist({
                phase: 'reader-group-set',
                inputs: groupInputs,
                requiredSources: requiredReaderSources,
                captureFailureRetained: failures.length > 0,
              });
            } catch (error) {
              failures.push(error);
            }
          }
          if (failures.length)
            throw new AggregateError(failures, 'Original factory closure or durable source coverage incomplete');
        })();
        return closure;
      },
      async readClosedReaderGroupInputs() {
        await closure?.catch(() => undefined);
        if (!closing || !groupInputs) throw new Error('Original factory reader group coverage unavailable');
        await collectReaderSources?.();
        await assertOriginalReaderGroupInputs({
          inputs: groupInputs,
          owner: context.owner,
          requiredSources: requiredReaderSources,
        });
        return groupInputs;
      },
    };
  };
}
