import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../../platform/src/ce/runtime';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { validateAzureIngressInterfaceIdentity } from './ingress-interface-identity';
import { azureUpgradeBinding } from './terraform-upgrade';
import { validateAzureTrafficSourceIdentity } from './traffic-source';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
/** Saved before platform planning, so a response-loss orphan plan can still be qualified offline. */
export function validateAzureIngressSource(value: unknown, owner: CeOwner, contractFingerprint: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure ingress source');
  const record = value as Json;
  const expected = [
    'schemaVersion',
    'engine',
    'owner',
    'sourcePlanSha256',
    'plan',
    'sourceIdentity',
    'selectedIdentity',
    'contractFingerprint',
    'configurationSha256',
    'observedAt',
  ];
  if (Object.keys(record).sort().join(',') !== expected.sort().join(','))
    throw new Error('Azure ingress source fields differ');
  const plan = record.plan as AzureCePlan;
  verifyAzureCePlan(plan);
  if (
    record.schemaVersion !== 1 ||
    record.engine !== owner.engine ||
    record.engine !== plan.engine ||
    !same(record.owner, owner) ||
    !same(azureUpgradeBinding(plan).owner, owner) ||
    record.sourcePlanSha256 !== plan.planSha256 ||
    record.contractFingerprint !== contractFingerprint ||
    plan.intent.ingress?.mode !== 'platform-http' ||
    typeof record.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.observedAt)) ||
    Date.parse(record.observedAt) > Date.now()
  )
    throw new Error('Azure ingress source owner, plan or provenance differs');
  const source = validateAzureTrafficSourceIdentity(plan, record.sourceIdentity);
  const selected = validateAzureIngressInterfaceIdentity(plan, record.selectedIdentity);
  const binding = azureUpgradeBinding(plan);
  const intent = {
    ...plan.intent.ingress.listener,
    port: plan.intent.ingress.port,
    originAddress: source.privateAddress,
  };
  const selections = [
    { binding, node: selected.node, mac: selected.mac, insideAddress: plan.intent.ingress.listener.privateAddress },
  ];
  const configurationSha256 = canonicalSha256({ owner, intent });
  if (record.configurationSha256 !== configurationSha256) throw new Error('Azure ingress source configuration differs');
  return { record, plan, source, selected, intent, selections, configurationSha256 };
}
export async function persistAzureIngressSource(
  plan: AzureCePlan,
  sourceIdentity: unknown,
  selectedIdentity: unknown,
  contractFingerprint: string,
  store: CeDeploymentStore,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  await store.verify();
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure ingress source requires platform HTTP intent');
  const owner = azureUpgradeBinding(plan).owner;
  if (!same(store.owner, owner)) throw new Error('Azure ingress source store owner differs');
  const source = validateAzureTrafficSourceIdentity(plan, sourceIdentity);
  const draft = {
    schemaVersion: 1,
    engine: plan.engine,
    owner,
    sourcePlanSha256: plan.planSha256,
    plan,
    sourceIdentity,
    selectedIdentity,
    contractFingerprint,
    configurationSha256: canonicalSha256({
      owner,
      intent: { ...plan.intent.ingress.listener, port: plan.intent.ingress.port, originAddress: source.privateAddress },
    }),
  };
  const next = { ...draft, observedAt: new Date().toISOString() };
  validateAzureIngressSource(next, owner, contractFingerprint);
  const name = `azure-ingress-source-${plan.planSha256}.json`;
  let saved: unknown;
  try {
    saved = await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (saved !== undefined) {
    const checked = validateAzureIngressSource(saved, owner, contractFingerprint);
    const { observedAt: _time, ...prior } = checked.record;
    if (!same(prior, draft)) throw new Error('Azure ingress source attachment changed for the same plan');
    return checked.record;
  }
  signal?.throwIfAborted();
  await store.write(name, next);
  signal?.throwIfAborted();
  return next;
}
