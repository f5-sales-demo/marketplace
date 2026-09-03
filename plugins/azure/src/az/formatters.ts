import type {
  AzActivityLogResult,
  AzResource,
  AzResourceGroup,
  AzSubscription,
  AzVm,
  VmDisclosurePolicy,
} from './types';

export function formatSubscriptionTable(subs: AzSubscription[]): string {
  if (subs.length === 0) return 'No subscriptions found.';
  const header = '| Name | ID | State | Default | Tenant |';
  const sep = '|------|-----|-------|---------|--------|';
  const rows = subs.map((s) => `| ${s.name} | ${s.id} | ${s.state} | ${s.isDefault ? 'Yes' : 'No'} | ${s.tenantId} |`);
  return [header, sep, ...rows].join('\n');
}

export function formatSubscriptionDetail(sub: AzSubscription): string {
  return [
    `**Subscription:** ${sub.name}`,
    `**ID:** ${sub.id}`,
    `**State:** ${sub.state}`,
    `**Default:** ${sub.isDefault ? 'Yes' : 'No'}`,
    `**Tenant:** ${sub.tenantId}`,
    `**User:** ${sub.user.name} (${sub.user.type})`,
  ].join('\n');
}

export function formatResourceGroupTable(groups: AzResourceGroup[]): string {
  if (groups.length === 0) return 'No resource groups found.';
  const header = '| Name | Location | State | Tags |';
  const sep = '|------|----------|-------|------|';
  const rows = groups.map((g) => {
    const tags =
      Object.entries(g.tags)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ') || '-';
    return `| ${g.name} | ${g.location} | ${g.provisioningState} | ${tags} |`;
  });
  return [header, sep, ...rows].join('\n');
}

export function formatResourceTable(resources: AzResource[]): string {
  if (resources.length === 0) return 'No resources found.';
  const header = '| Name | Type | Location | Resource Group | State |';
  const sep = '|------|------|----------|----------------|-------|';
  const rows = resources.map(
    (r) => `| ${r.name} | ${r.type} | ${r.location} | ${r.resourceGroup} | ${r.provisioningState} |`,
  );
  return [header, sep, ...rows].join('\n');
}

export function formatVmTable(
  vms: AzVm[],
  policy: VmDisclosurePolicy = { includePowerState: true, includeNetworkIdentifiers: false },
): string {
  if (vms.length === 0) return 'No VMs found.';
  const headings = ['Name', 'Resource Group', 'Location', 'VM Size', 'OS', 'State'];
  if (policy.includePowerState) headings.push('Power');
  if (policy.includeNetworkIdentifiers) headings.push('Public IPs', 'FQDNs');
  const header = `| ${headings.join(' | ')} |`;
  const sep = `|${headings.map(() => '---').join('|')}|`;
  const rows = vms.map((vm) => {
    const fields = [vm.name, vm.resourceGroup, vm.location, vm.vmSize, vm.osType, vm.provisioningState];
    if (policy.includePowerState) fields.push(vm.powerState || '-');
    if (policy.includeNetworkIdentifiers) {
      fields.push(vm.publicIps?.join(', ') || '-', vm.fqdns?.join(', ') || '-');
    }
    return `| ${fields.join(' | ')} |`;
  });
  return [header, sep, ...rows].join('\n');
}

export function formatActivityLogEvidence(result: AzActivityLogResult): string {
  const { coverage, scopeEvidence, events } = result;
  const lines = [
    `Activity Log coverage: ${coverage.startTime} through ${coverage.endTime} (${coverage.lookbackDays} days; ${coverage.complete ? 'complete' : 'incomplete'})`,
    `Scope evidence: ${scopeEvidence.evidenceType} (${scopeEvidence.confidence}; ${scopeEvidence.reasonCode})`,
    'Caller evidence is historical operation provenance, not resource ownership.',
  ];
  if (events.length === 0) {
    lines.push('No matching event was observed in the returned coverage.');
    return lines.join('\n');
  }
  lines.push('| Time (UTC) | Operation | Scope | Caller | Caller kind | Evidence |');
  lines.push('|---|---|---|---|---|---|');
  for (const event of events) {
    lines.push(
      `| ${event.eventTime} | ${event.operation} | ${event.scopeType} | ${event.callerDisplay || '-'} | ${event.callerKind} | ${event.evidenceType} (${event.reasonCode}) |`,
    );
  }
  return lines.join('\n');
}
