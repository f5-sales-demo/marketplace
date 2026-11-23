// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import { loadAwsCheckpoint, loadAwsPlan } from './runtime-2srcqb9f.js';
import { makeExecApi } from './runtime-30f0rzjf.js';
import { awsPlatformService } from './runtime-34m2wbsj.js';
import { readAwsTerraformInstanceBindings, readAwsTerraformWorkflowStatus } from './runtime-d60mesjt.js';
import { collectAwsCeInventory, scopedAwsApi } from './runtime-fex55vat.js';
import {
  awsTerraformFoundationDeployment,
  awsTerraformService,
  collectAwsNetworkHealth,
  readAwsTrafficProbeEvidence,
} from './runtime-g9xhhtaz.js';
import { siteBindings, siteForNode } from './runtime-s4v0smk7.js';

// plugins/aws/src/ce/status.ts
async function collectAwsCeStatus(plan, checkpoint, api, runtime, signal, storage) {
  const observedAt = new Date().toISOString();
  let aws;
  const expectedInstances = {};
  let identitiesVerified = false;
  const bindings = siteBindings(plan);
  const nodes = Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  try {
    const inventory = await collectAwsCeInventory(
      { accountId: plan.accountId, awsProfile: plan.intent.awsProfile, regions: [plan.region] },
      api,
      signal,
    );
    const deployed = inventory.nodes.filter((node) => node.deploymentId === plan.deploymentName);
    const current = deployed.filter((node) => !['terminated', 'shutting-down'].includes(String(node.state)));
    const historical = deployed.filter((node) => !current.includes(node));
    const conflicts = current.some(
      (node) =>
        node.ownership !== 'managed' ||
        node.engine !== plan.engine ||
        (plan.planSha256 !== undefined && node.planSha256 !== plan.planSha256) ||
        !bindings.some(({ site }) => site.name === node.siteName),
    );
    for (const [index, hostname] of nodes.entries()) {
      const id = checkpoint?.resolvedValues[`__INSTANCE_${index + 1}__`];
      if (
        id &&
        /^i-[0-9a-f]{8,17}$/.test(id) &&
        current.filter(
          (node) =>
            node.instanceId === id &&
            node.siteName === siteForNode(plan.intent, index + 1).name &&
            (node.nodeIndex === String(index + 1) || (plan.engine === 'native' && node.nodeIndex === null)),
        ).length === 1
      )
        expectedInstances[hostname] = id;
    }
    identitiesVerified =
      !conflicts &&
      current.length === nodes.length &&
      Object.keys(expectedInstances).length === nodes.length &&
      new Set(Object.values(expectedInstances)).size === nodes.length;
    aws = {
      status: conflicts ? 'ownership-conflict' : identitiesVerified ? 'observed' : 'incomplete',
      source: inventory.source,
      observedAt: inventory.collectedAt,
      nodes: current,
      historicalNodes: historical,
      counts: {
        instances: current.length,
        interfaces: current.reduce((sum, node) => sum + node.interfaces.length, 0),
      },
    };
  } catch {
    signal?.throwIfAborted();
    aws = { status: 'unknown', reason: 'inventory-unavailable', observedAt };
  }
  const unknown = (reason) => ({ status: 'unknown', reason, observedAt });
  const sites = [];
  for (const { binding } of bindings) {
    let registration = unknown('platform-service-unavailable');
    let health = unknown('platform-service-unavailable');
    if (runtime) {
      try {
        health = await runtime.observeHealth(binding, signal);
      } catch {
        signal?.throwIfAborted();
        health = unknown('platform-observation-unavailable');
      }
      if (identitiesVerified) {
        try {
          registration = await runtime.observeRegistrations(
            binding,
            Object.fromEntries(binding.nodes.map((node) => [node, expectedInstances[node]])),
            signal,
          );
        } catch {
          signal?.throwIfAborted();
          registration = unknown('platform-observation-unavailable');
        }
      } else registration = unknown('cloud-instance-identities-unverified');
    }
    sites.push({ siteName: binding.siteName, nodes: binding.nodes, registration, health });
  }
  const aggregate = (field) => ({
    status: sites.every((site) => site[field].status === 'healthy')
      ? 'healthy'
      : sites.some((site) => site[field].status === 'unknown')
        ? 'unknown'
        : 'degraded',
    observedAt,
    source: 'per-site-observations',
  });
  const networkApi = scopedAwsApi(api, plan.intent.awsProfile, signal);
  const hasNlb = plan.routing?.profile === 'nlb-ingress' || plan.intent.ingress?.mode === 'nlb';
  const observations = [];
  if (plan.routing?.profile.startsWith('tgw-')) {
    observations.push(await collectAwsNetworkHealth('routes', plan, checkpoint, networkApi, signal));
    if (plan.routing.profile === 'tgw-connect')
      observations.push(await collectAwsNetworkHealth('bgp', plan, checkpoint, networkApi, signal));
  }
  if (hasNlb) observations.push(await collectAwsNetworkHealth('nlb', plan, checkpoint, networkApi, signal));
  const routing = observations.length
    ? {
        status: observations.every((row) => row.status === 'healthy')
          ? 'healthy'
          : observations.some((row) => row.status === 'unknown')
            ? 'unknown'
            : 'degraded',
        observedAt,
        source: 'aws-cli-live',
        observations,
      }
    : unknown('no-requested-network-observations');
  return {
    schemaVersion: 2,
    deploymentId: plan.deploymentName,
    siteName: plan.siteName,
    engine: plan.engine,
    scope: { accountId: plan.accountId, region: plan.region },
    observedAt,
    checkpoint: {
      state: checkpoint?.state ?? 'not-started',
      completedActions: checkpoint?.completedActionIds.length ?? 0,
    },
    aws,
    f5: { registration: aggregate('registration'), health: aggregate('health'), sites },
    routing,
    traffic:
      identitiesVerified && storage
        ? await readAwsTrafficProbeEvidence(plan, storage, checkpoint?.resolvedValues ?? {})
        : unknown('traffic-receipt-unavailable'),
  };
}

// plugins/aws/src/tools/aws-ce-status.ts
function createAwsCeStatusTool2(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_status',
    label: 'AWS Customer Edge Status',
    description:
      'Collect scoped AWS instance/interface identities and shared-platform registration/site health. Caller-supplied health is rejected; unavailable routing, traffic or platform evidence remains unknown.',
    parameters: Type.Object({
      planId: Type.Optional(Type.String()),
      planSha256: Type.Optional(Type.String()),
      site: Type.Optional(
        Type.Object({
          accountId: Type.String(),
          awsProfile: Type.String(),
          region: Type.String(),
          siteName: Type.String(),
          platformContext: Type.Optional(Type.String()),
        }),
      ),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if (Object.hasOwn(params, 'f5Evidence')) throw new Error('Caller-supplied F5 health evidence is unsupported');
        if (params.site) {
          if (params.planId || params.planSha256 || !/^[a-z][a-z0-9-]{0,62}$/.test(params.site.siteName))
            throw new Error('Select a saved plan or an inventory site');
          const scope = params.site;
          const inventory = await collectAwsCeInventory(
            { accountId: scope.accountId, awsProfile: scope.awsProfile, regions: [scope.region] },
            makeApi(ctx.cwd),
            signal,
          );
          const nodes = inventory.nodes.filter((node) => node.siteName === scope.siteName);
          let platform = { status: 'unknown', reason: 'platform-service-unavailable' };
          try {
            platform = await (
              await (await awsPlatformService(pi, signal)).runtime('native', scope.platformContext)
            ).observeReadOnlySite(
              scope.siteName,
              nodes.map((node) => node.instanceId),
              signal,
            );
          } catch {
            signal?.throwIfAborted();
          }
          return {
            content: [
              {
                type: 'text',
                text: `AWS CE ${scope.siteName}: ${nodes.length} inventory-selected node(s); F5 evidence ${platform.status}. Ownership remains as observed; this selection is read-only.`,
              },
            ],
            details: {
              tool: 'aws_ce_status',
              status: {
                observedAt: inventory.collectedAt,
                scope,
                ownership: nodes.map((node) => ({
                  instanceId: node.instanceId,
                  ownership: node.ownership,
                  engine: node.engine,
                })),
                aws: { status: 'observed', nodes },
                f5: platform,
                canSatisfyMutationGate: false,
              },
            },
          };
        }
        if (!params.planId || !params.planSha256) throw new Error('An exact saved plan or inventory site is required');
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256, 'inspect');
        if (Number(plan.schemaVersion) === 1)
          return {
            content: [
              {
                type: 'text',
                text: `Legacy AWS CE plan ${plan.planId} is integrity-valid and inspectable. Rediscover and replan with schema v2 before mutation.`,
              },
            ],
            details: {
              tool: 'aws_ce_status',
              status: {
                schemaVersion: 1,
                planId: plan.planId,
                engine: 'unrecorded',
                capability: 'inspection-only',
                canSatisfyMutationGate: false,
              },
            },
          };
        let checkpoint =
          plan.engine === 'native'
            ? await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256)
            : undefined;
        let workflowProgress;
        let runtime;
        let storage;
        try {
          const platform = await awsPlatformService(pi, signal);
          storage = await platform.storage(
            {
              deploymentId: plan.deploymentName,
              engine: plan.engine,
              provider: 'aws',
              account: plan.accountId,
              region: plan.region,
            },
            { readOnly: true },
          );
          if (plan.engine === 'terraform') {
            try {
              const workflow = await readAwsTerraformWorkflowStatus(
                plan,
                await platform.storage(
                  {
                    deploymentId: plan.deploymentName,
                    engine: 'terraform',
                    provider: 'aws',
                    account: plan.accountId,
                    region: plan.region,
                  },
                  { readOnly: true },
                ),
              );
              workflowProgress = workflow.progress;
              const owner = {
                deploymentId: plan.deploymentName,
                engine: 'terraform',
                provider: 'aws',
                account: plan.accountId,
                region: plan.region,
              };
              const session = await (await awsTerraformService(pi, signal)).open(
                owner,
                await awsTerraformFoundationDeployment(plan),
                'current',
              );
              const instances = await readAwsTerraformInstanceBindings(plan, session, process.env, signal);
              checkpoint = {
                ...(workflow.routing ?? {
                  schemaVersion: plan.schemaVersion,
                  engine: 'terraform',
                  planId: plan.planId,
                  planSha256: plan.planSha256,
                  state: 'running',
                  completedActionIds: [],
                  resolvedValues: {},
                }),
                resolvedValues: { ...workflow.routing?.resolvedValues, ...instances },
              };
            } catch (error) {
              if (signal?.aborted) throw error;
              workflowProgress = { state: 'unknown', engine: 'terraform', reason: 'workflow-evidence-unavailable' };
            }
          }
          runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        } catch {
          signal?.throwIfAborted();
          if (plan.engine === 'terraform' && !workflowProgress)
            workflowProgress = { state: 'unknown', engine: 'terraform', reason: 'platform-service-unavailable' };
        }
        const status = await collectAwsCeStatus(plan, checkpoint, makeApi(ctx.cwd), runtime, signal, storage);
        if (workflowProgress) Object.assign(status.checkpoint, workflowProgress);
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE ${plan.deploymentName}: cloud evidence ${status.aws.status}; registration ${status.f5.registration.status}; site health ${status.f5.health.status}. Routing evidence ${status.routing.status}; traffic evidence ${status.traffic.status}.`,
            },
          ],
          details: { tool: 'aws_ce_status', status },
        };
      } catch {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: 'AWS CE status is unavailable. Use the exact persisted plan and tool-collected evidence.',
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_status' },
        };
      }
    },
  };
}

export { createAwsCeStatusTool2 };
