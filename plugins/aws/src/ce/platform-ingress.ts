import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

interface Marker {
  schemaVersion: 1;
  engine: 'native' | 'terraform';
  planSha256: string;
  ingressPlanId: string;
  contractFingerprint: string;
}

async function optional(storage: Pick<CeDeploymentStore, 'read'>, name: string): Promise<unknown> {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Create or resume the exact platform listener after registration and SLI discovery. */
export async function ensureAwsPlatformIngress(
  plan: AwsCePlan,
  runtime: CeRuntime,
  storage: CeDeploymentStore,
  contract: VerifiedIngressContract,
  resolved: Record<string, string>,
  signal?: AbortSignal,
) {
  if (plan.intent.ingress?.mode !== 'nlb') return undefined;
  await storage.verify();
  const sli = plan.interfaces.find((item) => item.role === 'sli');
  if (!sli) throw new Error('AWS NLB ingress requires an SLI interface');
  const selections = siteBindings(plan).map(({ site, binding }) => {
    if (site.nodeIndexes.length !== 1) throw new Error('AWS NLB ingress requires independent one-node sites');
    const nodeIndex = site.nodeIndexes[0];
    const mac = resolved[`__ENI_${nodeIndex}_${sli.index}_MAC__`];
    if (!mac) throw new Error('Observed SLI MAC identity is unavailable for platform ingress');
    return { binding, node: `${plan.deploymentName}-${nodeIndex}`, mac };
  });
  const lifecycle = runtime.ingress(contract, storage);
  const saved = await optional(storage, 'aws-platform-ingress.json');
  let marker: Marker;
  if (saved !== undefined) {
    marker = saved as Marker;
    if (
      marker.schemaVersion !== 1 ||
      marker.engine !== plan.engine ||
      marker.planSha256 !== plan.planSha256 ||
      marker.contractFingerprint !== contract.fingerprint ||
      !/^[a-f0-9]{24}$/.test(marker.ingressPlanId)
    )
      throw new Error('Platform ingress checkpoint differs from the owning AWS plan');
  } else {
    const listener = plan.intent.ingress.listener;
    const ingressPlan = await lifecycle.planAws({ ...listener, port: plan.intent.ingress.port }, selections, signal);
    marker = {
      schemaVersion: 1,
      engine: plan.engine,
      planSha256: plan.planSha256,
      ingressPlanId: ingressPlan.id,
      contractFingerprint: contract.fingerprint,
    };
    await storage.write('aws-platform-ingress.json', marker);
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
