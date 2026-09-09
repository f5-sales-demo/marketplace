import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { type AwsExecApi, detectAwsError } from '../aws/exec';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

interface Marker {
  schemaVersion: 2;
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

async function originAddress(plan: AwsCePlan, api: AwsExecApi, signal?: AbortSignal): Promise<string> {
  if (plan.intent.ingress?.mode !== 'nlb') throw new Error('AWS origin discovery requires NLB ingress');
  const source = plan.intent.ingress.probe.sourceInstanceId;
  const result = await api.exec(
    'aws',
    ['ec2', 'describe-instances', '--instance-ids', source, '--region', plan.region, '--output', 'json'],
    { signal },
  );
  if (result.exitCode !== 0) throw detectAwsError(result.stderr, result.exitCode);
  const response = JSON.parse(result.stdout) as Record<string, unknown>;
  const reservations = Array.isArray(response.Reservations) ? response.Reservations : [];
  const instances = reservations.flatMap((reservation) => {
    if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation)) return [];
    const rows = (reservation as Record<string, unknown>).Instances;
    return Array.isArray(rows) ? rows : [];
  });
  const instance = instances[0] as Record<string, unknown> | undefined;
  const address = instance?.PrivateIpAddress;
  const state = instance?.State as Record<string, unknown> | undefined;
  if (
    instances.length !== 1 ||
    instance?.InstanceId !== source ||
    state?.Name !== 'running' ||
    typeof address !== 'string' ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) ||
    address.split('.').some((octet) => Number(octet) > 255)
  )
    throw new Error('Fresh AWS origin address evidence is unavailable');
  return address;
}

/** Create or resume the exact platform listener after registration and SLI discovery. */
export async function ensureAwsPlatformIngress(
  plan: AwsCePlan,
  runtime: CeRuntime,
  storage: CeDeploymentStore,
  contract: VerifiedIngressContract,
  resolved: Record<string, string>,
  api: AwsExecApi,
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
    const candidate = saved as Marker & { schemaVersion: number };
    if (
      ![1, 2].includes(candidate.schemaVersion) ||
      candidate.engine !== plan.engine ||
      candidate.planSha256 !== plan.planSha256 ||
      candidate.contractFingerprint !== contract.fingerprint ||
      !/^[a-f0-9]{24}$/.test(candidate.ingressPlanId)
    )
      throw new Error('Platform ingress checkpoint differs from the owning AWS plan');
    if (candidate.schemaVersion === 1) {
      await lifecycle.retire(candidate.ingressPlanId, signal);
      const listener = plan.intent.ingress.listener;
      const corrected = await lifecycle.planAws(
        { ...listener, port: plan.intent.ingress.port, originAddress: await originAddress(plan, api, signal) },
        selections,
        signal,
      );
      marker = {
        schemaVersion: 2,
        engine: plan.engine,
        planSha256: plan.planSha256,
        ingressPlanId: corrected.id,
        contractFingerprint: contract.fingerprint,
      };
      await storage.write('aws-platform-ingress.json', marker);
    } else marker = candidate;
  } else {
    const listener = plan.intent.ingress.listener;
    const ingressPlan = await lifecycle.planAws(
      { ...listener, port: plan.intent.ingress.port, originAddress: await originAddress(plan, api, signal) },
      selections,
      signal,
    );
    marker = {
      schemaVersion: 2,
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
