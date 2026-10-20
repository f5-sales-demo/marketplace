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

/** Interpret only the existing secret-free CE result contract, never raw console/user-data. */
export function ceSummary(name: string, details: Record<string, unknown>): Section[] | undefined {
  const checkpoint = record(details.checkpoint);
  if (name === 'aws_ce_apply' && Object.keys(checkpoint).length)
    return [
      fields(
        {
          'Plan ID': details.planId,
          'Plan SHA-256': details.planSha256,
          State: checkpoint.state,
          'Completed actions': count(checkpoint.completedActionIds),
        },
        'Checkpoint',
      ),
    ];
  const plan = record(details.plan);
  if (name === 'aws_ce_plan' && Object.keys(plan).length)
    return [
      fields(
        {
          'Plan ID': plan.planId,
          'Plan SHA-256': plan.planSha256,
          Region: plan.region,
          Nodes: record(plan.topology).nodeCount,
          'AMI ID': record(plan.image).id,
          'Ordered actions': count(plan.actions),
        },
        'Immutable plan',
      ),
    ];
  const observation = record(details.observation);
  if (name === 'aws_compute_discover' && Object.keys(observation).length)
    return [
      fields(
        {
          ...record(observation.identity),
          'Agreement active': record(observation.agreement).active,
          'Observed regions': count(observation.regions),
          'Artifact ID': details.artifactId,
        },
        'Compute discovery',
      ),
    ];
  const status = record(details.status);
  if (name === 'aws_ce_status' && Object.keys(status).length)
    return [
      fields(
        {
          State: record(status.checkpoint).state,
          'Instance records': record(record(status.aws).instances).count,
          'ENI records': record(record(status.aws).enis).count,
          ...record(status.f5),
        },
        'Customer Edge status',
      ),
    ];
  if (name === 'aws_ce_diagnose' && Array.isArray(details.results))
    return [
      fields(
        {
          Mode: details.mode,
          'Evidence digests': details.results.length,
          'Require review': details.results.filter((value) => {
            const r = record(value);
            return r.ok === false || r.errorsDetected === true;
          }).length,
          'Raw output': 'Withheld by the domain tool',
        },
        'Diagnostics',
      ),
    ];
  const analysis = record(details.analysis);
  const boot = record(details.bootEvidence);
  if (name === 'aws_cloud_init_analyze' && (Object.keys(analysis).length || Object.keys(boot).length))
    return [
      ...(Object.keys(analysis).length ? [fields(analysis, 'cloud-init analysis')] : []),
      ...(Object.keys(boot).length ? [fields(boot, 'Boot evidence')] : []),
    ];
  return undefined;
}
