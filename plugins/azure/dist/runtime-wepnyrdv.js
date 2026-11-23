// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/azure/src/tools/azure-ce-failover.ts
import { join } from 'node:path';
import {
  acquireProcessLock,
  azureUpgradeBinding,
  loadPlanArtifact,
  observeAzureRelayRoutingWorkflow,
  requireAzureCeRoutingContract,
  verifyAzureRelayHistoricalArtifacts,
} from './runtime-0s0phy0m.js';
import { assertAzureNativeRelayActive } from './runtime-0wh24qrj.js';
import { canonicalSha256, safeHexEqual } from './runtime-6j4b2rhv.js';
import { makeExecApi } from './runtime-2139fbqg.js';
import {
  azureFailoverOwner,
  buildAzureCeFailoverPlan,
  collectAzureFailoverAcceptance,
  collectAzureFailoverTraffic,
  createAzureTerraformFailoverController,
  observeAzureFailoverVm,
  observeAzureFailoverVmState,
  requireAzureFailoverExecutionContract,
  runAzureCeFailover,
  validateAzureFailoverCheckpoint,
  verifyAzureCeFailoverPlan,
} from './runtime-cyhdbt19.js';
import { azurePlatformService, azureTerraformService } from './runtime-hxhs7mq0.js';
import { withAzureCeExecution } from './runtime-tdt4p3w8.js';

// plugins/azure/src/ce/relay-failover.ts
var object = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Azure relay failover: malformed scope');
  return value;
};
var require2 = (condition, message) => {
  if (!condition) throw Error(`Azure relay failover: ${message}`);
};
function requireAzureRelayFailoverScope(source, input, capabilities, records) {
  const binding = azureUpgradeBinding(source);
  require2(
    source.relayProfile &&
      source.topology.ha &&
      source.topology.nodeCount === 3 &&
      source.nics.length === 2 &&
      source.nics.some((nic) => nic.role === 'slo') &&
      source.nics.some((nic) => nic.role === 'sli'),
    'complete three-node SLO/SLI relay topology required',
  );
  const stored = object(input);
  require2(
    Object.keys(stored).sort().join(',') ===
      'binding,contractFingerprint,expectedInterfaces,schemaVersion,siteUid,tenantOrigin' &&
      stored.schemaVersion === 1 &&
      stored.tenantOrigin === capabilities.tenantOrigin &&
      typeof capabilities.tenantOrigin === 'string' &&
      /^https:\/\//.test(capabilities.tenantOrigin) &&
      stored.contractFingerprint === capabilities.contractFingerprint &&
      /^sha256:[a-f0-9]{64}$/.test(capabilities.contractFingerprint) &&
      typeof stored.siteUid === 'string' &&
      stored.siteUid.trim() &&
      canonicalSha256(stored.binding) === canonicalSha256(binding),
    'active context, contract or deployment binding differs',
  );
  require2(
    records instanceof Map &&
      ['relay-routing-workflow.json', 'platform-relay-routing.json', 'relay-routing-configuration.json'].every((name) =>
        records.has(name),
      ),
    'complete historical relay configuration required',
  );
  verifyAzureRelayHistoricalArtifacts(source, stored.siteUid, records);
  const routing = object(records.get('platform-relay-routing.json'));
  require2(
    routing.contractFingerprint === capabilities.contractFingerprint,
    'configured relay contract differs from active context',
  );
  const journal = object(records.get('relay-routing-workflow.json'));
  const cloud = object(object(journal.identity).stable).cloud;
  require2(
    Array.isArray(cloud) && Array.isArray(stored.expectedInterfaces) && stored.expectedInterfaces.length === 6,
    'complete six-interface binding required',
  );
  const expected = stored.expectedInterfaces;
  const seen = new Set(),
    macs = new Set();
  for (const row of expected) {
    const value = object(row),
      normalized = typeof value.mac === 'string' ? value.mac.toLowerCase().replaceAll('-', ':') : '';
    const key = `${value.node}/${value.role}`;
    require2(
      binding.nodes.includes(String(value.node)) &&
        ['slo', 'sli'].includes(String(value.role)) &&
        /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(normalized) &&
        !seen.has(key) &&
        !macs.has(normalized),
      'duplicate, partial or foreign expected interfaces',
    );
    seen.add(key);
    macs.add(normalized);
    const matches = cloud.map(object).filter((item) => item.node === value.node && item.role === value.role);
    require2(
      matches.length === 1 && matches[0].mac === normalized,
      'expected interface MAC differs from retained cloud identity',
    );
  }
  return {
    siteUid: stored.siteUid,
    expectedInterfaces: structuredClone(expected),
    topology: 'ce-relay-route-server',
    ceSessionSequence: [6, 4, 6],
    cloudSessionSequence: [4, 4, 4],
    currentTrafficQualified: false,
  };
}
async function collectAzureRelayFailoverAcceptance(source, failover, phase, platform, runtime, storage, api, signal) {
  signal?.throwIfAborted();
  verifyAzureCeFailoverPlan(source, failover);
  require2(['baseline', 'outage', 'recovered'].includes(phase), 'phase differs');
  if (!platform.siteBinding) throw Error('Azure relay failover: trusted site binding service unavailable');
  const stored = await platform.siteBinding(source.siteName, source.intent.platformContext);
  signal?.throwIfAborted();
  const capabilities = await platform.capabilities(source.intent.platformContext);
  signal?.throwIfAborted();
  const records = new Map();
  for (const name of ['relay-routing-workflow.json', 'platform-relay-routing.json', 'relay-routing-configuration.json'])
    records.set(name, await storage.read(name));
  const scope = requireAzureRelayFailoverScope(source, stored, capabilities, records);
  signal?.throwIfAborted();
  const observation = await observeAzureRelayRoutingWorkflow(
    source,
    scope.expectedInterfaces,
    runtime,
    storage,
    api,
    signal,
    phase === 'outage' ? { nodeIndex: failover.nodeIndex } : undefined,
  );
  require2(observation.siteUid === scope.siteUid, 'current site differs from trusted binding');
  for (const row of [observation.sessions, observation.finalSessions, observation.ceRoutes]) {
    const current = object(row);
    require2(
      current.contractFingerprint === capabilities.contractFingerprint &&
        current.siteName === source.siteName &&
        canonicalSha256(current.owner) === canonicalSha256(stored.binding.owner),
      'current CE observation owner or contract differs',
    );
  }
  const expectedSessions = phase === 'outage' ? 4 : 6;
  require2(
    observation.sessions.expectedSessions === expectedSessions &&
      observation.sessions.establishedSessions === expectedSessions &&
      observation.finalSessions.expectedSessions === expectedSessions &&
      observation.finalSessions.establishedSessions === expectedSessions,
    'current CE session cardinality differs',
  );
  signal?.throwIfAborted();
  const traffic = await collectAzureFailoverTraffic(source, failover, phase, storage, api, signal);
  signal?.throwIfAborted();
  const evidence = object(observation);
  const qualified =
    evidence.routing === 'healthy' &&
    evidence.fib === 'healthy' &&
    evidence.ceRouteScope === 'qualified' &&
    evidence.freshness === 'qualified' &&
    evidence.ceSampleFreshnessQualified === true &&
    traffic.evidence.status === 'healthy';
  return {
    acceptance: qualified ? 'passed' : 'unknown',
    phase,
    topology: scope.topology,
    expectedEstablishedSessions: phase === 'outage' ? 4 : 6,
    expectedCloudEstablishedSessions: 4,
    observation,
    traffic: traffic.evidence,
    trafficCheckpointKey: traffic.checkpointKey,
    trafficRequestedAt: traffic.requestedAt,
    ...(qualified
      ? {}
      : { reason: 'Relay CE route scope, forwarding and original sample freshness remain unqualified' }),
    observedAt: new Date().toISOString(),
  };
}

// plugins/azure/src/tools/azure-ce-failover.ts
var defaults = {
  platform: azurePlatformService,
  terraform: azureTerraformService,
  makeApi: makeExecApi,
};
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAzureCeFailoverTool(pi, dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_failover',
    label: 'Validate Azure Customer Edge Failover',
    description:
      'Prepare or execute an immutable, engine-owned Azure CE outage plan with exact VM identity, topology-specific CE and cloud BGP evidence, effective routes, content-bound traffic, and Terraform state release.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      nodeIndex: Type.Optional(Type.Number()),
      failoverPlanId: Type.Optional(Type.String()),
      failoverPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      let releaseLifecycle;
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'nodeIndex', 'operation']
            : ['basePlanId', 'basePlanSha256', 'failoverPlanId', 'failoverPlanSha256', 'operation'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`Azure CE failover ${params.operation} parameters differ`);
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        requireAzureCeRoutingContract(plan, runtime);
        const storage = await platform.storage(azureFailoverOwner(plan));
        if (plan.relayProfile) {
          releaseLifecycle = await acquireProcessLock(
            join(
              storage.directory,
              plan.engine === 'native' ? '.azure-relay-native-mutation-lock' : '.azure-terraform-lifecycle-lock',
            ),
          );
          signal?.throwIfAborted();
          await storage.verify();
          if (plan.engine === 'native') await assertAzureNativeRelayActive(storage);
          else if ((await optional(storage, 'azure-terraform-lifecycle-retirement.json')) !== undefined)
            throw Error('Azure Terraform relay lifecycle is retiring or retired; failover cannot execute');
          signal?.throwIfAborted();
        }
        const api = withAzureCeExecution(dependencies.makeApi(ctx.cwd), signal);
        if (params.operation === 'prepare') {
          if (!Number.isInteger(params.nodeIndex)) throw new Error('Failover preparation requires an exact nodeIndex');
          const evidence = await observeAzureFailoverVm(plan, params.nodeIndex, api, signal);
          const failover = buildAzureCeFailoverPlan(plan, evidence);
          const existing = await optional(storage, `${failover.planId}.json`);
          if (existing === undefined) await storage.write(`${failover.planId}.json`, failover);
          else if (canonicalSha256(existing) !== canonicalSha256(failover))
            throw new Error('Persisted Azure CE failover plan differs');
          await storage.write(`${failover.planId}-preparation-evidence.json`, evidence);
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: failover.kind,
              engine: failover.engine,
              planId: failover.planId,
              planSha256: failover.planSha256,
              sourcePlanSha256: failover.sourcePlanSha256,
              nodeIndex: failover.nodeIndex,
              vmResourceId: failover.vmResourceId,
              vmId: failover.vmId,
              evidence: { source: evidence.source, observedAt: evidence.observedAt, powerState: evidence.powerState },
            }),
            'azure-ce-failover-plan',
          );
          if (!artifactId) throw new Error('Azure CE failover plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `Failover plan ID: ${failover.planId}
SHA-256: ${failover.planSha256}
Node: ${failover.nodeIndex}
Artifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'azure_ce_failover',
              operation: 'prepare',
              artifactId,
              planId: failover.planId,
              planSha256: failover.planSha256,
            },
          };
        }
        if (!params.failoverPlanId || !params.failoverPlanSha256)
          throw new Error('Failover apply requires the exact failover plan identity');
        const failover = await storage.read(`${params.failoverPlanId}.json`);
        verifyAzureCeFailoverPlan(plan, failover);
        if (failover.planId !== params.failoverPlanId || !safeHexEqual(failover.planSha256, params.failoverPlanSha256))
          throw new Error('Persisted Azure CE failover plan identity differs');
        const routing = plan.relayProfile ? undefined : await storage.read('platform-routing.json');
        if (!plan.relayProfile) requireAzureFailoverExecutionContract(plan, failover, routing);
        const collect = (phase, currentSignal) =>
          plan.relayProfile
            ? collectAzureRelayFailoverAcceptance(plan, failover, phase, platform, runtime, storage, api, currentSignal)
            : collectAzureFailoverAcceptance(plan, failover, routing, phase, runtime, storage, api, currentSignal);
        const savedCheckpoint = await optional(storage, `${failover.planId}-checkpoint.json`);
        const checkpoint =
          savedCheckpoint === undefined ? undefined : validateAzureFailoverCheckpoint(plan, failover, savedCheckpoint);
        if (
          plan.relayProfile &&
          (!checkpoint || checkpoint.phase === 'baseline' || (checkpoint.phase === 'stop' && !checkpoint.pending))
        ) {
          const baseline = await collect('baseline', signal);
          signal?.throwIfAborted();
          if (baseline.acceptance !== 'passed')
            return {
              content: [
                {
                  type: 'text',
                  text: 'Azure relay failover admission remains unknown: current routing, forwarding and original sample freshness must be qualified.',
                },
              ],
              isError: true,
              details: { tool: 'azure_ce_failover', operation: 'apply', ...baseline },
            };
        }
        const authorizationName = `${failover.planId}-authorization.json`;
        const expectedAuthorization = {
          schemaVersion: 1,
          engine: plan.engine,
          sourcePlanSha256: plan.planSha256,
          failoverPlanSha256: failover.planSha256,
          mutations: true,
        };
        const authorization = await optional(storage, authorizationName);
        if (authorization === undefined) {
          if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
            throw new Error('Headless Azure CE failover requires XCSH_CE_HEADLESS_MUTATIONS=1');
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Execute planned Azure CE failover',
              `${failover.planId}
${failover.planSha256}
Node ${failover.nodeIndex}`,
            ))
          )
            throw new Error('Azure CE failover was not approved');
          await storage.write(authorizationName, expectedAuthorization);
        } else if (canonicalSha256(authorization) !== canonicalSha256(expectedAuthorization))
          throw new Error('Persisted Azure CE failover authorization differs');
        const observe = (currentSignal) => observeAzureFailoverVmState(plan, failover, api, currentSignal);
        let mutate;
        let release = async () => {};
        if (plan.engine === 'terraform') {
          const controller = await createAzureTerraformFailoverController(
            plan,
            failover,
            await dependencies.terraform(pi, signal),
            storage,
            observe,
            process.env,
            signal,
          );
          mutate = controller.mutate;
          release = controller.release;
        } else {
          mutate = async (phase, currentSignal) => {
            await observe(currentSignal);
            currentSignal?.throwIfAborted();
            const result = await api.exec(
              'az',
              [
                'vm',
                phase === 'stop' ? 'deallocate' : 'start',
                '--ids',
                failover.vmResourceId,
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
              currentSignal ? { signal: currentSignal } : undefined,
            );
            if (result.exitCode !== 0) throw new Error(`Azure native failover ${phase} request failed`);
          };
        }
        const result = await runAzureCeFailover(
          plan,
          failover,
          params.failoverPlanSha256,
          storage,
          observe,
          mutate,
          collect,
          release,
          signal,
        );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'azure-ce-failover-receipt');
        if (!artifactId) throw new Error('Azure CE failover receipt persistence failed');
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE node ${failover.nodeIndex}: ${result.status}; CE BGP sessions 6 \u2192 4 \u2192 6 and content-bound traffic passed.`,
            },
          ],
          details: { tool: 'azure_ce_failover', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE failover failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_failover', operation: params.operation },
        };
      } finally {
        await releaseLifecycle?.();
      }
    },
  };
}

export { createAzureCeFailoverTool };
