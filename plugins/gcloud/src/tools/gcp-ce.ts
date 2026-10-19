import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { CE_SERVICE_CHANNEL, type CePlatformService } from '../../../platform/src/ce/service';
import {
  assertGcpByolAuthorization,
  authorizeGcpByolTerms,
  fetchGcpByolDocument,
  planGcpByolTerms,
} from '../ce/byol-terms';
import { resolveGcpContract } from '../ce/contract';
import { collectCurrentGcpCorporateFunding } from '../ce/corporate-funding';
import { applyGcpDeploymentReview, createGcpDeploymentSources, planGcpDeploymentReview } from '../ce/deployment-review';
import { applyGcpDeploymentTeardown, planGcpDeploymentTeardown } from '../ce/deployment-teardown';
import { discoverGcp } from '../ce/discovery';
import { applyGcpMarketplaceAcceptance, planGcpMarketplaceAcceptance } from '../ce/marketplace-agreement';
import {
  createGcpMarketplacePort,
  enableGcpMarketplaceApi,
  GcpMarketplaceUnavailable,
  gcpMarketplacePrerequisiteGuidance,
} from '../ce/marketplace-port';
import { observeGcpOwnedDeployment } from '../ce/owned-status';
import { planGcpCe } from '../ce/planner';
import { readGcpCePolicy } from '../ce/policy';
import { collectGcpLaunchPreflight, supportsGcpLaunchPreflight } from '../ce/preflight';
import { createGcpPreflightPort } from '../ce/preflight-port';
import { applyPublicTerraformDeployment, planPublicTerraformDeployment } from '../ce/terraform-public';
import { openPublicTerraformRuntime } from '../ce/terraform-public-runtime';
import { applyPublicTerraformTeardown, planPublicTerraformTeardown } from '../ce/terraform-public-teardown';
import { resumeGcpTerraformSession } from '../ce/terraform-session';
import { applyGcpTerraformTeardown, planGcpTerraformTeardown } from '../ce/terraform-teardown';
import type { GcpCeEngine, GcpCeIntent } from '../ce/types';
import { validateIntent, validateScope } from '../ce/validation';
import { execGcloudJson, type GcloudExecApi } from '../gcloud/exec';
import type { PluginInterface } from '../gcloud/types';
import { makeExecApi } from './shared';

function result(tool: string, data: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    details: { tool, ...data },
    ...(isError ? { isError: true } : {}),
  };
}
const UNKNOWN = {
  registration: 'unknown',
  physicalInterfaceIdentity: 'unknown',
  platformHealth: 'unknown',
  routing: 'unknown',
  applicationTraffic: 'unknown',
};
async function platformService(pi: PluginInterface): Promise<CePlatformService> {
  const events = pi.events as { emit?(channel: string, data: unknown): void } | undefined;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Shared Platform CE service unavailable')), 2000);
    events?.emit?.(CE_SERVICE_CHANNEL, {
      version: 2,
      resolve: (service: CePlatformService) => {
        clearTimeout(timer);
        resolve(service);
      },
    });
  });
}
export function createGcpCeTools(
  pi: PluginInterface,
  makeApi: (cwd: string) => GcloudExecApi = makeExecApi,
  contract = resolveGcpContract,
  getPlatform: () => Promise<CePlatformService> = () => platformService(pi),
  preflight = collectGcpLaunchPreflight,
  policy = readGcpCePolicy,
  terraformSession = resumeGcpTerraformSession,
  funding = collectCurrentGcpCorporateFunding,
  publicTerraformRuntime = openPublicTerraformRuntime,
) {
  const { Type } = pi.typebox;
  const definitions = [
    ['gcp_project_identity', 'Read explicit GCP project identity. Does not change the active project or authenticate.'],
    [
      'gcp_compute_discover',
      'Discover exact F5 images and licenses, billing, APIs, machines and quotas for an explicit project/region. Unknown prerequisites remain explicit.',
    ],
    [
      'gcp_marketplace_agreement',
      'Discover and qualify the pinned F5 image Marketplace consent. Save an exact agreement document review and accept programmatically with its approvedPlanHash. Unavailable API, prerequisite terms and ambiguous mappings remain explicit; this tool places no orders.',
    ],
    [
      'gcp_ce_inventory',
      'List cloud instances labeled for a CE deployment. Labels are candidate ownership only; platform registration, interface identity and traffic remain unknown.',
    ],
    [
      'gcp_ce_plan',
      'Review a single-node BYOL deployment through the selected native or qualified Terraform engine when operation=deploy, or exact owning-engine teardown when operation=teardown. Collects prerequisites server-side. Terraform requires the packaged creation-identity provider. Without an operation, returns non-executable readiness.',
    ],
    [
      'gcp_ce_apply',
      'Apply or resume an exact reviewed single-node deployment or owning-engine teardown with operation and approvedPlanHash. Terraform inspects consumed submissions and requires a separate delete-only review for partial cleanup. Cloud creation does not imply registration, health or traffic.',
    ],
    [
      'gcp_ce_status',
      'Observe cloud instance provisioning for an explicit deployment without inferring F5 or traffic health.',
    ],
    [
      'gcp_ce_diagnose',
      'Report read-only cloud provisioning and separate unknown platform/interface/routing/traffic evidence. No packet collection or intrusive diagnostics.',
    ],
    ['gcp_ce_upgrade', 'Report GCP upgrade availability; upgrades require a reviewed plan and qualified F5 contract.'],
    ['gcp_ce_failover', 'Report GCP failover availability; no outage is induced without a qualified reviewed plan.'],
    [
      'gcp_ce_teardown',
      'Prepare a single-node teardown plan from exact deployment and owning-engine ledgers. Apply only with its approvedPlanHash; labels alone never authorize deletion.',
    ],
  ];
  return definitions.map(([tool, description]) => ({
    name: tool,
    label: tool.replaceAll('_', ' '),
    description,
    parameters: Type.Object({
      project: Type.String({ description: 'Explicit target project ID' }),
      region: Type.Optional(Type.String({ description: 'Explicit region; required for discovery and plan' })),
      deploymentName: Type.Optional(
        Type.String({ description: 'Exact deployment label; required for inventory/status/diagnose' }),
      ),
      platformContext: Type.Optional(
        Type.String({ description: 'Persisted F5 context; use with explicit region for ledger-bound status/diagnose' }),
      ),
      engine: Type.Optional(
        Type.Union([Type.Literal('native'), Type.Literal('terraform')], {
          description: 'Owning engine; native is the conversational default',
        }),
      ),
      intent: Type.Optional(
        Type.Unknown({
          description: 'Versioned GCP CE intent for readiness planning or Marketplace agreement qualification',
        }),
      ),
      operation: Type.Optional(
        Type.Union([Type.Literal('deploy'), Type.Literal('teardown')], {
          description: 'Explicit reviewed deployment or owned teardown lifecycle',
        }),
      ),
      approvedPlanHash: Type.Optional(
        Type.String({
          description: 'Exact SHA-256 of the saved deployment, teardown or agreement plan approved for execution',
        }),
      ),
      agreement: Type.Optional(
        Type.String({
          description: 'Exact Google Marketplace agreement resource, if automatic mapping is unavailable',
        }),
      ),
      agreementDocument: Type.Optional(
        Type.String({ description: 'Exact versioned document beneath that agreement; server validation is required' }),
      ),
      enableMarketplaceApi: Type.Optional(
        Type.Boolean({
          description:
            'Explicitly request enabling the scoped Consumer Procurement API prerequisite before consent qualification',
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        project: string;
        region?: string;
        deploymentName?: string;
        platformContext?: string;
        engine?: GcpCeEngine;
        intent?: GcpCeIntent;
        operation?: 'deploy' | 'teardown';
        approvedPlanHash?: string;
        agreement?: string;
        agreementDocument?: string;
        enableMarketplaceApi?: boolean;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: { cwd: string },
    ) {
      let mutationAttempted = false;
      try {
        validateScope(params.project, params.region);
        if (params.engine !== undefined && !['native', 'terraform'].includes(params.engine))
          throw new Error('Invalid owning engine');
        if (signal?.aborted) throw new Error('Operation cancelled');
        const api = makeApi(ctx.cwd);
        if (['gcp_ce_plan', 'gcp_ce_apply'].includes(tool) && params.operation === 'deploy') {
          const intent = params.intent;
          if (
            !intent ||
            intent.project !== params.project ||
            intent.region !== params.region ||
            intent.engine !== (params.engine ?? 'native') ||
            intent.operation !== 'deploy' ||
            (params.deploymentName !== undefined && params.deploymentName !== intent.deploymentName) ||
            (params.platformContext !== undefined && params.platformContext !== intent.platformContext)
          )
            throw new Error('Explicit deployment intent scope required');
          validateIntent(intent);
          if (tool === 'gcp_ce_plan' && params.approvedPlanHash)
            throw new Error('Planning tool cannot apply authorization');
          if (tool === 'gcp_ce_apply' && !params.approvedPlanHash)
            throw new Error('Exact reviewed deployment hash required');
          const platform = await getPlatform();
          const sources = createGcpDeploymentSources(platform, api);
          sources.contract = (signal) => contract(undefined, signal);
          sources.policy = policy;
          sources.preflight = (intent, signal) =>
            preflight(intent, createGcpPreflightPort(api, intent.project), signal);
          sources.funding = (intent, signal) => funding(api, intent.project, signal);
          if (intent.engine === 'terraform') {
            const runtime = await publicTerraformRuntime(platform, api, intent, signal);
            if (tool === 'gcp_ce_plan') {
              const plan = await planPublicTerraformDeployment(runtime, platform, intent, sources, signal);
              return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
            }
            const evidence = await applyPublicTerraformDeployment(
              runtime,
              platform,
              intent,
              params.approvedPlanHash as string,
              sources,
              signal,
              () => {
                mutationAttempted = true;
              },
            );
            return result(
              tool,
              { availability: 'terraform-deployment', ...evidence, mutationAttempted },
              evidence.state === 'reconciliation-required',
            );
          }
          if (tool === 'gcp_ce_apply') {
            const evidence = await applyGcpDeploymentReview(
              platform,
              api,
              intent,
              params.approvedPlanHash as string,
              sources,
              signal,
              () => {
                mutationAttempted = true;
              },
            );
            return result(tool, { availability: 'native-deployment', ...evidence, mutationAttempted });
          }
          const plan = await planGcpDeploymentReview(platform, api, intent, sources, signal);
          return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
        }
        if (tool === 'gcp_marketplace_agreement') {
          const intent = params.intent;
          if (
            !intent ||
            intent.project !== params.project ||
            intent.region !== params.region ||
            intent.engine !== (params.engine ?? 'native')
          )
            throw new Error('Explicit Marketplace intent scope required');
          validateIntent(intent);
          if (!!params.agreement !== !!params.agreementDocument)
            throw new Error('Both agreement and document references required');
          const platform = await getPlatform();
          const store = await platform.storage({
            deploymentId: intent.deploymentName,
            provider: 'gcp',
            engine: intent.engine,
            account: intent.project,
            region: intent.region,
          });
          const port = createGcpMarketplacePort(
            api,
            intent,
            params.agreement && params.agreementDocument
              ? { agreement: params.agreement, agreementDocument: params.agreementDocument }
              : undefined,
            undefined,
            signal,
          );
          const release = await acquireProcessLock(join(store.directory, '.gcp-deployment-lock'));
          try {
            if (params.enableMarketplaceApi) await enableGcpMarketplaceApi(api, intent.project, signal);
            if (intent.image.name.endsWith('-byol') && !params.agreement) {
              const currentFunding = await funding(api, intent.project, signal);
              const source = {
                query: createGcpPreflightPort(api, intent.project).query,
                document: fetchGcpByolDocument,
              };
              if (params.approvedPlanHash) {
                const authorization = await authorizeGcpByolTerms(
                  intent,
                  source,
                  currentFunding,
                  store,
                  params.approvedPlanHash,
                  signal,
                );
                return result(tool, { availability: 'byol-terms-authorized', authorization, mutationAttempted: false });
              }
              const plan = await planGcpByolTerms(intent, source, currentFunding, store, signal);
              return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
            }
            if (params.approvedPlanHash) {
              const receipt = await applyGcpMarketplaceAcceptance(port, store, params.approvedPlanHash, () => {
                mutationAttempted = true;
              });
              return result(tool, { availability: 'accepted', receipt, mutationAttempted });
            }
            const plan = await planGcpMarketplaceAcceptance(port, store);
            return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
          } finally {
            await release();
          }
        }
        if (
          (tool === 'gcp_ce_teardown' && params.deploymentName) ||
          (['gcp_ce_plan', 'gcp_ce_apply'].includes(tool) && params.operation === 'teardown')
        ) {
          if (tool === 'gcp_ce_plan' && params.approvedPlanHash)
            throw new Error('Planning tool cannot apply teardown authorization');
          const engine = params.engine ?? 'native';
          if (
            !params.region ||
            !params.deploymentName ||
            !/^[a-z][a-z0-9-]{0,62}$/.test(params.deploymentName) ||
            !params.platformContext ||
            !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(params.platformContext)
          )
            throw new Error('Explicit persisted teardown scope required');
          const platform = await getPlatform();
          const store = await platform.storage({
            deploymentId: params.deploymentName,
            provider: 'gcp',
            engine,
            account: params.project,
            region: params.region,
          });
          const saved = (await store.read(
            engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json',
          )) as { intent?: GcpCeIntent };
          const intent = saved.intent;
          if (
            !intent ||
            intent.project !== params.project ||
            intent.region !== params.region ||
            intent.deploymentName !== params.deploymentName ||
            intent.platformContext !== params.platformContext ||
            intent.engine !== engine
          )
            throw new Error('Persisted teardown intent differs');
          const boundary = await contract(undefined, signal);
          const receipt = await policy();
          if (engine === 'terraform') {
            if (!platform.gcpObservations) throw new Error('Scoped Terraform Platform observations unavailable');
            const observations = await platform.gcpObservations(
              {
                deploymentId: intent.deploymentName,
                provider: 'gcp',
                engine,
                account: intent.project,
                region: intent.region,
              },
              intent.platformContext,
              signal,
            );
            if (!observations.teardown || !observations.terraformEnvironment)
              throw new Error('Qualified Terraform teardown channels unavailable');
            const session = await terraformSession(platform, intent);
            const credentials = await observations.terraformEnvironment();
            const access = await api.exec(
              'gcloud',
              ['auth', 'print-access-token', `--project=${intent.project}`, '--quiet'],
              { signal },
            );
            if (access.exitCode !== 0 || !access.stdout.trim() || /\s/.test(access.stdout.trim()))
              throw new Error('Scoped Terraform Google authentication unavailable');
            const runtime = {
              store,
              session,
              api,
              observePlatform: observations.teardown,
              environment: { ...process.env, ...credentials, GOOGLE_OAUTH_ACCESS_TOKEN: access.stdout.trim() },
            };
            let storedInputs: { inputs?: { configurationVersion?: number } } | undefined;
            try {
              storedInputs = (await store.read('gcp-terraform-session-inputs.json')) as typeof storedInputs;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
            if (storedInputs?.inputs?.configurationVersion === 2) {
              if (params.approvedPlanHash) {
                const evidence = await applyPublicTerraformTeardown(
                  runtime,
                  intent,
                  boundary,
                  receipt,
                  params.approvedPlanHash,
                  signal,
                  () => {
                    mutationAttempted = true;
                  },
                );
                return result(
                  tool,
                  { availability: 'terraform-teardown', ...evidence, mutationAttempted },
                  evidence.state === 'reconciliation-required',
                );
              }
              if (tool === 'gcp_ce_apply') throw new Error('Exact reviewed Terraform cleanup hash required');
              const plan = await planPublicTerraformTeardown(runtime, intent, boundary, receipt, signal);
              return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
            }
            if (params.approvedPlanHash) {
              const evidence = await applyGcpTerraformTeardown(
                runtime,
                intent,
                boundary,
                receipt,
                params.approvedPlanHash,
                signal,
                () => {
                  mutationAttempted = true;
                },
              );
              return result(tool, { availability: 'candidate-terraform-teardown', ...evidence, mutationAttempted });
            }
            if (tool === 'gcp_ce_apply') throw new Error('Exact reviewed Terraform hash required');
            const plan = await planGcpTerraformTeardown(runtime, intent, boundary, receipt, signal);
            return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
          }
          if (params.approvedPlanHash) {
            const evidence = await applyGcpDeploymentTeardown(
              platform,
              api,
              intent,
              params.approvedPlanHash,
              boundary,
              receipt,
              signal,
              () => {
                mutationAttempted = true;
              },
            );
            return result(tool, {
              availability: 'supported-native-teardown',
              ...evidence,
              mutationAttempted,
            });
          }
          if (tool === 'gcp_ce_apply') throw new Error('Exact reviewed hash required');
          const plan = await planGcpDeploymentTeardown(platform, api, intent, boundary, receipt, signal);
          return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
        }
        if (tool === 'gcp_project_identity') {
          const raw = await execGcloudJson<{ projectId?: string; projectNumber?: string; lifecycleState?: string }>(
            api,
            ['projects', 'describe', params.project, `--project=${params.project}`],
            signal,
          );
          if (raw.projectId !== params.project || !/^\d+$/.test(raw.projectNumber ?? ''))
            throw new Error('Project identity mismatch');
          return result(tool, {
            project: raw.projectId,
            projectNumber: raw.projectNumber,
            lifecycleState: raw.lifecycleState,
          });
        }
        if (['gcp_compute_discover', 'gcp_ce_plan'].includes(tool)) {
          if (!params.region) throw new Error('Explicit region required');
          if (
            tool === 'gcp_ce_plan' &&
            (!params.intent ||
              params.intent.project !== params.project ||
              params.intent.region !== params.region ||
              params.intent.engine !== (params.engine ?? 'native'))
          )
            throw new Error('Intent scope/owning engine mismatch');
          if (tool === 'gcp_ce_plan') validateIntent(params.intent as GcpCeIntent);
          const discovery = await discoverGcp(api, params.project, params.region, signal);
          if (tool === 'gcp_compute_discover') return result(tool, { discovery });
          const boundary = await contract(undefined, signal);
          const policyReceipt = await policy();
          const intent = params.intent as GcpCeIntent;
          const profileSupported = supportsGcpLaunchPreflight(intent);
          const prerequisites = profileSupported
            ? await preflight(intent, createGcpPreflightPort(api, params.project), signal)
            : undefined;
          let fundingReceipt: Awaited<ReturnType<typeof collectCurrentGcpCorporateFunding>> | undefined;
          try {
            fundingReceipt = await funding(api, intent.project, signal);
          } catch {
            signal?.throwIfAborted();
          }
          let byolAuthorization: Awaited<ReturnType<typeof assertGcpByolAuthorization>> | undefined;
          if (fundingReceipt && intent.image.name.endsWith('-byol')) {
            try {
              const platform = await getPlatform();
              const store = await platform.storage({
                deploymentId: intent.deploymentName,
                provider: 'gcp',
                engine: intent.engine,
                account: intent.project,
                region: intent.region,
              });
              byolAuthorization = await assertGcpByolAuthorization(
                intent,
                { query: createGcpPreflightPort(api, intent.project).query, document: fetchGcpByolDocument },
                fundingReceipt,
                store,
                signal,
              );
            } catch {
              signal?.throwIfAborted();
            }
          }
          const plan = planGcpCe(
            intent,
            discovery,
            Date.now(),
            policyReceipt,
            prerequisites,
            fundingReceipt,
            byolAuthorization,
          );
          return result(tool, { availability: 'unavailable', boundary, plan });
        }
        if (['gcp_ce_inventory', 'gcp_ce_status', 'gcp_ce_diagnose'].includes(tool)) {
          if (!params.deploymentName || !/^[a-z][a-z0-9-]{0,62}$/.test(params.deploymentName))
            throw new Error('Exact deployment name required');
          if (['gcp_ce_status', 'gcp_ce_diagnose'].includes(tool) && params.platformContext) {
            if (!params.region || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(params.platformContext))
              throw new Error('Explicit region and persisted platform context required');
            const platform = await getPlatform();
            if (!platform.gcpObservations) throw new Error('Shared GCP observations unavailable');
            const owner = {
              deploymentId: params.deploymentName,
              provider: 'gcp' as const,
              engine: params.engine ?? 'native',
              account: params.project,
              region: params.region,
            };
            const store = await platform.storage(owner);
            const saved = (await store.read(
              owner.engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json',
            )) as { intent?: GcpCeIntent; platformContext?: string };
            if (
              !saved?.intent ||
              saved.platformContext !== params.platformContext ||
              saved.intent.platformContext !== params.platformContext ||
              saved.intent.engine !== owner.engine ||
              saved.intent.project !== params.project ||
              saved.intent.region !== params.region ||
              saved.intent.deploymentName !== params.deploymentName
            )
              throw new Error('Persisted deployment intent/context differs');
            const observations = await platform.gcpObservations(owner, params.platformContext, signal);
            const evidence = await observeGcpOwnedDeployment(
              store,
              saved.intent,
              (node, zone) => ({
                cloud: () =>
                  execGcloudJson(
                    api,
                    [
                      'compute',
                      'instances',
                      'describe',
                      node,
                      `--project=${params.project}`,
                      `--zone=${zone}`,
                      '--format=json(id,name,zone,status,networkInterfaces)',
                    ],
                    signal,
                  ),
                ...observations,
              }),
              signal,
            );
            return result(tool, { availability: 'read-only', evidence, mutationAttempted: false });
          }
          const raw = await execGcloudJson<Array<Record<string, unknown>>>(
            api,
            [
              'compute',
              'instances',
              'list',
              `--project=${params.project}`,
              `--filter=labels.xcsh-deployment=${params.deploymentName}`,
              '--format=json(id,name,zone,status,labels)',
            ],
            signal,
          );
          if (!Array.isArray(raw)) throw new Error('Malformed inventory');
          // Allowlist fields: never export metadata, startup scripts, service accounts or bootstrap.
          const instances = raw
            .filter(
              (r) => (r.labels as Record<string, string> | undefined)?.['xcsh-deployment'] === params.deploymentName,
            )
            .map((r) => ({
              id: r.id,
              name: r.name,
              zone: r.zone,
              status: r.status,
              ownership: 'candidate-label-only',
            }));
          return result(tool, {
            schemaVersion: 1,
            project: params.project,
            deploymentName: params.deploymentName,
            observedAt: new Date().toISOString(),
            instances,
            cloudProvisioning: 'observed',
            ...UNKNOWN,
            absence: 'not-established',
            owningEngine: 'not-established',
          });
        }
        const boundary = await contract(undefined, signal);
        return result(
          tool,
          {
            availability: 'unavailable',
            reason: boundary.reason,
            boundary,
            engine: params.engine ?? 'native',
            mutationAttempted: false,
            required: [
              'qualified GCP API/policy mappings',
              'shared Platform CE runtime',
              'owning-engine deployment ledger',
              ...(params.engine === 'terraform' ? ['shared Terraform GCP runner'] : []),
            ],
          },
          true,
        );
      } catch (error) {
        signal?.throwIfAborted();
        // Cloud errors and caller-controlled fields can contain private values.
        return result(
          tool,
          {
            availability: 'unavailable',
            reason: mutationAttempted
              ? tool === 'gcp_marketplace_agreement'
                ? 'consent_requires_reconciliation'
                : params.operation === 'deploy'
                  ? 'deployment_requires_reconciliation'
                  : 'teardown_requires_reconciliation'
              : error instanceof GcpMarketplaceUnavailable
                ? error.reason
                : 'validation_or_read_failed',
            mutationAttempted,
            ...(error instanceof GcpMarketplaceUnavailable ? gcpMarketplacePrerequisiteGuidance(error.reason) : {}),
          },
          true,
        );
      }
    },
  }));
}
