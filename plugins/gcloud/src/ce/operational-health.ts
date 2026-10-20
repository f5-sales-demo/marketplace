import { fingerprint } from './discovery';

export const GCP_OPERATIONAL_CORE_SEED = [
  'argo',
  'asaf',
  'aspen',
  'bdbewaf',
  'clank',
  'envoy',
  'etcd',
  'frr',
  'gubernator',
  'ike',
  'keepalived',
  'komodo',
  'obelix',
  'openvpn',
  'opera',
  'pmtud',
  'ver',
] as const;
export const GCP_OPERATIONAL_DEPENDENCIES = ['coredns', 'kube-proxy', 'kube-multus-ds'] as const;
export const GCP_OPERATIONAL_AUXILIARIES = ['vector-agent', 'voucher', 'kube-state-metrics'] as const;
export type OperationalState = 'healthy' | 'degraded' | 'unknown';
export interface OperationalProfile {
  schemaVersion: 2;
  scope: 'original-three-node-operational-health';
  maximumAgeMs: 300000;
  minimumRoundIntervalMs: 45000;
  sourceHashes: Record<string, string>;
  parserVersions: Record<string, string>;
  roles: Record<
    string,
    {
      components: string[];
      containers: Array<{ service: string; name: string; podPrefix: string }>;
      diagnostics: string[];
    }
  >;
  inventoryServices: string[];
  verRunningStates: string[];
  exclusions: Array<{ service: string; evidenceSha256: string; reason: 'auxiliary-outside-operational-scope' }>;
  qualification: { evidenceSha256: string; discoveryCleanupSha256: string; campaignCleanupSha256: string };
}
export interface OperationalBinding {
  contextFingerprint: string;
  ownershipFingerprint: string;
  configurationIdentitySha256: string;
  runtimeIdentitySha256: string;
  siteName: string;
  nodes: Array<{
    nodeName: string;
    instanceId: string;
    registrationIdentitySha256: string;
    tokenIdentitySha256: string;
    role: string;
    nics: [string, string];
  }>;
}
export interface OperationalRead {
  available: boolean;
  observedAt: string;
  projection?: unknown;
  projectionFingerprint?: string;
}
/** Normalized, parser-versioned projections only. Raw bodies are never part of the public evaluator. */
export interface OperationalCollection {
  schemaVersion: 2;
  bindingBefore: OperationalBinding;
  bindingAfter?: OperationalBinding;
  contractFingerprint: string;
  qualificationFingerprint: string;
  startedAt: string;
  finishedAt: string;
  nodes: Array<{
    nodeName: string;
    registration: OperationalRead;
    interfaces: OperationalRead;
    siteStatus: OperationalRead;
    components: OperationalRead;
    inventory: OperationalRead;
    runtime: OperationalRead;
    diagnostics: OperationalRead;
  }>;
}
const HASH = /^sha256:[a-f0-9]{64}$/;
const NAME = /^[a-z][a-z0-9-]{0,62}$/;
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const names = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((name) => typeof name === 'string' && NAME.test(name)) &&
  new Set(value).size === value.length;
function safeFingerprint(value: unknown) {
  try {
    return fingerprint(value);
  } catch {
    return undefined;
  }
}
/** Qualification must match an independently pinned profile digest; self-declared receipts grant nothing. */
export function qualifiedOperationalProfile(value: unknown, pinnedFingerprint: string): value is OperationalProfile {
  const p = object(value);
  if (
    !p ||
    !HASH.test(pinnedFingerprint) ||
    safeFingerprint(p) !== pinnedFingerprint ||
    p.schemaVersion !== 2 ||
    p.scope !== 'original-three-node-operational-health' ||
    p.maximumAgeMs !== 300000 ||
    p.minimumRoundIntervalMs !== 45000
  )
    return false;
  for (const field of ['sourceHashes', 'parserVersions', 'roles', 'qualification'])
    if (!object(p[field]) || !Object.keys(p[field] as object).length) return false;
  if (
    !Object.values(p.sourceHashes as object).every((hash) => typeof hash === 'string' && HASH.test(hash)) ||
    !Object.values(p.parserVersions as object).every(
      (version) => typeof version === 'string' && /^[a-z0-9/-]+\/v[1-9][0-9]*$/.test(version),
    )
  )
    return false;
  const qualification = p.qualification as Record<string, unknown>;
  if (
    Object.keys(qualification).sort().join(',') !== 'campaignCleanupSha256,discoveryCleanupSha256,evidenceSha256' ||
    !Object.values(qualification).every((hash) => typeof hash === 'string' && HASH.test(hash))
  )
    return false;
  if (
    !names(p.inventoryServices) ||
    !GCP_OPERATIONAL_CORE_SEED.every((name) => (p.inventoryServices as string[]).includes(name)) ||
    !names(p.verRunningStates)
  )
    return false;
  if (
    !Array.isArray(p.exclusions) ||
    p.exclusions.some((raw) => {
      const e = object(raw);
      return (
        !e ||
        !(GCP_OPERATIONAL_AUXILIARIES as readonly unknown[]).includes(e.service) ||
        e.reason !== 'auxiliary-outside-operational-scope' ||
        typeof e.evidenceSha256 !== 'string' ||
        !HASH.test(e.evidenceSha256)
      );
    }) ||
    new Set(p.exclusions.map((e) => e.service)).size !== p.exclusions.length
  )
    return false;
  for (const [name, raw] of Object.entries(p.roles as object)) {
    const role = object(raw);
    if (
      !NAME.test(name) ||
      !role ||
      !names(role.components) ||
      !names(role.diagnostics) ||
      !Array.isArray(role.containers) ||
      !role.containers.length
    )
      return false;
    const containers = role.containers.map(object);
    if (
      containers.some(
        (c) =>
          !c ||
          !names([c.service]) ||
          !names([c.name]) ||
          typeof c.podPrefix !== 'string' ||
          !/^[a-z][a-z0-9-]{0,251}$/.test(c.podPrefix),
      )
    )
      return false;
    const services = containers.map((c) => c?.service);
    if (
      new Set(services).size !== services.length ||
      !GCP_OPERATIONAL_DEPENDENCIES.every((dependency) => services.includes(dependency))
    )
      return false;
    if (!['peer-connectivity', 'required-domains'].every((check) => (role.diagnostics as string[]).includes(check)))
      return false;
    for (const service of GCP_OPERATIONAL_CORE_SEED)
      if (!(role.components as string[]).includes(service) || !services.includes(service)) return false;
    if (role.components.some((component) => !(p.inventoryServices as string[]).includes(component))) return false;
    for (const service of p.inventoryServices as string[])
      if (!(role.components as string[]).includes(service) && !services.includes(service)) return false;
    for (const auxiliary of GCP_OPERATIONAL_AUXILIARIES)
      if (!p.exclusions.some((e) => e.service === auxiliary) && !services.includes(auxiliary)) return false;
  }
  return true;
}
function validBinding(value: OperationalBinding): boolean {
  if (
    !object(value) ||
    !NAME.test(value.siteName) ||
    ![
      value.contextFingerprint,
      value.ownershipFingerprint,
      value.configurationIdentitySha256,
      value.runtimeIdentitySha256,
    ].every((hash) => typeof hash === 'string' && HASH.test(hash)) ||
    !Array.isArray(value.nodes) ||
    value.nodes.length !== 3
  )
    return false;
  return (
    value.nodes.every(
      (node) =>
        object(node) &&
        NAME.test(node.nodeName) &&
        /^\d+$/.test(node.instanceId) &&
        NAME.test(node.role) &&
        [node.registrationIdentitySha256, node.tokenIdentitySha256].every(
          (hash) => typeof hash === 'string' && HASH.test(hash),
        ) &&
        Array.isArray(node.nics) &&
        node.nics.length === 2 &&
        node.nics.every((hash) => typeof hash === 'string' && HASH.test(hash)) &&
        node.nics[0] !== node.nics[1],
    ) &&
    ['nodeName', 'instanceId', 'registrationIdentitySha256', 'tokenIdentitySha256'].every(
      (key) => new Set(value.nodes.map((node) => node[key as keyof typeof node])).size === 3,
    )
  );
}
/** Unknown coverage has precedence; validated failures are retained in per-node checks. */
export function evaluateGcpOperationalHealth(
  value: unknown,
  expected: OperationalBinding,
  profileValue: unknown,
  pinnedFingerprint: string,
  now = Date.now(),
) {
  const reasons = new Set<string>();
  const profile = qualifiedOperationalProfile(profileValue, pinnedFingerprint) ? profileValue : undefined;
  const c = object(value);
  if (!profile) reasons.add('operational-contract-unqualified');
  if (!validBinding(expected)) reasons.add('invalid-original-binding');
  if (
    c?.schemaVersion !== 2 ||
    c.contractFingerprint !== pinnedFingerprint ||
    safeFingerprint(c.bindingBefore) !== safeFingerprint(expected) ||
    safeFingerprint(c.bindingAfter) !== safeFingerprint(expected) ||
    c.qualificationFingerprint !== (profile ? fingerprint(profile.qualification) : undefined)
  )
    reasons.add('collection-binding-mismatch');
  const start = typeof c?.startedAt === 'string' ? Date.parse(c.startedAt) : NaN;
  const finish = typeof c?.finishedAt === 'string' ? Date.parse(c.finishedAt) : NaN;
  if (![start, finish, now].every(Number.isFinite) || start > finish || finish > now || now - start > 300000)
    reasons.add('stale-or-malformed-observation');
  const rawNodes = Array.isArray(c?.nodes) ? c.nodes.map(object) : [];
  const expectedNodes = Array.isArray(expected.nodes) ? expected.nodes : [];
  if (
    rawNodes.length !== 3 ||
    rawNodes.some((row) => !row || !expectedNodes.some((node) => object(node) && node.nodeName === row.nodeName)) ||
    new Set(rawNodes.map((row) => row?.nodeName)).size !== 3
  )
    reasons.add('invalid-observed-node-set');
  const nodes = expectedNodes
    .filter((node) => object(node))
    .map((node) => {
      const row = rawNodes.find((row) => row?.nodeName === node.nodeName);
      const checks: Array<{ check: string; state: OperationalState; reasonCode?: string }> = [];
      const check = (name: string, state: OperationalState, reasonCode?: string) =>
        checks.push({ check: name, state, ...(state !== 'healthy' && reasonCode ? { reasonCode } : {}) });
      const read = (key: string) => {
        const r = object(row?.[key]);
        const at = typeof r?.observedAt === 'string' ? Date.parse(r.observedAt) : NaN;
        if (
          r?.available !== true ||
          !Number.isFinite(at) ||
          at < start ||
          at > finish ||
          typeof r.projectionFingerprint !== 'string' ||
          !HASH.test(r.projectionFingerprint) ||
          safeFingerprint(r.projection) !== r.projectionFingerprint
        ) {
          check(key, 'unknown', 'required-read-unavailable-or-invalid');
          return undefined;
        }
        if (r.projection === undefined || r.projection === null) {
          check(key, 'unknown', 'required-projection-malformed');
          return undefined;
        }
        return r.projection;
      };
      const registrationValue = read('registration');
      const registration = object(registrationValue);
      if (registrationValue !== undefined && !registration)
        check('registration', 'unknown', 'required-projection-malformed');
      if (registration)
        check(
          'registration',
          registration.state === 'ONLINE'
            ? 'healthy'
            : typeof registration.state === 'string' && ['OFFLINE', 'CONNECTING'].includes(registration.state)
              ? 'degraded'
              : 'unknown',
          registration.identitySha256 === node.registrationIdentitySha256
            ? undefined
            : 'registration-identity-mismatch',
        );
      if (registration && registration.identitySha256 !== node.registrationIdentitySha256)
        checks[checks.length - 1].state = 'unknown';
      const interfaces = read('interfaces');
      if (interfaces !== undefined)
        check(
          'interfaces',
          Array.isArray(interfaces) && interfaces.length === 2 && safeFingerprint(interfaces) === fingerprint(node.nics)
            ? 'healthy'
            : 'unknown',
          'nic-join-mismatch',
        );
      const role = profile?.roles[node.role];
      if (!role) check('role', 'unknown', 'role-requalification-required');
      const siteValue = read('siteStatus');
      const site = object(siteValue);
      if (siteValue !== undefined && !site) check('siteStatus', 'unknown', 'required-projection-malformed');
      if (site) {
        check(
          'runtime-identity',
          site.runtimeIdentitySha256 === expected.runtimeIdentitySha256 && site.role === node.role
            ? 'healthy'
            : 'unknown',
          'runtime-or-role-drift',
        );
        check(
          'ver',
          typeof site.verState !== 'string'
            ? 'unknown'
            : profile?.verRunningStates.includes(site.verState)
              ? 'healthy'
              : ['stopped', 'failed'].includes(site.verState)
                ? 'degraded'
                : 'unknown',
          'ver-not-qualified-running',
        );
        check(
          'interface-state',
          safeFingerprint(site.interfacesUp) === fingerprint([true, true])
            ? 'healthy'
            : Array.isArray(site.interfacesUp) &&
                site.interfacesUp.length === 2 &&
                site.interfacesUp.every((up) => typeof up === 'boolean')
              ? 'degraded'
              : 'unknown',
          'interface-not-up',
        );
      }
      const components = read('components');
      if (components !== undefined) {
        const rows = Array.isArray(components) ? components.map(object) : [];
        if (
          !rows.length ||
          rows.some((r) => !r || typeof r.name !== 'string' || typeof r.state !== 'string') ||
          new Set(rows.map((r) => r?.name)).size !== rows.length
        )
          check('components', 'unknown', 'malformed-or-duplicate-component');
        else
          for (const name of role?.components ?? []) {
            const component = rows.find((r) => r?.name === name);
            check(
              `component:${name}`,
              !component
                ? 'unknown'
                : component.state === 'Ready'
                  ? 'healthy'
                  : ['NotReady', 'Failed'].includes(String(component.state))
                    ? 'degraded'
                    : 'unknown',
              'component-not-ready-or-missing',
            );
          }
      }
      const inventory = read('inventory');
      let repeatedReferences = 0;
      if (inventory !== undefined) {
        const rows = Array.isArray(inventory) ? inventory.map(object) : [];
        const identities = new Map<string, string>();
        let invalid = !rows.length;
        for (const r of rows) {
          if (!r || typeof r.service !== 'string') {
            invalid = true;
            continue;
          }
          const previous = identities.get(r.service);
          const hash = fingerprint(r);
          if (previous) {
            if (previous !== hash) invalid = true;
            else repeatedReferences++;
          }
          identities.set(r.service, hash);
        }
        const permitted = new Set([
          ...(profile?.inventoryServices ?? []),
          ...(role?.containers.map((r) => r.service) ?? []),
          ...(profile?.exclusions.map((e) => e.service) ?? []),
        ]);
        check(
          'inventory',
          invalid ||
            (profile?.inventoryServices ?? []).some((name) => !identities.has(name)) ||
            [...identities.keys()].some((name) => !permitted.has(name))
            ? 'unknown'
            : 'healthy',
          'inventory-coverage-or-drift',
        );
      }
      const runtime = read('runtime');
      if (runtime !== undefined) {
        const rows = Array.isArray(runtime) ? runtime.map(object) : [];
        if (
          !rows.length ||
          rows.some(
            (r) =>
              !r ||
              typeof r.containerIdentitySha256 !== 'string' ||
              !HASH.test(r.containerIdentitySha256) ||
              typeof r.name !== 'string' ||
              typeof r.pod !== 'string' ||
              !['running', 'not-running'].includes(String(r.liveness)),
          ) ||
          new Set(rows.map((r) => r?.containerIdentitySha256)).size !== rows.length
        )
          check('runtime', 'unknown', 'malformed-runtime');
        else
          for (const mapping of role?.containers ?? []) {
            const matches = rows.filter((r) => r?.name === mapping.name && String(r.pod).startsWith(mapping.podPrefix));
            check(
              `container:${mapping.service}`,
              matches.length !== 1 ? 'unknown' : matches[0]?.liveness === 'running' ? 'healthy' : 'degraded',
              'runtime-coverage-ambiguous-or-not-running',
            );
          }
      }
      const diagnosticsValue = read('diagnostics');
      const diagnostics = object(diagnosticsValue);
      if (diagnosticsValue !== undefined && !diagnostics)
        check('diagnostics', 'unknown', 'required-projection-malformed');
      if (diagnostics) {
        if (
          safeFingerprint(diagnostics.peers) !==
          fingerprint(
            expectedNodes
              .filter((peer) => peer.nodeName !== node.nodeName)
              .map((peer) => ({ nodeName: peer.nodeName, instanceId: peer.instanceId })),
          )
        )
          check('peers', 'unknown', 'diagnostic-peer-join-mismatch');
        for (const name of role?.diagnostics ?? []) {
          const state = object(diagnostics.checks)?.[name];
          check(
            `diagnostic:${name}`,
            state === 'pass' ? 'healthy' : state === 'fail' ? 'degraded' : 'unknown',
            'diagnostic-unavailable-or-failed',
          );
        }
      }
      const state: OperationalState =
        reasons.size || checks.some((c) => c.state === 'unknown')
          ? 'unknown'
          : checks.some((c) => c.state === 'degraded')
            ? 'degraded'
            : 'healthy';
      return {
        nodeName: node.nodeName,
        status: state,
        checks,
        knownFailures: checks.filter((c) => c.state === 'degraded').map((c) => c.check),
        repeatedInventoryReferences: repeatedReferences,
      };
    });
  const status: OperationalState =
    reasons.size || nodes.some((node) => node.status === 'unknown')
      ? 'unknown'
      : nodes.some((node) => node.status === 'degraded')
        ? 'degraded'
        : 'healthy';
  const projection = {
    schemaVersion: 2,
    scope: 'original-three-node-operational-health',
    status,
    contractFingerprint: pinnedFingerprint,
    qualificationFingerprint: profile ? fingerprint(profile.qualification) : undefined,
    bindingFingerprint: safeFingerprint(expected),
    nodes,
    reasonCodes: [...reasons],
    exclusions: profile?.exclusions ?? [],
    coverage: {
      containers: 'liveness-only',
      siteHealthScores: 'informational',
      gatewayIcmp: 'informational',
      traffic: 'excluded',
      quorum: 'excluded',
      failover: 'excluded',
    },
    startedAt: Number.isFinite(start) ? new Date(start).toISOString() : undefined,
    finishedAt: Number.isFinite(finish) ? new Date(finish).toISOString() : undefined,
  };
  return { ...projection, projectionFingerprint: fingerprint(projection) };
}

export interface OperationalRounds {
  consecutiveHealthy: number;
  bindingFingerprint?: string;
  contractFingerprint?: string;
  qualificationFingerprint?: string;
  lastFinishedAt?: string;
}
/** Two distinct fresh rounds, at least 45 seconds apart, with unchanged qualification and identities. */
export function advanceGcpOperationalRounds(
  previous: OperationalRounds,
  result: ReturnType<typeof evaluateGcpOperationalHealth>,
  now = Date.now(),
): OperationalRounds {
  const { projectionFingerprint, ...projection } = result;
  const at = result.finishedAt ? Date.parse(result.finishedAt) : NaN;
  const start = result.startedAt ? Date.parse(result.startedAt) : NaN;
  const prior = previous.lastFinishedAt ? Date.parse(previous.lastFinishedAt) : NaN;
  if (
    projectionFingerprint !== fingerprint(projection) ||
    result.status !== 'healthy' ||
    ![at, start, now].every(Number.isFinite) ||
    at > now ||
    start > at ||
    now - start > 300000
  )
    return { consecutiveHealthy: 0 };
  const unchanged =
    previous.bindingFingerprint === result.bindingFingerprint &&
    previous.contractFingerprint === result.contractFingerprint &&
    previous.qualificationFingerprint === result.qualificationFingerprint;
  if (Number.isFinite(prior) && start - prior < 45000) return { consecutiveHealthy: 0 };
  return {
    consecutiveHealthy:
      unchanged && Number.isFinite(prior) && start - prior <= 300000 ? Math.min(2, previous.consecutiveHealthy + 1) : 1,
    bindingFingerprint: result.bindingFingerprint,
    contractFingerprint: result.contractFingerprint,
    qualificationFingerprint: result.qualificationFingerprint,
    lastFinishedAt: result.finishedAt,
  };
}
