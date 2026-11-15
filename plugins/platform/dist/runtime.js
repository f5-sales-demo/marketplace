// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import {
  createCePlatformService,
  registerCePlatformService,
  requestTerraformResourceMutation,
} from './runtime-d13c8c0b.js';

// plugins/platform/src/presentation.ts
var record = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
var rows = (v) => Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
var strings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
var fields = (values, title) => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
function validConfig(value) {
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
function presentTool(tool, p) {
  const scope = (input) => {
    const labels = {
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
  const table = (items, columns, title) => ({ ...p.table(items, columns, title), previewRows: 12 });
  const network = (c) => [
    fields(
      {
        Provider: c.provider,
        'HA mode': c.haMode,
        'Network profile': record(c.providerNetwork).profile,
        VRFs: c.vrfs.length,
        Interfaces: c.interfaces.length,
        'BGP peers': c.bgpPeers.length,
      },
      'Network summary',
    ),
    table(
      c.vrfs,
      [
        { key: 'index', label: 'Index' },
        { key: 'name', label: 'VRF' },
      ],
      'VRFs',
    ),
    table(
      c.interfaces.map((n) => ({
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
      c.bgpPeers,
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
    call: (input, options) => ({
      summary: tool.label ?? tool.name,
      sections: options.expanded ? p.data(input, 'Complete request') : scope(input),
    }),
    result: (result, options, input) => {
      const d = record(result.details),
        base = scope(input);
      const texts = result.content
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
      const complete = (summary, sections, warnings = []) => ({
        summary,
        expandedEvidence: 'provided',
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
                profiles.map((profile) => ({ provider, profile })),
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

// plugins/platform/src/index.ts
function activeContextEnvironment(pi, settings) {
  const environment = { ...process.env };
  const configured = (settings ?? pi.settings)?.get('bash.environment');
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return environment;
  for (const [name, value] of Object.entries(configured)) {
    if (/^XCSH_[A-Z0-9_]+$/.test(name) && typeof value === 'string' && process.env[name] === undefined)
      environment[name] = value;
  }
  return environment;
}
var factory = async (pi) => {
  const presentTool2 = (tool) => presentTool(tool, pi.presentation);
  pi.setLabel('F5 Distributed Cloud Platform');
  let sessionSettings;
  const observeSession = (_event, context) => {
    sessionSettings = context.settings;
  };
  pi.on?.('session_start', observeSession);
  pi.on?.('context', observeSession);
  pi.integrations.register({
    id: 'platform',
    name: 'F5 Distributed Cloud Platform',
    plugin: 'platform',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: ['XCSH_API_URL', 'XCSH_API_TOKEN', 'XCSH_TENANT'],
      profileFields: [],
      steps: [],
      verification: [],
      guidedAction: { kind: 'context_wizard' },
    },
    async probe() {
      const environment = activeContextEnvironment(pi, sessionSettings);
      const url = environment.XCSH_API_URL;
      const token = environment.XCSH_API_TOKEN;
      const tenant = environment.XCSH_TENANT;
      if (!url || !token || !tenant) return { state: 'setup_required', reason: 'not_authenticated' };
      try {
        new URL(url);
        return { state: 'ready', value: { tenantConfigured: true } };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
  });
  const service = createCePlatformService(
    () => activeContextEnvironment(pi, sessionSettings),
    undefined,
    (contextName, tenantOrigin) => {
      if (!pi.events) throw new Error('Terraform platform service is unavailable');
      return requestTerraformResourceMutation(pi.events, contextName, tenantOrigin);
    },
  );
  if (pi.events) registerCePlatformService(pi.events, service);
  const makeService = (context) => {
    if (context?.settings) sessionSettings = context.settings;
    return service;
  };
  if (typeof pi.registerTool !== 'function') return;
  const { createF5xcCeV2SiteTool } = await import('./runtime-9cctakkf.js');
  const { createF5xcCeV2BootstrapTool } = await import('./runtime-ckzns5aw.js');
  const { createF5xcCeV2StatusTool } = await import('./runtime-x0wpf92c.js');
  const { createF5xcCeV2CapabilitiesTool } = await import('./runtime-bv9agd7a.js');
  pi.registerTool(presentTool2(createF5xcCeV2CapabilitiesTool(pi, makeService)));
  pi.registerTool(presentTool2(createF5xcCeV2SiteTool(pi, makeService)));
  pi.registerTool(presentTool2(createF5xcCeV2BootstrapTool(pi, makeService)));
  pi.registerTool(presentTool2(createF5xcCeV2StatusTool(pi, makeService)));
};
var src_default = factory;

export { src_default as default };
