import { randomBytes } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { azureRelayCurrentIdentityContext } from './relay-current-identity';
import {
  compileAzureRelayGuestActivation,
  compileAzureRelayGuestObservation,
  parseAzureRelayGuestReceipt,
} from './relay-guest';
import type { AzureCePlan } from './types';

type Runtime = Pick<CeRuntime, 'engine' | 'observeOwnedSite' | 'observeAzureInterfaces' | 'ensureAzureRelayRouting'>;
type Storage = Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>;
interface Journal {
  schemaVersion: 2;
  identity: Awaited<ReturnType<Awaited<ReturnType<typeof azureRelayCurrentIdentityContext>>['observe']>>['identity'];
  engine: 'native' | 'terraform';
  sourcePlanSha256: string;
  relayPlanSha256: string;
  siteUid: string;
  bindingSha256: string;
  relays: Record<
    string,
    { nonce: string; requestSha256: string; submitted: true; receipt?: ReturnType<typeof parseAzureRelayGuestReceipt> }
  >;
}
const name = 'relay-routing-workflow.json';
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay workflow: ${message}`);
};
/** Current authoritative CE/cloud/guest configuration only; no session, traffic or CE heartbeat claim. */
export async function ensureAzureRelayRoutingWorkflow(
  source: AzureCePlan,
  expected: ExpectedCeInterface[],
  runtime: Runtime,
  storage: Storage,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  const context = await azureRelayCurrentIdentityContext(source, expected, runtime, storage, api, signal);
  ({ source, expected } = context);
  const { plan, binding, deadline, bounded, observe } = context;
  let journal: Journal | undefined;
  try {
    journal = (await storage.read(name)) as Journal;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (journal)
    require(Object.keys(journal).sort().join(',') ===
      'bindingSha256,engine,identity,relayPlanSha256,relays,schemaVersion,siteUid,sourcePlanSha256' &&
      journal.schemaVersion === 2 &&
      journal.engine === source.engine &&
      journal.sourcePlanSha256 === source.planSha256 &&
      journal.relayPlanSha256 === plan.planSha256 &&
      typeof journal.siteUid === 'string' &&
      /^[a-f0-9]{64}$/.test(journal.bindingSha256) &&
      journal.relays &&
      typeof journal.relays === 'object' &&
      !Array.isArray(journal.relays), 'checkpoint owner or shape differs');
  const initial = await observe();
  if (journal)
    require(journal.siteUid === initial.siteUid &&
      journal.bindingSha256 === initial.bindingSha256 &&
      canonicalSha256(journal.identity.stable) === initial.bindingSha256 &&
      Object.keys(journal.relays).every((relay) =>
        plan.relays.some((item) => item.name === relay),
      ), 'checkpoint site or current cloud/CE binding differs');
  else {
    journal = {
      schemaVersion: 2,
      identity: structuredClone(initial.identity),
      engine: source.engine,
      sourcePlanSha256: source.planSha256,
      relayPlanSha256: plan.planSha256,
      siteUid: initial.siteUid,
      bindingSha256: initial.bindingSha256,
      relays: {},
    };
    await storage.write(name, journal);
  }
  for (const [index, relayName] of Object.keys(journal.relays).entries()) {
    require(relayName === plan.relays[index]?.name, 'checkpoint relay submission order differs');
    const entry = journal.relays[relayName];
    require(entry &&
      Object.keys(entry).sort().join(',') ===
        ['nonce', 'requestSha256', 'submitted', ...(entry.receipt ? ['receipt'] : [])].sort().join(',') &&
      entry.submitted === true &&
      /^[a-f0-9]{32}$/.test(entry.nonce), 'checkpoint guest submission differs');
    const request = compileAzureRelayGuestActivation(
      source,
      plan,
      relayName,
      initial.server,
      initial.endpoints,
      entry.nonce,
    );
    require(entry.requestSha256 === request.requestSha256, 'checkpoint guest request differs');
  }
  require(new Set(Object.values(journal.relays).map((entry) => entry.nonce)).size ===
    Object.keys(journal.relays).length, 'checkpoint guest nonces are duplicated');
  const revalidate = async () => {
    await storage.verify();
    const current = await observe();
    require(current.siteUid === journal?.siteUid &&
      current.bindingSha256 === journal.bindingSha256, 'current cloud/CE/site binding changed');
    return current;
  };
  await revalidate();
  await bounded(() =>
    runtime.ensureAzureRelayRouting(
      binding,
      plan.localAsn,
      initial.slo.map((row) => ({ node: row.node, role: 'slo' as const, interfaceName: row.interfaceName })),
      plan.relays.map((relay) => ({ name: relay.name, address: relay.privateAddress, asn: relay.asn })),
      (record) => storage.write('platform-relay-routing.json', record),
      deadline,
    ),
  );
  for (const relay of plan.relays) {
    const current = await revalidate();
    let entry = journal.relays[relay.name];
    if (entry)
      require(entry.submitted === true &&
        /^[a-f0-9]{32}$/.test(entry.nonce) &&
        /^[a-f0-9]{64}$/.test(entry.requestSha256), 'checkpoint guest submission differs');
    const nonce = entry?.nonce ?? randomBytes(16).toString('hex');
    const activation = compileAzureRelayGuestActivation(
      source,
      plan,
      relay.name,
      current.server,
      current.endpoints,
      nonce,
    );
    if (entry) require(entry.requestSha256 === activation.requestSha256, 'checkpoint guest request differs');
    const request = entry ? compileAzureRelayGuestObservation(activation) : activation;
    if (!entry) {
      entry = { nonce, requestSha256: activation.requestSha256, submitted: true };
      journal.relays[relay.name] = entry;
      await storage.write(name, journal);
    }
    const raw = await bounded(() => api.exec('az', request.args, { signal: deadline }));
    require(raw.exitCode === 0, 'guest command outcome unavailable');
    const receipt = parseAzureRelayGuestReceipt(request, JSON.parse(raw.stdout));
    await revalidate();
    entry.receipt = receipt;
    await storage.write(name, journal);
  }
  // Re-probe every guest before returning; earlier receipts are not current final runtime evidence.
  for (const relay of plan.relays) {
    const current = await revalidate();
    const entry = journal.relays[relay.name];
    const activation = compileAzureRelayGuestActivation(
      source,
      plan,
      relay.name,
      current.server,
      current.endpoints,
      entry.nonce,
    );
    require(entry.requestSha256 === activation.requestSha256, 'final guest request binding differs');
    const request = compileAzureRelayGuestObservation(activation);
    const raw = await bounded(() => api.exec('az', request.args, { signal: deadline }));
    require(raw.exitCode === 0, 'final guest observation unavailable');
    entry.receipt = parseAzureRelayGuestReceipt(request, JSON.parse(raw.stdout));
    await revalidate();
    await storage.write(name, journal);
  }
  await revalidate();
  deadline.throwIfAborted();
  return {
    status: 'configured' as const,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    siteUid: journal.siteUid,
    bindingSha256: journal.bindingSha256,
    guestReceipts: plan.relays.map((relay) => journal?.relays[relay.name].receipt),
    observedAt: new Date().toISOString(),
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
    ceSampleFreshnessQualified: false as const,
  };
}
