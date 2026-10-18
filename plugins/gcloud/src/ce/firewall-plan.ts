import { fingerprint } from './discovery';
import { type GcpResourceIdentity, validateGcpResourceIdentity } from './ownership';
import { ipv4Range } from './validation';
export interface GcpFirewallIntent {
  schemaVersion: 1;
  project: string;
  deploymentName: string;
  engine: 'native' | 'terraform';
  network: GcpResourceIdentity;
  rules: Array<{
    name: string;
    direction: 'INGRESS' | 'EGRESS';
    priority: number;
    targetTags: string[];
    cidrs: string[];
    allowed: Array<{ protocol: 'tcp' | 'udp' | 'icmp'; ports: string[] }>;
  }>;
}
/** Translate explicit IPv4 demo policy. Never infer allow-all ingress or default tags. */
export function planGcpFirewall(intent: GcpFirewallIntent) {
  validateGcpResourceIdentity(intent.network);
  if (
    intent.schemaVersion !== 1 ||
    intent.network.kind !== 'network' ||
    intent.network.project !== intent.project ||
    intent.network.deploymentName !== intent.deploymentName ||
    intent.network.engine !== intent.engine
  )
    throw new Error('Firewall network ownership differs');
  if (!intent.rules.length) throw new Error('Explicit firewall rules required');
  const names = new Set<string>(),
    resources: Record<string, unknown> = {};
  const actions = intent.rules.map((rule) => {
    if (
      !/^[a-z][a-z0-9-]{0,62}$/.test(rule.name) ||
      names.has(rule.name) ||
      !['INGRESS', 'EGRESS'].includes(rule.direction)
    )
      throw new Error('Unique scoped firewall identity required');
    names.add(rule.name);
    if (
      !Number.isInteger(rule.priority) ||
      rule.priority < 0 ||
      rule.priority > 65535 ||
      !rule.targetTags.length ||
      new Set(rule.targetTags).size !== rule.targetTags.length ||
      rule.targetTags.some((tag) => !/^[a-z][a-z0-9-]{0,62}$/.test(tag))
    )
      throw new Error('Explicit firewall priority and target tags required');
    if (!rule.cidrs.length || new Set(rule.cidrs).size !== rule.cidrs.length)
      throw new Error('Explicit firewall source/destination ranges required');
    rule.cidrs.forEach(ipv4Range);
    if (!rule.allowed.length) throw new Error('Explicit firewall protocol/ports required');
    const combinations = rule.allowed.flatMap((allow) => {
      if (!['tcp', 'udp', 'icmp'].includes(allow.protocol) || (allow.protocol === 'icmp' && allow.ports.length > 0))
        throw new Error('Unsupported firewall protocol');
      if (allow.protocol !== 'icmp' && !allow.ports.length) throw new Error('Explicit TCP/UDP ports required');
      for (const port of allow.ports) {
        const parts = port.split('-').map(Number);
        if (
          parts.length > 2 ||
          !/^\d+(?:-\d+)?$/.test(port) ||
          parts.some((p) => !Number.isInteger(p) || p < 1 || p > 65535) ||
          (parts.length === 2 && parts[0] > parts[1])
        )
          throw new Error('Invalid firewall port range');
      }
      return allow.protocol === 'icmp' ? ['icmp'] : allow.ports.map((port) => `${allow.protocol}:${port}`);
    });
    if (new Set(combinations).size !== combinations.length) throw new Error('Duplicate firewall protocol/port entries');
    const rangeKey = rule.direction === 'INGRESS' ? 'source_ranges' : 'destination_ranges';
    resources[rule.name.replaceAll('-', '_')] = {
      name: rule.name,
      project: intent.project,
      network: intent.network.selfLink,
      direction: rule.direction,
      priority: rule.priority,
      target_tags: [...rule.targetTags],
      [rangeKey]: [...rule.cidrs],
      allow: rule.allowed.map((allow) => ({
        protocol: allow.protocol,
        ...(allow.ports.length ? { ports: allow.ports } : {}),
      })),
    };
    return {
      id: `firewall-${rule.name}`,
      argv: [
        'compute',
        'firewall-rules',
        'create',
        rule.name,
        `--project=${intent.project}`,
        `--network=${intent.network.selfLink}`,
        `--direction=${rule.direction}`,
        `--priority=${rule.priority}`,
        `--target-tags=${rule.targetTags.join(',')}`,
        `${rule.direction === 'INGRESS' ? '--source-ranges' : '--destination-ranges'}=${rule.cidrs.join(',')}`,
        `--allow=${combinations.join(',')}`,
        '--quiet',
        '--format=json',
      ],
    };
  });
  return {
    schemaVersion: 1,
    engine: intent.engine,
    executable: false,
    actions: intent.engine === 'native' ? actions : [],
    terraformResources: intent.engine === 'terraform' ? { google_compute_firewall: resources } : {},
    required: [
      'reviewed exact firewall plan',
      'ledger ownership recheck',
      'policy precedence/effective firewall verification',
      'content-verified permitted and blocked traffic',
    ],
    sha256: fingerprint(intent),
  };
}
