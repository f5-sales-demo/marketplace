import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { assertAzureCeRoutingExecutable } from './apply';
import { verifyAzureCePlan } from './artifacts';
import { revalidateAzureAuxiliaryCatalogs } from './auxiliary-catalog';
import { canonicalSha256 } from './canonical';
import { configureAzureSelectedRelayRouting, requireAzureCeRoutingContract } from './relay-routing-dispatch';
import { configureAzureRouteServerRouting } from './routing-workflow';
import { azureTerraformFoundationDeployment, renderAzureTerraformFoundation } from './terraform-foundation';
import { discoverAzureTerraformInterfaces } from './terraform-identities';
import {
  publishAzureTerraformOriginalReceipt,
  readAzureTerraformOriginalReceiptInventory,
  recoverAzureTerraformOriginalReceiptPublications,
} from './terraform-original-receipt-inventory';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
interface WorkflowCheckpoint {
  schemaVersion: 1;
  engine: 'terraform';
  planSha256: string;
  configurationSha256: string;
  bootstrapByNode: Record<string, string>;
  launchedAtByNode: Record<string, string>;
  stage: 'network-pending' | 'registration-pending' | 'registered';
  originalReceiptInventorySha256?: string;
  admissionReceiptSha256ByNode?: Record<string, string>;
}

const waitUntil = async (notBefore: number, signal?: AbortSignal) => {
  const remaining = notBefore - Date.now();
  if (remaining <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Azure Terraform HA admission cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, remaining);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
};

/** Execute Azure foundation and admission without caller-provided bootstrap or health claims. */
export async function runAzureTerraformAdmission(
  plan: AzureCePlan,
  terraform: CeTerraformService,
  runtime: Pick<
    CeRuntime,
    | 'engine'
    | 'requireBootstrapContract'
    | 'requireRoutingContract'
    | 'requireAzureRelayRoutingContract'
    | 'ensureAzureRelayRouting'
    | 'observeOwnedSite'
    | 'reserveSite'
    | 'bootstrap'
    | 'approveRegistrations'
    | 'observeRegistrations'
    | 'observeRegisteredConfiguration'
    | 'observeAzureInterfaces'
    | 'ensureAzureRouting'
    | 'observeBgpSessions'
    | 'observeBgpRoutes'
  >,
  storage: Pick<CeDeploymentStore, 'directory' | 'owner' | 'read' | 'write' | 'verify'>,
  api: AzExecApi,
  revalidate: () => Promise<void>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  haSerialDelayMs = 180_000,
  acceptIngress?: (session: TerraformSession) => Promise<{ ingress: unknown; traffic: { status: 'healthy' } }>,
) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || runtime.engine !== 'terraform')
    throw new Error('Azure Terraform workflow requires Terraform ownership');
  assertAzureCeRoutingExecutable(plan);
  runtime.requireBootstrapContract('azure');
  requireAzureCeRoutingContract(plan, runtime);
  const binding = azureUpgradeBinding(plan);
  const initial = renderAzureTerraformFoundation(plan);
  await storage.verify();
  const auxiliaryCatalogs = await revalidateAzureAuxiliaryCatalogs(plan, api, signal);
  if (auxiliaryCatalogs.length)
    await storage.write('azure-auxiliary-catalog-preflight.json', {
      sourcePlanSha256: plan.planSha256,
      catalogs: auxiliaryCatalogs,
      ceSampleFreshnessQualified: false,
    });
  let checkpoint: WorkflowCheckpoint;
  try {
    checkpoint = (await storage.read('terraform-workflow.json')) as WorkflowCheckpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      configurationSha256: hash(initial),
      bootstrapByNode: {},
      launchedAtByNode: {},
      stage: 'network-pending',
      admissionReceiptSha256ByNode: {},
    };
    await storage.write('terraform-workflow.json', checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !/^[a-f0-9]{64}$/.test(checkpoint.configurationSha256) ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
    Object.keys(checkpoint.bootstrapByNode).some(
      (node, index) => !/^[1-3]$/.test(node) || Number(node) > plan.topology.nodeCount || Number(node) !== index + 1,
    ) ||
    !checkpoint.launchedAtByNode ||
    typeof checkpoint.launchedAtByNode !== 'object' ||
    Object.entries(checkpoint.launchedAtByNode).some(
      ([node, launchedAt]) =>
        !/^[1-3]$/.test(node) ||
        Number(node) > plan.topology.nodeCount ||
        !checkpoint.bootstrapByNode[node] ||
        Number.isNaN(Date.parse(launchedAt)),
    ) ||
    !['network-pending', 'registration-pending', 'registered'].includes(checkpoint.stage) ||
    (checkpoint.admissionReceiptSha256ByNode !== undefined &&
      (!checkpoint.admissionReceiptSha256ByNode ||
        typeof checkpoint.admissionReceiptSha256ByNode !== 'object' ||
        Array.isArray(checkpoint.admissionReceiptSha256ByNode) ||
        Object.entries(checkpoint.admissionReceiptSha256ByNode).some(
          ([node, bound], index) =>
            node !== String(index + 1) ||
            Number(node) > plan.topology.nodeCount ||
            typeof bound !== 'string' ||
            !/^[a-f0-9]{64}$/.test(bound) ||
            !checkpoint.launchedAtByNode[node],
        ))) ||
    Object.keys(checkpoint.launchedAtByNode).some((node) => !checkpoint.admissionReceiptSha256ByNode?.[node])
  )
    throw new Error('Azure Terraform workflow checkpoint differs from the owning plan');
  const save = () => storage.write('terraform-workflow.json', checkpoint);
  await recoverAzureTerraformOriginalReceiptPublications(
    plan,
    checkpoint.bootstrapByNode,
    storage,
    signal,
    async () => {
      const open = terraform.open,
        session = await open.call(terraform, binding.owner, await azureTerraformFoundationDeployment(plan), 'current'),
        readConfiguration = session.readConfigurationSha256,
        readJournal = session.readCurrentPlanJournal;
      if (!readConfiguration || !readJournal) throw Error('Native original publication recovery readers unavailable');
      const configurationSha256 = await readConfiguration.call(session),
        journal = await readJournal.call(session, configurationSha256, signal);
      if (
        terraform.open !== open ||
        session.readConfigurationSha256 !== readConfiguration ||
        session.readCurrentPlanJournal !== readJournal
      )
        throw Error('Native original publication recovery dependency changed');
      return journal;
    },
  );
  signal?.throwIfAborted();
  let session: TerraformSession;
  if (checkpoint.stage === 'network-pending') {
    const deployment = await azureTerraformFoundationDeployment(plan);
    try {
      session = await terraform.open(binding.owner, deployment, false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      session = await terraform.open(binding.owner, deployment, 'current');
    }
    const reviseConfiguration = async (configuration: string) => {
      const nextHash = hash(configuration);
      if (checkpoint.configurationSha256 === nextHash) return;
      try {
        await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
        // A prior run may have committed the exact desired revision before checkpointing.
        await session.reviseConfiguration(nextHash, configuration);
      }
      checkpoint.configurationSha256 = nextHash;
      await save();
    };
    // Native saved-plan journals, never launch timestamps or mutable plan names,
    // authorize skipping an already completed original serial admission stage.
    const readHistory = session.readPlanApplicationHistory;
    if (!readHistory) throw Error('Azure Terraform original admission requires native receipt history');
    const completedStages = async () => {
      const inventory = await readAzureTerraformOriginalReceiptInventory(
        plan,
        checkpoint.bootstrapByNode,
        storage,
        signal,
      );
      if (inventory.status === 'partial') throw Error('Azure Terraform original receipt history is partial');
      const completed = new Map<number, string>();
      let foundation = false;
      for (const row of inventory.records) {
        if (session.readPlanApplicationHistory !== readHistory)
          throw Error('Azure Terraform native receipt reader changed');
        const record = structuredClone(row.record),
          history = await readHistory.call(session, record.receipt, signal);
        if (session.readPlanApplicationHistory !== readHistory)
          throw Error('Azure Terraform native receipt reader changed');
        if (
          history.receiptSha256 !== record.receiptSha256 ||
          history.incompleteArchives ||
          !history.matches.length ||
          history.matches.some(
            (match) =>
              match.savedPlanSha256 !== record.receipt.planSha256 ||
              match.configurationSha256 !== record.receipt.configurationSha256 ||
              match.state === 'applying',
          )
        )
          throw Error('Azure Terraform original receipt native history is unavailable or requires reconciliation');
        const done =
          history.matches.some((match) => match.state === 'applied') ||
          (record.receipt.noChanges && history.matches.every((match) => match.state === 'planned'));
        if (done && record.stage.kind === 'foundation' && Object.keys(record.bootstrapSha256ByNode).length === 0)
          foundation = true;
        if (done && record.stage.kind === 'node-admission') {
          const node = record.stage.node,
            prior = completed.get(node),
            bound = checkpoint.admissionReceiptSha256ByNode?.[String(node)];
          if (bound && bound !== record.receiptSha256 && prior !== bound)
            throw Error('Azure Terraform original admission receipt binding differs');
          if (!prior || bound === record.receiptSha256) completed.set(node, record.receiptSha256);
        }
      }
      if (
        canonicalSha256(
          await readAzureTerraformOriginalReceiptInventory(plan, checkpoint.bootstrapByNode, storage, signal),
        ) !== canonicalSha256(inventory)
      )
        throw Error('Azure Terraform original receipts changed during native verification');
      for (const node of completed.keys())
        if (node > 1 && !completed.has(node - 1))
          throw Error('Azure Terraform original admission completion is not serial');
      for (const [node, bound] of Object.entries(checkpoint.admissionReceiptSha256ByNode ?? {}))
        if (completed.get(Number(node)) !== bound)
          throw Error('Azure Terraform original admission receipt binding is unverified');
      return { foundation, completed };
    };
    const progress = await completedStages();
    checkpoint.admissionReceiptSha256ByNode ??= {};
    for (const [node, receiptSha256] of progress.completed) {
      checkpoint.admissionReceiptSha256ByNode[String(node)] = receiptSha256;
      // A recovered applied receipt proves completion; using the current time
      // after a lost checkpoint conservatively preserves the serial delay.
      checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
    }
    await save();
    if (!progress.foundation) {
      if (progress.completed.size) throw Error('Azure Terraform original foundation completion is unavailable');
      await reviseConfiguration(renderAzureTerraformFoundation(plan, {}));
      await revalidate();
      const receipt = await session.plan(env, signal);
      if (
        receipt.changes.some((change) =>
          change.actions.some(
            (action) =>
              !['create', 'read', 'no-op'].includes(action) &&
              !(change.address === 'azapi_resource_action.marketplace_terms' && action === 'update'),
          ),
        )
      )
        throw new Error('Azure Terraform foundation would mutate existing resources');
      await publishAzureTerraformOriginalReceipt(
        { plan, bootstrapByNode: {}, stage: { kind: 'foundation' }, receipt },
        storage,
        signal,
      );
      await storage.write('terraform-foundation-plan.json', receipt);
      await storage.verify();
      await revalidate();
      if (!receipt.noChanges) await session.apply(receipt, env, signal);
      if (!(await completedStages()).foundation)
        throw Error('Azure Terraform original foundation native completion is unavailable');
    }
    await storage.verify();
    await revalidate();
    await runtime.reserveSite(
      binding,
      (record) => storage.write('terraform-site.json', record),
      signal,
      plan.intent.workloadFixture ? [plan.intent.workloadFixture.cidr] : [],
    );
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      signal?.throwIfAborted();
      await storage.verify();
      await revalidate();
      if (progress.completed.has(node)) continue;
      const previous = node - 1;
      if (plan.topology.ha && previous > 0) {
        const launchedAt = checkpoint.launchedAtByNode[String(previous)];
        if (!launchedAt) throw new Error('Prior Azure HA node launch boundary is unavailable');
        await waitUntil(Date.parse(launchedAt) + haSerialDelayMs, signal);
      }
      if (!checkpoint.bootstrapByNode[String(node)]) {
        const nodeName = `${plan.deploymentName}-${node}`;
        const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
        checkpoint.bootstrapByNode[String(node)] = await runtime.bootstrap(
          binding,
          nodeName,
          tokenName,
          (secret) => storage.write(`${tokenName}.json`, secret),
          signal,
        );
        await save();
      }
      const admittedBootstrap = Object.fromEntries(
        Array.from({ length: node }, (_, index) => {
          const current = String(index + 1);
          return [current, checkpoint.bootstrapByNode[current]];
        }),
      );
      const configuration = renderAzureTerraformFoundation(plan, admittedBootstrap);
      const nextHash = hash(configuration);
      if (checkpoint.configurationSha256 !== nextHash) {
        try {
          await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
          // A prior run may have committed the exact desired revision before checkpointing.
          await session.reviseConfiguration(nextHash, configuration);
        }
        checkpoint.configurationSha256 = nextHash;
        await save();
      }
      const admission = await session.plan(env, signal);
      if (
        admission.changes.some((change) =>
          change.actions.some(
            (action) =>
              !['create', 'read', 'no-op'].includes(action) &&
              !(change.address === 'azapi_resource_action.marketplace_terms' && action === 'update'),
          ),
        )
      )
        throw new Error('Azure Terraform admission would alter or replace an existing resource');
      await publishAzureTerraformOriginalReceipt(
        { plan, bootstrapByNode: admittedBootstrap, stage: { kind: 'node-admission', node }, receipt: admission },
        storage,
        signal,
      );
      await storage.write(`terraform-admission-plan-node-${node}.json`, admission);
      await storage.verify();
      await revalidate();
      if (!admission.noChanges) await session.apply(admission, env, signal);
      const completed = (await completedStages()).completed.get(node);
      if (completed !== canonicalSha256(admission))
        throw Error('Azure Terraform original admission native completion is unavailable');
      checkpoint.admissionReceiptSha256ByNode[String(node)] = completed;
      checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
      await save();
    }
    checkpoint.stage = 'registration-pending';
    await save();
  } else {
    session = await terraform.open(
      binding.owner,
      await azureTerraformFoundationDeployment(plan, checkpoint.bootstrapByNode),
      'current',
    );
  }
  await revalidate();
  const outputs = await session.readOutputs(['ce_interfaces', 'ce_instances'], env, signal);
  const discovered = await discoverAzureTerraformInterfaces(plan, outputs, api, signal);
  const instances = outputs.ce_instances as Record<string, { vm_id?: string }>;
  const expectedInstances = Object.fromEntries(
    binding.nodes.map((node, index) => [node, instances[String(index + 1)]?.vm_id]),
  );
  if (Object.values(expectedInstances).some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id ?? '')))
    throw new Error('Azure Terraform admitted VM identities are unavailable');
  const expectedInterfaces = discovered.interfaces
    .filter((item) => item.role === 'slo' || item.role === 'data' || item.role === 'sli')
    .map((item) => ({
      node: `${plan.deploymentName}-${item.node}`,
      role: item.role as 'slo' | 'data' | 'sli',
      mac: item.mac,
    }));
  const registrations = await runtime.approveRegistrations(
    binding,
    expectedInstances as Record<string, string>,
    (record) => storage.write('terraform-registration.json', record),
    signal,
  );
  const configuration = await runtime.observeRegisteredConfiguration(
    binding,
    expectedInstances as Record<string, string>,
    expectedInterfaces,
    signal,
  );
  await storage.write('terraform-registration-configuration.json', configuration);
  const current = await runtime.observeRegistrations(binding, expectedInstances as Record<string, string>, signal);
  await storage.write('terraform-registration-observation.json', current);
  checkpoint.stage =
    configuration.status === 'configured' && current.status === 'healthy' ? 'registered' : 'registration-pending';
  await save();
  let routing: 'healthy' | 'unknown' = 'unknown';
  if (plan.routing.mode === 'route-server' && checkpoint.stage === 'registered') {
    const evidence = plan.relayProfile
      ? await configureAzureSelectedRelayRouting(plan, expectedInterfaces, runtime, storage, api, signal)
      : await configureAzureRouteServerRouting(plan, expectedInterfaces, runtime, storage, api, signal);
    if (
      'observation' in evidence &&
      (evidence.observation.ceRouteScope === 'unqualified' || evidence.observation.freshness === 'unqualified')
    )
      throw Error('Azure relay evidence was collected; CE route scope and publication freshness remain unqualified');
    if (evidence.status !== 'healthy') throw new Error('Azure Route Server BGP and learned routes have not converged');
    routing = 'healthy';
  }
  let traffic: 'unknown' | { status: 'healthy' } = 'unknown';
  let terraformNoChanges: true | undefined;
  if (
    plan.intent.ingress?.mode === 'platform-http' &&
    checkpoint.stage === 'registered' &&
    (plan.routing.mode !== 'route-server' || routing === 'healthy')
  ) {
    if (!acceptIngress) throw new Error('Azure Terraform ingress acceptance driver is unavailable');
    traffic = (await acceptIngress(session)).traffic;
    const refresh = await session.plan(env, signal);
    await publishAzureTerraformOriginalReceipt(
      { plan, bootstrapByNode: checkpoint.bootstrapByNode, stage: { kind: 'ingress-final' }, receipt: refresh },
      storage,
      signal,
    );
    if (!refresh.noChanges) throw new Error('Terraform changed after Azure platform ingress convergence');
    terraformNoChanges = true;
  }
  const originalReceiptInventory = await readAzureTerraformOriginalReceiptInventory(
    plan,
    checkpoint.bootstrapByNode,
    storage,
    signal,
  );
  const originalRecords = originalReceiptInventory.records.map((row) => row.record);
  if (
    originalReceiptInventory.status !== 'complete' ||
    !originalRecords.some(
      (row) => row.stage.kind === 'foundation' && Object.keys(row.bootstrapSha256ByNode).length === 0,
    ) ||
    Array.from({ length: plan.topology.nodeCount }, (_, index) => index + 1).some(
      (node) => !originalRecords.some((row) => row.stage.kind === 'node-admission' && row.stage.node === node),
    ) ||
    (terraformNoChanges && !originalRecords.some((row) => row.stage.kind === 'ingress-final'))
  )
    throw Error('Azure Terraform original deployment receipt inventory is incomplete');
  const receiptInventorySha256 = canonicalSha256(originalReceiptInventory);
  checkpoint.originalReceiptInventorySha256 = receiptInventorySha256;
  await save();
  const finalReceiptInventory = await readAzureTerraformOriginalReceiptInventory(
    plan,
    checkpoint.bootstrapByNode,
    storage,
    signal,
  );
  if (
    canonicalSha256(finalReceiptInventory) !== receiptInventorySha256 ||
    checkpoint.originalReceiptInventorySha256 !== receiptInventorySha256
  )
    throw Error('Azure Terraform original receipt inventory changed during completion publication');
  return {
    originalReceiptInventorySha256: checkpoint.originalReceiptInventorySha256,
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: 'terraform' as const,
    status:
      checkpoint.stage !== 'registered'
        ? ('pending-registration' as const)
        : plan.intent.ingress?.mode === 'platform-http'
          ? ('accepted' as const)
          : ('registered' as const),
    registrations: current.status === 'healthy' ? current : registrations,
    configuration,
    routing,
    traffic,
    ...(terraformNoChanges ? { terraformNoChanges } : {}),
  };
}
