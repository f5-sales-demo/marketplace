import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { observeAzureIngressInterface } from './ingress-interface-identity';
import { persistAzureIngressSource, validateAzureIngressSource } from './ingress-source';
import { azureUpgradeBinding } from './terraform-upgrade';
import { observeAzureTrafficSource } from './traffic-source';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
interface Marker {
  schemaVersion: 2;
  sourcePlanSha256: string;
  sourceArtifactSha256: string;
  engine: 'native' | 'terraform';
  configurationSha256: string;
  ingressPlanId: string;
  contractFingerprint: string;
}

function object(value: unknown, message: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Json;
}

async function optional(storage: Pick<CeDeploymentStore, 'read'>, name: string): Promise<unknown> {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Create or resume the exact platform listener after Azure registration and SLI discovery. */
export async function ensureAzurePlatformIngress(
  plan: AzureCePlan,
  runtime: CeRuntime,
  storage: CeDeploymentStore,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  verifyAzureCePlan(plan);
  if (plan.intent.ingress?.mode !== 'platform-http') return undefined;
  await storage.verify();
  const ingress = plan.intent.ingress;
  const source = await observeAzureTrafficSource(plan, api, signal);
  const selected = await observeAzureIngressInterface(plan, api, signal);
  const binding = azureUpgradeBinding(plan);
  const selections = [
    {
      binding,
      node: selected.node,
      mac: selected.mac,
      insideAddress: ingress.listener.privateAddress,
    },
  ];
  const intent = { ...ingress.listener, port: ingress.port, originAddress: source.privateAddress };
  const configurationSha256 = canonicalSha256({ owner: binding.owner, intent });
  const journal = await persistAzureIngressSource(
    plan,
    source.identity,
    selected.identity,
    contract.fingerprint,
    storage,
    signal,
  );
  const provenance = {
    schemaVersion: 1 as const,
    kind: 'azure-ce-source' as const,
    sourcePlanSha256: plan.planSha256,
    sourceArtifactSha256: canonicalSha256(journal),
  };
  const lifecycle = runtime.ingress(contract, storage);
  const saved = await optional(storage, 'azure-platform-ingress.json');
  let marker: Marker;
  if (saved !== undefined) {
    const candidate = object(saved, 'Malformed Azure platform ingress checkpoint') as unknown as Marker;
    if (
      Object.keys(candidate).sort().join(',') !==
        [
          'schemaVersion',
          'engine',
          'sourcePlanSha256',
          'sourceArtifactSha256',
          'configurationSha256',
          'ingressPlanId',
          'contractFingerprint',
        ]
          .sort()
          .join(',') ||
      candidate.schemaVersion !== 2 ||
      !/^[a-f0-9]{64}$/.test(candidate.sourcePlanSha256) ||
      !/^[a-f0-9]{64}$/.test(candidate.sourceArtifactSha256) ||
      candidate.engine !== plan.engine ||
      candidate.configurationSha256 !== configurationSha256 ||
      candidate.contractFingerprint !== contract.fingerprint ||
      !/^[a-f0-9]{24}$/.test(candidate.ingressPlanId)
    )
      throw new Error('Platform ingress checkpoint differs from the owning Azure configuration');
    const prior = await storage.read(`azure-ingress-source-${candidate.sourcePlanSha256}.json`);
    const priorSource = validateAzureIngressSource(prior, binding.owner, contract.fingerprint);
    if (
      candidate.sourceArtifactSha256 !== canonicalSha256(prior) ||
      priorSource.configurationSha256 !== configurationSha256 ||
      priorSource.plan.planSha256 !== candidate.sourcePlanSha256
    )
      throw new Error('Platform ingress checkpoint source provenance differs');
    marker = candidate;
    if (!(await lifecycle.matchesAzure(marker.ingressPlanId, intent, selections, signal))) {
      if (!['replace-node', 'update-network'].includes(plan.intent.operation))
        throw new Error('Azure platform ingress identities changed outside an approved replacement operation');
      await lifecycle.retire(marker.ingressPlanId, signal);
      const replacement = await lifecycle.planAzure(intent, selections, signal, provenance);
      marker = {
        ...marker,
        ingressPlanId: replacement.id,
        sourcePlanSha256: plan.planSha256,
        sourceArtifactSha256: canonicalSha256(journal),
      };
      await storage.write('azure-platform-ingress.json', marker);
    }
  } else {
    const ingressPlan = await lifecycle.planAzure(intent, selections, signal, provenance);
    marker = {
      schemaVersion: 2,
      sourcePlanSha256: plan.planSha256,
      sourceArtifactSha256: canonicalSha256(journal),
      engine: plan.engine,
      configurationSha256,
      ingressPlanId: ingressPlan.id,
      contractFingerprint: contract.fingerprint,
    };
    await storage.write('azure-platform-ingress.json', marker);
  }
  const receipt = await lifecycle.apply(marker.ingressPlanId, signal);
  return {
    ingressPlanId: marker.ingressPlanId,
    contractFingerprint: marker.contractFingerprint,
    uid: receipt.uid,
    listener: receipt.listener,
    routes: receipt.routes,
    traffic: receipt.traffic,
    observedAt: receipt.observedAt,
  };
}
