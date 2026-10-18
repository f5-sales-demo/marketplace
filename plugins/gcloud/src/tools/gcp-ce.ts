import { CE_SERVICE_CHANNEL, type CePlatformService } from '../../../platform/src/ce/service';
import { resolveGcpContract } from '../ce/contract';
import { applyGcpDeploymentTeardown, planGcpDeploymentTeardown } from '../ce/deployment-teardown';
import { discoverGcp } from '../ce/discovery';
import { observeGcpOwnedDeployment } from '../ce/owned-status';
import { planGcpCe } from '../ce/planner';
import { readGcpCePolicy } from '../ce/policy';
import { collectGcpLaunchPreflight } from '../ce/preflight';
import { createGcpPreflightPort } from '../ce/preflight-port';
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
) {
  const { Type } = pi.typebox;
  const definitions = [
    ['gcp_project_identity', 'Read explicit GCP project identity. Does not change the active project or authenticate.'],
    [
      'gcp_compute_discover',
      'Discover exact F5 images and licenses, billing, APIs, machines and quotas for an explicit project/region. Unknown prerequisites remain explicit.',
    ],
    [
      'gcp_ce_inventory',
      'List cloud instances labeled for a CE deployment. Labels are candidate ownership only; platform registration, interface identity and traffic remain unknown.',
    ],
    [
      'gcp_ce_plan',
      'Return a non-executable deployment readiness plan, or an exact owned native teardown review when operation=teardown. Never accepts caller discovery/health evidence.',
    ],
    [
      'gcp_ce_apply',
      'Apply an exact reviewed native single-node teardown plan when operation=teardown and approvedPlanHash is supplied. Other mutations report unavailable.',
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
      'Prepare a native single-node teardown plan from exact deployment ownership. Apply only with its approvedPlanHash; labels alone never authorize deletion.',
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
      intent: Type.Optional(Type.Unknown({ description: 'Versioned GCP CE intent; only used by gcp_ce_plan' })),
      operation: Type.Optional(
        Type.Literal('teardown', { description: 'Use the owned teardown plan/apply lifecycle' }),
      ),
      approvedPlanHash: Type.Optional(
        Type.String({ description: 'Exact SHA-256 of the saved teardown plan explicitly approved for execution' }),
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
        operation?: 'teardown';
        approvedPlanHash?: string;
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
        if (
          (tool === 'gcp_ce_teardown' && params.deploymentName) ||
          (['gcp_ce_plan', 'gcp_ce_apply'].includes(tool) && params.operation === 'teardown')
        ) {
          if (tool === 'gcp_ce_plan' && params.approvedPlanHash)
            throw new Error('Planning tool cannot apply teardown authorization');
          if ((params.engine ?? 'native') !== 'native') throw new Error('Teardown cannot change owning engine');
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
            engine: 'native',
            account: params.project,
            region: params.region,
          });
          const saved = (await store.read('gcp-deployment-intent.json')) as { intent?: GcpCeIntent };
          const intent = saved.intent;
          if (
            !intent ||
            intent.project !== params.project ||
            intent.region !== params.region ||
            intent.deploymentName !== params.deploymentName ||
            intent.platformContext !== params.platformContext ||
            intent.engine !== 'native'
          )
            throw new Error('Persisted teardown intent differs');
          const boundary = await contract(undefined, signal);
          const receipt = await policy();
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
          const profileSupported =
            intent.sites.length === 1 &&
            intent.sites[0].nodes.length === 1 &&
            intent.sites[0].nodes[0].interfaces.length === 2 &&
            intent.sites[0].nodes[0].interfaces[1].role === 'sli' &&
            intent.egress.mode === 'external-ip';
          const prerequisites = profileSupported
            ? await preflight(intent, createGcpPreflightPort(api, params.project), signal)
            : undefined;
          const plan = planGcpCe(intent, discovery, Date.now(), policyReceipt, prerequisites);
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
      } catch {
        signal?.throwIfAborted();
        // Cloud errors and caller-controlled fields can contain private values.
        return result(
          tool,
          {
            availability: 'unavailable',
            reason: mutationAttempted ? 'teardown_requires_reconciliation' : 'validation_or_read_failed',
            mutationAttempted,
          },
          true,
        );
      }
    },
  }));
}
