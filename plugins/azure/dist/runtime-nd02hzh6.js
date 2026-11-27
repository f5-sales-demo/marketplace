// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import { canonicalSha256 } from './runtime-6j4b2rhv.js';
import { makeExecApi } from './runtime-2139fbqg.js';
import {
  AZURE_CE_SCHEMA_VERSION,
  compileAzureCePlan,
  compileAzureNativeNetworkReplacementPlan,
  compileAzureNativeNetworkUpdatePlan,
  compileAzureRelayDeploymentPlan,
  compileAzureRelayReplacementPlan,
  compileAzureTerraformNetworkReplacementPlan,
  compileAzureTerraformNetworkUpdatePlan,
  compileAzureWorkloadDeploymentPlan,
  loadDiscoveryArtifact,
  loadPlanArtifact,
  resolveAzureRelayCatalog,
  resolveAzureWorkloadCatalog,
  savePlanArtifact,
  verifyAzureNativeNetworkProfile,
  verifyAzureTerraformNetworkProfile,
  verifyAzureTerraformNetworkReplacementProfile,
} from './runtime-ragavjaz.js';

// plugins/azure/src/tools/azure-ce-plan.ts
function createAzureCePlanTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const subnet = Type.Object({
    mode: Type.Union([Type.Literal('greenfield'), Type.Literal('brownfield')]),
    name: Type.Optional(Type.String()),
    cidr: Type.Optional(Type.String()),
    resourceId: Type.Optional(Type.String()),
    vnetResourceId: Type.Optional(Type.String()),
  });
  const nic = Type.Object({
    name: Type.String(),
    role: Type.Union(['slo', 'sli', 'management', 'data', 'cluster', 'other'].map((value) => Type.Literal(value))),
    vrf: Type.Optional(Type.String()),
    subnet,
  });
  return {
    name: 'azure_ce_plan',
    label: 'Plan Azure Customer Edge',
    description:
      'Compile normalized natural-language intent and a live discovery artifact into a canonical, immutable, secret-free Azure Customer Edge plan. Users never need to author YAML.',
    parameters: Type.Object({
      discoveryArtifactId: Type.String(),
      retainedDeployment: Type.Optional(
        Type.Object({ planId: Type.String(), planSha256: Type.String() }, { additionalProperties: false }),
      ),
      originalDeployment: Type.Optional(
        Type.Object({ planId: Type.String(), planSha256: Type.String() }, { additionalProperties: false }),
      ),
      relay: Type.Optional(
        Type.Object(
          {
            vmSize: Type.String(),
            hostImage: Type.Object(
              { publisher: Type.String(), offer: Type.String(), sku: Type.String(), version: Type.String() },
              { additionalProperties: false },
            ),
            frr: Type.Object({ version: Type.String(), image: Type.String() }, { additionalProperties: false }),
            docker: Type.Object({ version: Type.String(), sha256: Type.String() }, { additionalProperties: false }),
            relays: Type.Array(
              Type.Object({ asn: Type.Integer(), privateAddress: Type.String() }, { additionalProperties: false }),
              { minItems: 2, maxItems: 2 },
            ),
            vipPrefixes: Type.Array(Type.String(), { minItems: 1, maxItems: 32 }),
            returnPrefixes: Type.Array(Type.String(), { minItems: 1, maxItems: 32 }),
          },
          { additionalProperties: false },
        ),
      ),
      intent: Type.Object({
        schemaVersion: Type.Literal(AZURE_CE_SCHEMA_VERSION),
        platformContext: Type.Optional(Type.String()),
        engine: Type.Optional(Type.Union([Type.Literal('native'), Type.Literal('terraform')])),
        operation: Type.Union(
          [
            'deploy',
            'reconcile',
            'start',
            'stop',
            'resize',
            'update-network',
            'replace-node',
            'repair',
            'teardown',
          ].map((value) => Type.Literal(value)),
        ),
        subscriptionId: Type.String(),
        deploymentName: Type.String(),
        siteName: Type.String(),
        namespace: Type.String(),
        resourceGroup: Type.String(),
        region: Type.Optional(Type.String()),
        topology: Type.Object({ ha: Type.Boolean() }),
        nics: Type.Array(nic, { minItems: 1, maxItems: 8 }),
        egress: Type.Object({
          mode: Type.Union(['public-ip', 'nat-gateway', 'firewall', 'proxy'].map((value) => Type.Literal(value))),
          resourceId: Type.Optional(Type.String()),
        }),
        routing: Type.Object({
          mode: Type.Union(['auto', 'udr', 'route-server'].map((value) => Type.Literal(value))),
          destinationCidrs: Type.Array(Type.String()),
          forwardingRoutes: Type.Optional(
            Type.Object(
              {
                before: Type.Array(
                  Type.Object(
                    {
                      node: Type.Integer({ minimum: 1, maximum: 3 }),
                      role: Type.Union([Type.Literal('slo'), Type.Literal('sli')]),
                      prefix: Type.String(),
                      routeType: Type.Union(
                        ['REMOTE_SITE_ROUTE', 'LOCAL_ROUTE', 'STATIC_ROUTE', 'BGP_ROUTE'].map((value) =>
                          Type.Literal(value),
                        ),
                      ),
                    },
                    { additionalProperties: false },
                  ),
                  { minItems: 2, maxItems: 1024 },
                ),
                after: Type.Array(
                  Type.Object(
                    {
                      node: Type.Integer({ minimum: 1, maximum: 3 }),
                      role: Type.Union([Type.Literal('slo'), Type.Literal('sli')]),
                      prefix: Type.String(),
                      routeType: Type.Union(
                        ['REMOTE_SITE_ROUTE', 'LOCAL_ROUTE', 'STATIC_ROUTE', 'BGP_ROUTE'].map((value) =>
                          Type.Literal(value),
                        ),
                      ),
                    },
                    { additionalProperties: false },
                  ),
                  { minItems: 2, maxItems: 1024 },
                ),
              },
              {
                additionalProperties: false,
                description:
                  'Expected CE SLO and SLI routes before and after the network change; route observations alone do not authorize interruption.',
              },
            ),
          ),
          udr: Type.Optional(
            Type.Object(
              {
                subnetNames: Type.Array(Type.String(), { minItems: 1, uniqueItems: true }),
                nextHop: Type.Object(
                  {
                    node: Type.Integer({ minimum: 1, maximum: 3 }),
                    nicIndex: Type.Integer({ minimum: 0, maximum: 7 }),
                  },
                  { additionalProperties: false },
                ),
              },
              { additionalProperties: false },
            ),
          ),
          localAsn: Type.Optional(
            Type.Number({ description: 'CE local ASN; Route Server requires an unreserved 16-bit value.' }),
          ),
          peerAsn: Type.Optional(
            Type.Number({ description: 'CE ASN passed to Azure peering; must equal localAsn when both are supplied.' }),
          ),
        }),
        ingress: Type.Optional(
          Type.Union([
            Type.Object({ mode: Type.Literal('none') }),
            Type.Object({
              mode: Type.Literal('platform-http'),
              port: Type.Integer({ minimum: 1, maximum: 65535 }),
              listener: Type.Object({
                name: Type.String(),
                namespace: Type.String(),
                domain: Type.String(),
                privateAddress: Type.String(),
                originPool: Type.Object({ name: Type.String(), namespace: Type.String() }),
              }),
              probe: Type.Object({
                sourceVmResourceId: Type.String(),
                path: Type.String(),
                expectedStatus: Type.Integer({ minimum: 100, maximum: 599 }),
                expectedBodySha256: Type.String(),
              }),
            }),
          ]),
        ),
        securityRules: Type.Array(
          Type.Object({
            name: Type.String(),
            purpose: Type.Union(
              ['application-vip', 'management', 'intra-cluster', 'platform-connectivity'].map((value) =>
                Type.Literal(value),
              ),
            ),
            direction: Type.Union([Type.Literal('Inbound'), Type.Literal('Outbound')]),
            protocol: Type.Union([Type.Literal('Tcp'), Type.Literal('Udp'), Type.Literal('*')]),
            sourceCidrs: Type.Array(Type.String()),
            destinationCidrs: Type.Array(Type.String()),
            destinationPorts: Type.Array(Type.String()),
          }),
        ),
        initialVersions: Type.Optional(Type.Object({ software: Type.String(), os: Type.String() })),
        image: Type.Object({ publisher: Type.String(), offer: Type.String(), plan: Type.String() }),
        vm: Type.Object({ size: Type.String(), zones: Type.Optional(Type.Array(Type.String())) }),
        brownfield: Type.Object({
          resourceIds: Type.Array(Type.String()),
          routeChanges: Type.Array(
            Type.Object({
              routeTableId: Type.String(),
              subnetId: Type.String(),
              routeName: Type.String(),
              destinationCidr: Type.String(),
            }),
          ),
        }),
        workloadFixture: Type.Optional(
          Type.Object({
            imageVersion: Type.String(),
            subnetName: Type.String(),
            cidr: Type.String(),
            privateIp: Type.String(),
            port: Type.Integer({ minimum: 1, maximum: 65535 }),
          }),
        ),
        replacementNode: Type.Optional(Type.Number()),
      }),
    }),
    async execute(_id, request, signal, _update, ctx) {
      try {
        const params = structuredClone(request),
          requestDigest = canonicalSha256(request);
        const { sessionManager: session, cwd } = ctx,
          sessionId = session.getSessionId(),
          directory = session.getArtifactsDir();
        const callbacks = [
          session.getSessionId,
          session.getArtifactsDir,
          session.getArtifactPath,
          session.saveArtifact,
        ];
        const seal = () => {
          signal?.throwIfAborted();
          if (
            canonicalSha256(request) !== requestDigest ||
            ctx.sessionManager !== session ||
            ctx.cwd !== cwd ||
            session.getSessionId() !== sessionId ||
            session.getArtifactsDir() !== directory ||
            callbacks.some(
              (callback, index) =>
                callback !==
                [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact][index],
            )
          )
            throw Error('Azure CE planning request or session changed during execution');
        };
        const observation = await loadDiscoveryArtifact(session, params.discoveryArtifactId);
        seal();
        signal?.throwIfAborted();
        let plan = compileAzureCePlan(params.intent, observation);
        if (
          params.originalDeployment !== undefined &&
          (plan.engine !== 'terraform' ||
            !['update-network', 'replace-node'].includes(plan.intent.operation) ||
            !params.retainedDeployment ||
            Object.keys(params.originalDeployment).sort().join(',') !== 'planId,planSha256')
        )
          throw Error('Original deployment selector requires an exact retained Terraform network plan');
        if (params.retainedDeployment !== undefined) {
          if (
            params.relay !== undefined ||
            Object.keys(params.retainedDeployment).sort().join(',') !== 'planId,planSha256'
          )
            throw Error('Relay replacement requires the exact retained plan; relay reselection is forbidden');
          const { plan: retained } = await loadPlanArtifact(
            ctx.sessionManager,
            params.retainedDeployment.planId,
            params.retainedDeployment.planSha256,
          );
          seal();
          if (
            plan.engine === 'terraform' &&
            (plan.intent.operation === 'update-network' ||
              (plan.intent.operation === 'replace-node' &&
                (retained.terraformNetworkProfile || retained.terraformNetworkReplacementProfile)))
          ) {
            const originalSha =
              retained.intent.operation === 'deploy'
                ? retained.planSha256
                : (params.originalDeployment?.planSha256 ??
                  (retained.terraformNetworkReplacementProfile
                    ? verifyAzureTerraformNetworkReplacementProfile(retained).originalPlanSha256
                    : verifyAzureTerraformNetworkProfile(retained).originalPlanSha256));
            const original = params.originalDeployment
              ? (
                  await loadPlanArtifact(
                    ctx.sessionManager,
                    params.originalDeployment.planId,
                    params.originalDeployment.planSha256,
                  )
                ).plan
              : retained.intent.operation === 'deploy'
                ? retained
                : (await loadPlanArtifact(ctx.sessionManager, `azure-ce-${originalSha.slice(0, 24)}`, originalSha))
                    .plan;
            seal();
            plan =
              plan.intent.operation === 'replace-node'
                ? compileAzureTerraformNetworkReplacementPlan(plan, retained, original)
                : compileAzureTerraformNetworkUpdatePlan(plan, retained, original);
          } else if (plan.engine === 'native' && plan.intent.operation === 'update-network') {
            const original =
              retained.intent.operation === 'deploy'
                ? retained
                : (
                    await loadPlanArtifact(
                      ctx.sessionManager,
                      `azure-ce-${(retained.networkReplacementProfile ? retained.networkReplacementProfile.originalPlanSha256 : verifyAzureNativeNetworkProfile(retained).originalPlanSha256).slice(0, 24)}`,
                      retained.networkReplacementProfile
                        ? retained.networkReplacementProfile.originalPlanSha256
                        : verifyAzureNativeNetworkProfile(retained).originalPlanSha256,
                    )
                  ).plan;
            plan = compileAzureNativeNetworkUpdatePlan(plan, retained, original);
          } else if (
            plan.engine === 'native' &&
            plan.intent.operation === 'replace-node' &&
            (retained.networkProfile || retained.networkReplacementProfile)
          ) {
            const originalSha =
              retained.networkReplacementProfile?.originalPlanSha256 ??
              verifyAzureNativeNetworkProfile(retained).originalPlanSha256;
            const { plan: original } = await loadPlanArtifact(
              ctx.sessionManager,
              `azure-ce-${originalSha.slice(0, 24)}`,
              originalSha,
            );
            plan = compileAzureNativeNetworkReplacementPlan(plan, retained, original);
          } else {
            if (params.originalDeployment !== undefined)
              throw Error('Original selector requires the owning Terraform network generation');
            plan = compileAzureRelayReplacementPlan(plan, retained, observation);
          }
        }
        if (plan.engine === 'terraform' && plan.intent.operation === 'update-network' && !plan.terraformNetworkProfile)
          throw Error('Terraform network planning requires the exact retained deployment plan identity');
        if (plan.engine === 'native' && plan.intent.operation === 'update-network' && !plan.networkProfile)
          throw Error('Native network planning requires the exact retained deployment plan identity');
        if (plan.intent.workloadFixture && params.retainedDeployment === undefined) {
          if (!ctx.cwd) throw Error('Workload planning requires a catalog execution directory');
          const catalog = await resolveAzureWorkloadCatalog(plan, makeApi(ctx.cwd), signal);
          plan = compileAzureWorkloadDeploymentPlan(plan, catalog);
        }
        if (params.relay !== undefined) {
          if (
            !ctx.cwd ||
            Object.keys(params.relay).sort().join(',') !==
              'docker,frr,hostImage,relays,returnPrefixes,vipPrefixes,vmSize'
          )
            throw new Error(
              'Relay selection requires an execution directory and exact selectors; catalog receipts are collected by the tool',
            );
          const selection = structuredClone(params.relay);
          const catalog = await resolveAzureRelayCatalog(plan, selection, makeApi(ctx.cwd), signal);
          plan = compileAzureRelayDeploymentPlan(plan, selection, catalog);
        }
        signal?.throwIfAborted();
        seal();
        const artifactId = await savePlanArtifact(session, plan, observation);
        seal();
        const warnings = plan.warnings.length
          ? `
Warnings:
${plan.warnings
  .map((warning) => `- ${warning}`)
  .join(`
`)}`
          : '';
        const costs = plan.billableResources.map((item) => `${item.count} ${item.type}`).join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Plan ID: ${plan.planId}
SHA-256: ${plan.planSha256}
Region: ${plan.region}
Topology: ${plan.topology.nodeCount} node(s), ${plan.nics.length} NIC(s) each
Pinned image: ${plan.image.urn}
Billable resources: ${costs}
Ordered actions: ${plan.actions.length}${warnings}
Plan artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'azure_ce_plan', artifactId, plan },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE planning failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_plan' },
        };
      }
    },
  };
}

export { createAzureCePlanTool };
