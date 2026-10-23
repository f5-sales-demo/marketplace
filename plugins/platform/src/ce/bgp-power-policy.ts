import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

type Json = Record<string, unknown>;
interface BgpSpec extends Json {
  peers: Array<Json & { external: Json }>;
}
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed BGP maintenance policy');
  return value as Json;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export interface AwsBgpPowerPolicyRevision {
  schemaVersion: 1;
  effect: 'withdraw' | 'restore';
  siteName: string;
  prefixes: string[];
  policy: { name: string; spec: Json };
  originalBgpSpec: BgpSpec;
  bgpSpec: BgpSpec;
  originalSha256: string;
  withdrawnSha256: string;
  operationalEvidence: 'unknown';
}
/** Schema-valid configuration only. Actual session retention and route withdrawal require separate current observations. */
export function buildAwsBgpPowerPolicyRevision(
  snapshot: Json,
  siteName: string,
  prefixes: string[],
  effect: 'withdraw' | 'restore',
  validate: (kind: 'bgp' | 'bgp_routing_policy' | 'external_connector', spec: Json) => void,
  retained?: AwsBgpPowerPolicyRevision,
): AwsBgpPowerPolicyRevision {
  if (
    !/^[a-z0-9][a-z0-9-]{0,62}$/.test(siteName) ||
    !Array.isArray(prefixes) ||
    !prefixes.length ||
    new Set(prefixes).size !== prefixes.length
  )
    throw Error('BGP maintenance identity or service prefixes differ');
  for (const cidr of prefixes) {
    const [ip, bits, extra] = cidr.split('/');
    if (isIP(ip) !== 4 || !/^\d{1,2}$/.test(bits ?? '') || Number(bits) < 1 || Number(bits) > 32 || extra !== undefined)
      throw Error('BGP maintenance service prefix unresolved or broad');
    const address = ip.split('.').reduce((v, o) => (v * 256 + Number(o)) >>> 0, 0);
    const mask = (0xffffffff << (32 - Number(bits))) >>> 0;
    if ((address & mask) >>> 0 !== address) throw Error('BGP maintenance prefix is not network aligned');
  }
  const normalized = [...prefixes].sort();
  const policy = {
    name: `${siteName.slice(0, 43)}-tgw-power-policy`,
    spec: {
      rules: [
        {
          match: {
            ip_prefixes: { prefixes: normalized.map((ip_prefixes) => ({ ip_prefixes, equal_or_longer_than: {} })) },
          },
          action: { deny: {} },
        },
      ],
    },
  };
  validate('bgp_routing_policy', policy.spec);
  const original =
    effect === 'withdraw' ? structuredClone(object(snapshot)) : structuredClone(object(retained?.originalBgpSpec));
  if (
    effect === 'restore' &&
    (retained?.schemaVersion !== 1 ||
      retained.effect !== 'withdraw' ||
      retained.siteName !== siteName ||
      canonical(retained.prefixes) !== canonical(normalized) ||
      hash(original) !== retained.originalSha256 ||
      hash(snapshot) !== retained.withdrawnSha256 ||
      hash(retained.bgpSpec) !== retained.withdrawnSha256 ||
      canonical(retained.policy) !== canonical(policy))
  )
    throw Error('BGP restoration requires exact retained withdrawal');
  if (!['withdraw', 'restore'].includes(effect)) throw Error('BGP maintenance effect differs');
  const where = object(object(original.where).site);
  const refs = where.ref;
  if (
    where.network_type !== 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE' ||
    !Array.isArray(refs) ||
    refs.length !== 1 ||
    object(refs[0]).name !== siteName ||
    object(refs[0]).namespace !== 'system' ||
    !Array.isArray(original.peers) ||
    !original.peers.length
  )
    throw Error('BGP maintenance site or peer binding differs');
  const peerNames = new Set<string>(),
    addresses = new Set<string>();
  for (const peerValue of original.peers) {
    const peer = object(peerValue),
      external = object(peer.external),
      metadata = object(peer.metadata);
    if (
      Object.hasOwn(peer, 'routing_policies') ||
      Object.hasOwn(peer, 'disable') ||
      typeof metadata.name !== 'string' ||
      peerNames.has(metadata.name) ||
      typeof external.address !== 'string' ||
      isIP(external.address) !== 4 ||
      addresses.has(external.address)
    )
      throw Error('BGP maintenance original peers ambiguous or foreign policy');
    peerNames.add(metadata.name);
    addresses.add(external.address);
  }
  const originalSpec = original as BgpSpec;
  validate('bgp', original);
  const withdrawn = structuredClone(originalSpec);
  for (const peer of withdrawn.peers)
    peer.routing_policies = {
      route_policy: [{ all_nodes: {}, outbound: {}, object_refs: [{ name: policy.name, namespace: 'system' }] }],
    };
  validate('bgp', withdrawn);
  if (effect === 'restore' && canonical(withdrawn) !== canonical(snapshot))
    throw Error('BGP maintenance withdrawal configuration differs');
  return {
    schemaVersion: 1,
    effect,
    siteName,
    prefixes: normalized,
    policy,
    originalBgpSpec: originalSpec,
    bgpSpec: effect === 'withdraw' ? withdrawn : structuredClone(originalSpec),
    originalSha256: hash(original),
    withdrawnSha256: hash(withdrawn),
    operationalEvidence: 'unknown',
  };
}
