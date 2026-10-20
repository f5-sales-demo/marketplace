import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

type Section = ReturnType<PresentationAPI['data']>[number];
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
const count = (value: unknown) => (Array.isArray(value) ? value.length : 'Unknown');
const has = (value: Record<string, unknown>) => Object.keys(value).length > 0;
/** Interpret the existing domain envelopes. Raw user data and guest logs stay withheld. */
export function ceSummary(name: string, details: Record<string, unknown>): Section[] | undefined {
  const inventory = record(details.inventory);
  if (
    name === 'azure_ce_inventory' &&
    typeof inventory.subscriptionId === 'string' &&
    Array.isArray(inventory.deployments)
  )
    return [
      fields(
        {
          'Subscription ID': inventory.subscriptionId,
          'Observed at': inventory.observedAt,
          'Caller source': inventory.callerSource,
          'Platform evidence': inventory.platformEvidence,
          ...record(inventory.counts),
          ...record(inventory.coverage),
          'Artifact ID': details.artifactId,
          'SHA-256': details.digestSha256,
        },
        'Customer Edge inventory',
      ),
      {
        kind: 'table',
        title: 'Deployments',
        rows: Array.isArray(inventory.deployments) ? inventory.deployments : [],
        columns: [
          { key: 'resourceGroup', label: 'Resource group' },
          { key: 'classification', label: 'Classification' },
          { key: 'confidence', label: 'Confidence' },
          { key: 'dimensions', label: 'Observed states' },
        ],
        previewRows: 12,
      },
    ];
  const observation = record(details.observation);
  if (name === 'azure_compute_discover' && has(record(observation.subscription)) && Array.isArray(observation.regions))
    return [
      fields(
        {
          ...record(observation.subscription),
          'Image URN': record(observation.image).urn,
          'Terms accepted': record(observation.image).termsAccepted,
          'Observed regions': count(observation.regions),
          'Observed resources': count(observation.resources),
          'Artifact ID': details.artifactId,
        },
        'Compute discovery',
      ),
    ];
  const plan = record(details.plan);
  if (name === 'azure_ce_plan' && typeof plan.planId === 'string' && Array.isArray(plan.actions))
    return [
      fields(
        {
          'Plan ID': plan.planId,
          'SHA-256': plan.planSha256,
          Region: plan.region,
          'Site name': plan.siteName,
          Namespace: plan.namespace,
          Nodes: record(plan.topology).nodeCount,
          'NICs per node': count(plan.nics),
          'Image URN': record(plan.image).urn,
          'Routing mode': record(plan.routing).mode,
          'Ordered actions': count(plan.actions),
          Warnings: plan.warnings,
          'Billable resources': plan.billableResources,
          'Artifact ID': details.artifactId,
        },
        'Immutable plan',
      ),
    ];
  const checkpoint = record(details.checkpoint);
  if (name === 'azure_ce_apply' && has(checkpoint))
    return [
      fields(
        {
          'Plan ID': details.planId,
          State: checkpoint.state,
          'Completed actions': count(checkpoint.completedActionIds),
          'Failed action': checkpoint.failedActionId,
        },
        'Checkpoint',
      ),
    ];
  const evidence = record(details.evidence),
    azure = record(evidence.azure),
    f5 = record(evidence.f5);
  if (name === 'azure_ce_status' && has(record(evidence.checkpoint)) && has(record(evidence.azure)))
    return [
      fields(
        {
          'Plan ID': evidence.planId,
          State: record(evidence.checkpoint).state,
          'Completed actions': count(record(evidence.checkpoint).completedActionIds),
          'Resource records': count(azure.resources),
          'VM records': count(azure.vms),
          Coverage: azure.coverage,
          'Routing mode': evidence.routingMode,
          'Route Server peers': count(azure.routeServerPeers),
          'Site state': f5.siteState,
          Nodes: f5.nodes,
          'BGP established': f5.bgpEstablished,
          'Learned routes': f5.learnedRouteCount,
        },
        'Customer Edge status',
      ),
    ];
  if (name === 'azure_ce_diagnose' && Array.isArray(details.diagnostics))
    return [
      fields(
        {
          Mode: details.mode,
          Checks: details.diagnostics.length,
          Findings: details.diagnostics.filter((value) => {
            const item = record(value);
            return item.ok === false || item.errorsDetected === true;
          }).length,
          ...record(details.f5),
          'Raw output': 'Withheld by the domain tool',
        },
        'Diagnostics',
      ),
    ];
  const analysis = record(details.analysis),
    boot = record(details.bootEvidence);
  if (name === 'azure_cloud_init_analyze' && (has(analysis) || has(boot)))
    return [
      ...(has(analysis) ? [fields(analysis, 'cloud-init analysis')] : []),
      ...(has(boot) ? [fields(boot, 'Boot evidence')] : []),
    ];
  return undefined;
}
