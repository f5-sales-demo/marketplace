import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };
type Options = { expanded: boolean; isPartial: boolean };
type Section = ReturnType<PresentationAPI['data']>[number];
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const rows = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
function validConfig(value: unknown) {
  const c = record(value);
  return (
    typeof c.provider === 'string' &&
    typeof c.haMode === 'string' &&
    rows(c.vrfs) &&
    c.vrfs.every((v) => typeof v.name === 'string' && typeof v.index === 'number') &&
    rows(c.interfaces) &&
    c.interfaces.every(
      (n) =>
        typeof n.index === 'number' &&
        typeof n.role === 'string' &&
        typeof n.vrf === 'string' &&
        typeof record(n.addressing).mode === 'string' &&
        strings(record(n.addressing).addresses),
    ) &&
    rows(c.bgpPeers) &&
    typeof record(c.providerNetwork).profile === 'string'
  );
}

/** Domain data only. These HTTP tools have no executable CLI equivalent. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const scope = (input: unknown): Section[] => {
    const labels: Record<string, string> = {
      action: 'Operation',
      namespace: 'Namespace',
      siteName: 'Site',
      nodeName: 'Node',
      expiresInSeconds: 'Requested lifetime (seconds)',
      expectedEtag: 'Expected ETag',
      planSha256: 'Approved plan SHA-256',
    };
    const values = Object.fromEntries(
      Object.entries(record(input))
        .filter(([k]) => k in labels)
        .map(([k, v]) => [labels[k], v]),
    );
    return Object.keys(values).length ? [fields(values, 'Scope')] : [];
  };
  const table = (
    items: Record<string, unknown>[],
    columns: { key: string; label: string }[],
    title: string,
  ): Section => ({ ...p.table(items, columns, title), previewRows: 12 });
  const network = (c: Record<string, unknown>): Section[] => [
    fields(
      {
        Provider: c.provider,
        'HA mode': c.haMode,
        'Network profile': record(c.providerNetwork).profile,
        VRFs: (c.vrfs as unknown[]).length,
        Interfaces: (c.interfaces as unknown[]).length,
        'BGP peers': (c.bgpPeers as unknown[]).length,
      },
      'Network summary',
    ),
    table(
      c.vrfs as Record<string, unknown>[],
      [
        { key: 'index', label: 'Index' },
        { key: 'name', label: 'VRF' },
      ],
      'VRFs',
    ),
    table(
      (c.interfaces as Record<string, unknown>[]).map((n) => ({
        index: n.index,
        role: n.role,
        vrf: n.vrf,
        addressingMode: record(n.addressing).mode,
        addresses: record(n.addressing).addresses,
        gateway: record(n.addressing).gateway,
      })),
      [
        { key: 'index', label: 'Index' },
        { key: 'role', label: 'Role' },
        { key: 'vrf', label: 'VRF' },
        { key: 'addressingMode', label: 'Addressing mode' },
        { key: 'addresses', label: 'Addresses' },
        { key: 'gateway', label: 'Gateway' },
      ],
      'Interfaces',
    ),
    table(
      c.bgpPeers as Record<string, unknown>[],
      [
        { key: 'index', label: 'Index' },
        { key: 'vrf', label: 'VRF' },
        { key: 'interfaceIndex', label: 'Interface index' },
        { key: 'peerAddress', label: 'Peer address' },
        { key: 'localAsn', label: 'Local ASN' },
        { key: 'peerAsn', label: 'Peer ASN' },
      ],
      'BGP peers',
    ),
    ...(Object.keys(record(record(c.providerNetwork).metadata)).length
      ? [fields(record(record(c.providerNetwork).metadata), 'Provider network metadata')]
      : []),
  ];
  return p.withPresentation(tool, {
    call: (input: unknown, options: Options) => ({
      summary: tool.label ?? tool.name,
      sections: options.expanded ? p.data(input, 'Complete request') : scope(input),
    }),
    result: (result: Result, options: Options, input: unknown) => {
      const d = record(result.details),
        base = scope(input);
      const texts: Section[] = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code',
          title: result.isError ? 'Complete corrective guidance' : 'Guidance',
          text: b.text ?? '',
        }));
      if (result.isError)
        return {
          summary: 'Platform operation failed',
          sections: [...base, ...p.data(d, 'Failure evidence'), ...texts],
        };
      const complete = (summary: string, sections: Section[], warnings: string[] = []) => ({
        summary,
        expandedEvidence: 'provided' as const,
        sections: [
          ...base,
          ...(options.expanded
            ? p.data(
                typeof d.artifactId === 'string' && d.artifactId
                  ? { ...d, artifactId: `artifact://${d.artifactId}` }
                  : d,
                'Complete safe evidence',
              )
            : sections),
        ],
        warnings,
      });
      const c = record(d.capabilities),
        tgw = record(c.awsSmsv2TgwConnect),
        kvm = record(c.kvmImageResolution);
      if (
        tool.name === 'f5xc_ce_v2_capabilities' &&
        typeof c.smsv2ContractVersion === 'string' &&
        strings(c.supportedProviders) &&
        strings(c.bootstrapDrivers) &&
        Object.values(record(c.providerNetworkingProfiles)).every(strings) &&
        typeof tgw.supported === 'boolean' &&
        typeof kvm.id === 'string'
      ) {
        return complete(
          'Secure Mesh Site v2 capabilities',
          [
            fields(
              {
                Contract: c.smsv2ContractVersion,
                Providers: c.supportedProviders,
                'Bootstrap drivers': c.bootstrapDrivers,
                'AWS TGW Connect supported': tgw.supported,
                'AWS TGW Connect schema': tgw.schemaVersion,
              },
              'Capability summary',
            ),
            table(
              Object.entries(record(c.providerNetworkingProfiles)).flatMap(([provider, profiles]) =>
                (profiles as string[]).map((profile) => ({ provider, profile })),
              ),
              [
                { key: 'provider', label: 'Provider' },
                { key: 'profile', label: 'Networking profile' },
              ],
              'Networking profiles',
            ),
            fields({ ID: kvm.id, Endpoint: kvm.endpoint, Operation: kvm.operation }, 'KVM image resolution'),
          ],
          ['Capabilities do not establish site runtime health or authorize bootstrap checkout.'],
        );
      }
      const plan = record(d.plan);
      if (
        tool.name === 'f5xc_ce_v2_site' &&
        plan.schemaVersion === 2 &&
        typeof plan.planId === 'string' &&
        typeof plan.planSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(plan.planSha256) &&
        ['create', 'update', 'delete'].includes(String(plan.action)) &&
        (plan.config === null || validConfig(plan.config))
      ) {
        return complete(
          'Secure Mesh Site v2 plan',
          [
            fields(
              {
                Operation: plan.action,
                Site: plan.siteName,
                Namespace: plan.namespace,
                'Plan ID': plan.planId,
                'Plan SHA-256': plan.planSha256,
                Artifact:
                  typeof d.artifactId === 'string' && d.artifactId
                    ? `artifact://${d.artifactId}`
                    : 'session memory only',
                'Expected ETag': plan.expectedEtag,
                Mutation: 'not attempted',
              },
              'Site plan',
            ),
            ...(plan.config === null ? [] : network(record(plan.config))),
          ],
          ['A plan does not establish approval or an applied mutation.'],
        );
      }
      const site = record(d.site),
        config = record(site.spec),
        metadata = record(site.metadata);
      if (tool.name === 'f5xc_ce_v2_site' && validConfig(config)) {
        return complete(
          'Secure Mesh Site v2 configuration',
          [
            fields(
              {
                Site: metadata.name ?? record(input).siteName,
                Namespace: metadata.namespace ?? record(input).namespace,
                ETag: site.etag ?? 'unknown',
                Provider: config.provider,
                'HA mode': config.haMode,
                ...(d.planId !== undefined ? { 'Applied plan ID': d.planId } : {}),
              },
              'Site identity',
            ),
            ...network(config),
          ],
          ['Configuration evidence does not establish site runtime health.'],
        );
      }
      if (
        tool.name === 'f5xc_ce_v2_bootstrap' &&
        typeof d.reference === 'string' &&
        d.reference.startsWith('f5xc-ce://') &&
        (typeof d.expiresAt === 'number' || typeof d.expiresAt === 'string')
      ) {
        return complete('Session-bound bootstrap reference', [
          fields({ Reference: d.reference, 'Expires at': d.expiresAt }, 'Bootstrap reference'),
        ]);
      }
      if (tool.name === 'f5xc_ce_v2_status' && d.capability === 'unavailable' && d.reason === 'runtime_status') {
        return {
          summary: 'Secure Mesh Site v2 telemetry unavailable',
          sections: [
            ...base,
            fields({ Availability: d.capability, Reason: d.reason, Health: 'unknown' }, 'Telemetry availability'),
            ...(options.expanded ? p.data(d, 'Availability evidence') : []),
            ...texts,
          ],
        };
      }
      return { sections: [...base, ...texts] };
    },
  });
}
