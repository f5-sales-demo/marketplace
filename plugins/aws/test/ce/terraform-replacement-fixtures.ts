import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAwsSiteReplacement } from '../../src/ce/site-replacement';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import { awsTerraformReplacementStages } from '../../src/ce/terraform-replacement-stages';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const bootstrap = (name: string) =>
  `#cloud-config\nhostname: ${name}\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture\n`;
export function terraformReplacementFixture(ha = false) {
  const { planId: _id, planSha256: _sha, ...draft } = foundationPlan(ha);
  const value = {
    ...draft,
    deploymentName: 'ce',
    partition: 'aws' as const,
    accountId: '123456789012',
    region: 'us-east-1',
  };
  const digest = canonicalSha256(value);
  const base = { ...value, planId: `aws-ce-${digest.slice(0, 24)}`, planSha256: digest };
  const selected = siteBindings(base)[0];
  const preparation = {
    owner: selected.binding.owner,
    siteName: selected.site.name,
    uid: 'old-site',
    resourceVersion: 'one',
    contractFingerprint: `sha256:${'a'.repeat(64)}`,
    observedAt: new Date().toISOString(),
    source: `/api/config/namespaces/system/securemesh_site_v2s/${selected.site.name}`,
    deviceSource: `/api/register/namespaces/system/registrations_by_site/${selected.site.name}`,
    evidenceKind: 'preboot-interface-configuration-required',
    request: { metadata: { name: selected.site.name }, spec: {} },
    instances: Object.fromEntries(selected.binding.nodes.map((node, index) => [node, `i-${12345678 + index}`])),
    interfaces: selected.binding.nodes.flatMap((node, index) =>
      ['slo', 'sli'].map((role, nic) => ({
        node,
        role,
        mac: `02:00:00:00:0${index + 1}:0${nic + 1}`,
        device: `ens${5 + nic}`,
        mtu: 1500,
      })),
    ),
  };
  const replacement = compileAwsSiteReplacement(base, selected.site.name, preparation, {
    interfaceIds: Object.fromEntries(
      preparation.interfaces.map((iface, index) => [`${iface.node}/${iface.role}`, `eni-${12345678 + index}`]),
    ),
    elasticIpAllocationIds: Object.fromEntries(
      selected.binding.nodes.map((node, index) => [node, `eipalloc-${12345678 + index}`]),
    ),
    bootstrapTokenNames: Object.fromEntries(
      selected.binding.nodes.map((node, index) => [node, `observed-token-${index + 1}`]),
    ),
  });
  const original = JSON.parse(
    renderAwsTerraformFoundation(
      base,
      Object.fromEntries([1, 2, 3].map((node) => [String(node), bootstrap(`ce-${node}`)])),
    ),
  );
  // Existing routing configuration must survive both stages unchanged.
  original.resource.aws_ec2_transit_gateway_connect_peer = { existing: { peer_address: '10.0.4.10' } };
  const configuration = JSON.stringify(original);
  const stages = awsTerraformReplacementStages(base, replacement, configuration, hash(configuration));
  const material = Object.fromEntries(
    selected.binding.nodes.map((node) => [node, bootstrap(node).replace('fixture', 'new-fixture')]),
  );
  const receipt = (phase: 'quiesce' | 'launch'): PlanReceipt => ({
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: 'ce',
    backendIdentity: 'local:ce',
    configurationSha256: (phase === 'quiesce' ? stages.quiesce : stages.launch(material)).configurationSha256,
    providerLockSha256: 'a'.repeat(64),
    planSha256: 'b'.repeat(64),
    noChanges: false,
    changes: stages.quiesce.addresses.map((address) => ({
      address,
      type: address.split('.')[0],
      actions: [phase === 'quiesce' ? 'delete' : 'create'],
    })),
  });
  return { base, replacement, configuration, original, stages, material, receipt };
}
