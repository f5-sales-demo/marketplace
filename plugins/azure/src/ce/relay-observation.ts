import { randomBytes } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { azureRelayCurrentIdentityContext } from './relay-current-identity';
import { compileAzureRelayGuestActivation, compileAzureRelayGuestObservation } from './relay-guest';
import { compileAzureRelayGuestFib, parseAzureRelayGuestFib } from './relay-guest-fib';
import { compileAzureRelayGuestRoute, parseAzureRelayGuestRoute } from './relay-guest-routes';
import { observeAzureRelayRouteExchange } from './relay-route-evidence';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay observation: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed owned checkpoint');
  return value as Json;
};

/** Read current CE sessions, FRR membership and cloud exchange. FIB, traffic and sample freshness stay separate. */
export async function observeAzureRelayRoutingWorkflow(
  source: AzureCePlan,
  expected: ExpectedCeInterface[],
  runtime: Pick<
    CeRuntime,
    | 'engine'
    | 'requireAzureRelayRoutingContract'
    | 'observeOwnedSite'
    | 'observeAzureInterfaces'
    | 'observeBgpSessions'
    | 'observeBgpRoutes'
  > &
    Partial<Pick<CeRuntime, 'observeAzureInterfacesForNodes' | 'observeBgpRoutesForNodes'>>,
  storage: Pick<CeDeploymentStore, 'owner' | 'verify' | 'read'>,
  api: AzExecApi,
  signal?: AbortSignal,
  outage?: { nodeIndex: number },
) {
  signal?.throwIfAborted();
  outage = outage ? structuredClone(outage) : undefined;
  runtime.requireAzureRelayRoutingContract();
  await storage.verify();
  if (outage)
    require(Object.keys(outage).join(',') === 'nodeIndex' &&
      runtime.observeBgpRoutesForNodes, 'outage requires exact selected node and surviving route observer');
  const baselineRecords = outage
    ? new Map<string, unknown>(
        await Promise.all(
          ['relay-routing-workflow.json', 'platform-relay-routing.json', 'relay-routing-configuration.json'].map(
            async (name) => [name, await storage.read(name)] as const,
          ),
        ),
      )
    : undefined;
  const context = await azureRelayCurrentIdentityContext(
    source,
    expected,
    runtime,
    storage,
    api,
    signal,
    outage && baselineRecords ? { nodeIndex: outage.nodeIndex, baselineRecords } : undefined,
  );
  const { plan, binding, bounded, deadline, observe } = context;
  source = context.source;
  const journal = object(await storage.read('relay-routing-workflow.json'));
  require(Object.keys(journal).sort().join(',') ===
    'bindingSha256,engine,identity,relayPlanSha256,relays,schemaVersion,siteUid,sourcePlanSha256' &&
    journal.schemaVersion === 2 &&
    journal.engine === source.engine &&
    journal.sourcePlanSha256 === source.planSha256 &&
    journal.relayPlanSha256 === plan.planSha256, 'checkpoint owner or shape differs');
  const entries = object(journal.relays);
  require(Object.keys(entries).join(',') ===
    plan.relays.map((relay) => relay.name).join(','), 'complete ordered configured relay checkpoint required');
  const initial = await observe();
  const revalidate = async () => {
    await storage.verify();
    const current = await observe();
    require(current.siteUid === journal.siteUid &&
      current.bindingSha256 === journal.bindingSha256, 'current cloud/CE/site binding differs from configuration');
    return current;
  };
  await revalidate();
  const guestIdentity = new Map<string, Json>();
  const usedNonces = new Set<string>();
  for (const relay of plan.relays) {
    const entry = object(entries[relay.name]);
    require(Object.keys(entry).sort().join(',') === 'nonce,receipt,requestSha256,submitted' &&
      entry.submitted === true &&
      typeof entry.nonce === 'string' &&
      /^[a-f0-9]{32}$/.test(entry.nonce) &&
      !usedNonces.has(entry.nonce), 'complete distinct guest submission checkpoint required');
    usedNonces.add(entry.nonce as string);
    const activation = compileAzureRelayGuestActivation(
      source,
      plan,
      relay.name,
      initial.server,
      initial.endpoints,
      entry.nonce as string,
    );
    const observation = compileAzureRelayGuestObservation(activation);
    require(entry.requestSha256 === activation.requestSha256, 'saved guest request differs');
    const receipt = object(entry.receipt);
    require(Object.keys(receipt).sort().join(',') ===
      [
        ...Object.keys(activation.expected),
        'status',
        'imageId',
        'interfaceName',
        'containerId',
        'requestSha256',
        'observedAt',
        'routing',
        'traffic',
        'ceSampleFreshnessQualified',
      ]
        .sort()
        .join(','), 'saved guest receipt shape differs');
    for (const [key, value] of Object.entries(activation.expected))
      require(receipt[key] === value, 'saved guest receipt binding differs');
    require(receipt.status === 'configured' &&
      [activation.requestSha256, observation.requestSha256].includes(receipt.requestSha256 as string) &&
      typeof receipt.imageId === 'string' &&
      /^sha256:[a-f0-9]{64}$/.test(receipt.imageId) &&
      typeof receipt.containerId === 'string' &&
      /^[a-f0-9]{64}$/.test(receipt.containerId) &&
      typeof receipt.interfaceName === 'string' &&
      /^[a-zA-Z0-9_.:-]{1,32}$/.test(receipt.interfaceName), 'saved guest configuration identity unavailable');
    guestIdentity.set(relay.name, receipt);
  }
  const sessionsExpected = initial.slo.flatMap((row) =>
    plan.relays.map((relay) => ({
      node: row.node,
      interfaceName: row.interfaceName,
      peerAddress: relay.privateAddress,
    })),
  );
  const sessions = await bounded(() => runtime.observeBgpSessions(binding, sessionsExpected, deadline));
  require(sessions.status === 'healthy', 'complete Established CE-to-relay sessions required');
  await revalidate();
  const ceRoutes = await bounded(() => {
    if (!outage) return runtime.observeBgpRoutes(binding, deadline);
    if (!runtime.observeBgpRoutesForNodes) throw Error('Azure relay observation: surviving route observer unavailable');
    return runtime.observeBgpRoutesForNodes(
      binding,
      initial.slo.map((row) => row.node),
      deadline,
    );
  });
  require(ceRoutes.status === 'observed', 'complete current CE route inventory required');
  await revalidate();
  const guestRoutes: Array<ReturnType<typeof parseAzureRelayGuestRoute>> = [];
  const guestFib: Array<ReturnType<typeof parseAzureRelayGuestFib>> = [];
  for (const relay of plan.relays) {
    const tasks = [
      ...plan.vipPrefixes.map((prefix) => ({
        direction: 'received' as const,
        prefix,
        peer: undefined as string | undefined,
      })),
      ...plan.returnPrefixes.map((prefix) => ({
        direction: 'received' as const,
        prefix,
        peer: undefined as string | undefined,
      })),
      ...plan.vipPrefixes.flatMap((prefix) =>
        initial.server.serviceAddresses.map((peer) => ({ direction: 'advertised' as const, prefix, peer })),
      ),
      ...plan.returnPrefixes.flatMap((prefix) =>
        initial.endpoints
          .filter((row) => row.node !== outage?.nodeIndex)
          .map(({ address: peer }) => ({ direction: 'advertised' as const, prefix, peer })),
      ),
    ];
    require(tasks.length > 0, 'planned route membership scope required');
    for (const task of tasks) {
      const current = await revalidate();
      const compile = task.direction === 'received' ? compileAzureRelayGuestFib : compileAzureRelayGuestRoute;
      const request = compile(
        source,
        plan,
        relay.name,
        current.server,
        current.endpoints,
        randomBytes(16).toString('hex'),
        task.direction,
        task.prefix,
        task.peer,
        outage,
      );
      const raw = await bounded(() => api.exec('az', request.args, { signal: deadline }));
      require(raw.exitCode === 0, 'guest route observation unavailable');
      const response = JSON.parse(raw.stdout);
      const evidence =
        'fibBinding' in request
          ? (() => {
              const fib = parseAzureRelayGuestFib(request, response);
              guestFib.push(fib);
              return fib.membership;
            })()
          : parseAzureRelayGuestRoute(request, response);
      const prior = guestIdentity.get(relay.name);
      for (const key of ['containerId', 'imageId', 'interfaceName'])
        require(object(evidence.session.guest)[key] ===
          prior?.[key], 'guest runtime changed since owned configuration');
      guestRoutes.push(evidence);
      await revalidate();
    }
  }
  const cloudRoutes = await bounded(() => observeAzureRelayRouteExchange(source, plan, api, deadline));
  await revalidate();
  const finalSessions = await bounded(() => runtime.observeBgpSessions(binding, sessionsExpected, deadline));
  require(finalSessions.status === 'healthy', 'CE-to-relay sessions changed during collection');
  await revalidate();
  deadline.throwIfAborted();
  return {
    ...(initial.outage ? { outage: initial.outage } : {}),
    status: 'observed' as const,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    siteUid: initial.siteUid,
    bindingSha256: initial.bindingSha256,
    sessions,
    finalSessions,
    ceRoutes,
    guestRoutes,
    guestFib,
    cloudRoutes,
    collectedAt: new Date().toISOString(),
    ceRouteScope: 'unqualified' as const,
    routing: 'unknown' as const,
    fib: 'unknown' as const,
    traffic: 'unknown' as const,
    freshness: 'unqualified' as const,
    ceSampleFreshnessQualified: false as const,
  };
}
