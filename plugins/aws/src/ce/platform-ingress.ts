import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeIngressPlan } from '../../../platform/src/ce/ingress-lifecycle';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { type AwsExecApi, detectAwsError } from '../aws/exec';
import { awsCeInterfacePrivateAddresses } from './planner';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

interface Marker {
  schemaVersion: 8;
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
  const ingress = plan.intent.ingress;
  await storage.verify();
  const sli = plan.interfaces.find((item) => item.role === 'sli');
  if (!sli) throw new Error('AWS NLB ingress requires an SLI interface');
  const primary = ingress.listener.usePrimaryInterfaceAddress === true;
  const selections = siteBindings(plan).flatMap(({ site, binding }, siteIndex) => {
    if (!primary && site.nodeIndexes.length !== 1)
      throw new Error('AWS NLB ingress requires independent one-node sites');
    return site.nodeIndexes.map((nodeIndex) => {
      const mac = resolved[`__ENI_${nodeIndex}_${sli.index}_MAC__`];
      if (!mac) throw new Error('Observed SLI MAC identity is unavailable for platform ingress');
      if (
        primary &&
        (!/^eni-[0-9a-f]{8,17}$/.test(resolved[`__ENI_${nodeIndex}_${sli.index}__`] ?? '') ||
          !sli.guestDevice ||
          resolved[`__NODE_${nodeIndex}_SLI_IP__`] !==
            awsCeInterfacePrivateAddresses(plan.intent, nodeIndex, sli.index)[0])
      )
        throw new Error('Primary SLI cloud address, ENI or device binding is unavailable');
      return {
        binding,
        node: `${plan.deploymentName}-${nodeIndex}`,
        mac,
        ...(primary ? {} : { insideAddress: ingress.listener.privateAddresses?.[siteIndex] }),
      };
    });
  });
  if (
    primary &&
    (new Set(selections.map((row) => row.mac.toLowerCase())).size !== selections.length ||
      new Set(
        siteBindings(plan).flatMap(({ site }) =>
          site.nodeIndexes.map((node) => resolved[`__ENI_${node}_${sli.index}__`]),
        ),
      ).size !== selections.length)
  )
    throw new Error('Primary SLI MAC or ENI bindings are duplicated');
  async function verifyPrimaryPlacement(id: string) {
    if (!primary) return;
    const savedPlan = (await storage.read(`ingress-plan-${id}.json`)) as CeIngressPlan;
    const placements = savedPlan?.material?.placements;
    if (
      savedPlan?.material?.intent?.usePrimaryInterfaceAddress !== true ||
      !Array.isArray(placements) ||
      placements.length !== selections.length
    )
      throw new Error('Primary SLI platform placement is incomplete');
    for (const selected of selections) {
      const nodeIndex = selected.binding.nodes.indexOf(selected.node);
      const node = siteBindings(plan).find((row) => row.binding.siteName === selected.binding.siteName)?.site
        .nodeIndexes[nodeIndex];
      const matches = placements.filter((row) => row.interface?.node === selected.node);
      if (
        matches.length !== 1 ||
        matches[0].siteName !== selected.binding.siteName ||
        matches[0].interface.role !== 'sli' ||
        matches[0].interface.mac !== selected.mac.toLowerCase() ||
        matches[0].interface.device !== sli?.guestDevice ||
        !matches[0].interface.linkUp ||
        matches[0].interface.ipv4?.address !== resolved[`__NODE_${node}_SLI_IP__`] ||
        matches[0].insideAddress !== resolved[`__NODE_${node}_SLI_IP__`]
      )
        throw new Error('Primary SLI CE observation differs from the cloud node, MAC, device or address binding');
    }
  }
  const lifecycle = runtime.ingress(contract, storage);
  const saved = await optional(storage, 'aws-platform-ingress.json');
  let marker: Marker;
  if (saved !== undefined) {
    const candidate = saved as Marker & { schemaVersion: number };
    if (
      ![1, 2, 3, 4, 5, 6, 7, 8].includes(candidate.schemaVersion) ||
      candidate.engine !== plan.engine ||
      candidate.planSha256 !== plan.planSha256 ||
      candidate.contractFingerprint !== contract.fingerprint ||
      !/^[a-f0-9]{24}$/.test(candidate.ingressPlanId)
    )
      throw new Error('Platform ingress checkpoint differs from the owning AWS plan');
    if (candidate.schemaVersion < 8) {
      await lifecycle.retire(candidate.ingressPlanId, signal);
      const listener = ingress.listener;
      const corrected = await lifecycle.planAws(
        { ...listener, port: ingress.port, originAddress: await originAddress(plan, api, signal) },
        selections,
        signal,
      );
      marker = {
        schemaVersion: 8,
        engine: plan.engine,
        planSha256: plan.planSha256,
        ingressPlanId: corrected.id,
        contractFingerprint: contract.fingerprint,
      };
      await storage.write('aws-platform-ingress.json', marker);
    } else marker = candidate;
  } else {
    const listener = ingress.listener;
    const ingressPlan = await lifecycle.planAws(
      { ...listener, port: ingress.port, originAddress: await originAddress(plan, api, signal) },
      selections,
      signal,
    );
    marker = {
      schemaVersion: 8,
      engine: plan.engine,
      planSha256: plan.planSha256,
      ingressPlanId: ingressPlan.id,
      contractFingerprint: contract.fingerprint,
    };
    await storage.write('aws-platform-ingress.json', marker);
  }
  await verifyPrimaryPlacement(marker.ingressPlanId);
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
