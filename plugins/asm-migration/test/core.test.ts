import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  convert,
  dnsLabel,
  mergeConfigPacks,
  parseAsmXml,
  parseSignatureDatabase,
  regexForRange,
  validateConfigPack,
} from '../src/runtime';
import { MigrationError } from '../src/types';

const fixtures = resolve(import.meta.dir, 'fixtures');
const referencePack = () => JSON.parse(readFileSync(resolve(fixtures, 'xcify-0.2.0-config-pack.json'), 'utf8'));
const policyBytes = () => readFileSync(resolve(fixtures, 'minimal-policy.xml'));
const signatures = () => parseSignatureDatabase(readFileSync(resolve(fixtures, 'signatures.json')));
const options = (allowPartial = false) => ({
  namespace: 'example',
  targetName: 'Synthetic Policy',
  allowPartial,
  signatures: signatures(),
});

describe('parser', () => {
  test('normalizes the XCify synthetic policy', () => {
    const policy = parseAsmXml(policyBytes(), 'minimal-policy.xml');
    expect(policy.enforcementMode).toBe('blocking');
    expect(policy.methods).toEqual(['GET', 'PATCH', 'POST']);
    expect(policy.allowedResponseCodes).toEqual([401, 404]);
    expect(policy.trustedClients).toEqual(['192.0.2.10/32']);
    expect(policy.disallowedFileTypes).toEqual(['bak', 'exe']);
    expect(policy.urls[0]?.name).toBe('/private*');
    expect(policy.signatureOverrides[0]?.disabledAsmIds).toEqual([1001]);
  });

  test.each([
    '<not-policy />',
    '<policy>',
    '<!DOCTYPE policy [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><policy>&xxe;</policy>',
  ])('rejects malformed or unsafe XML', (xml) => {
    expect(() => parseAsmXml(Buffer.from(xml))).toThrow(MigrationError);
  });

  test('normalizes IPv6 masks and rejects invalid networks', () => {
    const policy = parseAsmXml(
      Buffer.from(
        '<policy><whitelist><ip_address>2001:db8:1::5</ip_address><subnet_mask>ffff:ffff:ffff:ffff::</subnet_mask></whitelist></policy>',
      ),
    );
    expect(policy.trustedClients).toEqual(['2001:db8:1::/64']);
    expect(() =>
      parseAsmXml(Buffer.from('<policy><whitelist><ip_address>999.1.2.3</ip_address></whitelist></policy>')),
    ).toThrow('invalid client network');
  });

  test('normalizes scoped and global signature controls', () => {
    const policy = parseAsmXml(
      Buffer.from(
        "<policy><urls><url name='/scoped*'><parameter name='token'><maximum_length>8</maximum_length><attack_signature sig_id='200000111'>disabled</attack_signature></parameter></url></urls><headers><allowed_modified_cookie name='session'><check_signatures>false</check_signatures></allowed_modified_cookie></headers><attack_signatures><signature signature_id='200000222'><enabled>false</enabled></signature></attack_signatures></policy>",
      ),
    );
    expect(policy.parameters[0]?.url).toBe('/scoped*');
    expect(policy.parameters[0]?.maximumLength).toBe(8);
    expect(policy.modifiedCookies[0]?.name).toBe('session');
    expect(policy.signatureOverrides.map((item) => [item.contextType, item.contextName, item.disabledAsmIds])).toEqual([
      ['global', '*', [200000222]],
      ['parameter', 'token', [200000111]],
    ]);
  });

  test('requires the renamed signature schema and unique identifiers', () => {
    expect(() =>
      parseSignatureDatabase(Buffer.from('{"schema_version":"xcify.signatures/v1","signatures":[]}')),
    ).toThrow('schema');
    expect(() =>
      parseSignatureDatabase(
        Buffer.from(
          '{"schema_version":"asm-migration.signatures/v1","signatures":[{"asm_id":1,"xc_id":200000002},{"asm_id":1,"xc_id":200000003}]}',
        ),
      ),
    ).toThrow('unique');
  });
});

describe('conversion', () => {
  test('covers supported controls and validates against the pinned contract', () => {
    const result = convert(parseAsmXml(policyBytes()), options());
    expect(result.report.complete).toBe(true);
    expect(result.report.resource_counts).toEqual({ app_firewall: 1, ip_prefix_set: 1, service_policy: 1 });
    const firewall = result.configPack.resources.find((item) => item.kind === 'app_firewall')!;
    expect(firewall.metadata.namespace).toBe('example');
    const policy = result.configPack.resources.find((item) => item.kind === 'service_policy')!;
    const rules = (policy.spec.rule_list as { rules: Array<{ metadata: { name: string }; spec: Record<string, any> }> })
      .rules;
    expect(new Set(rules.map((rule) => rule.metadata.name)).size).toBe(rules.length);
    expect(rules.some((rule) => rule.metadata.name === 'deny-illegal-methods')).toBe(true);
    const signature = rules.find((rule) => rule.metadata.name.startsWith('signature-exclusion'))!;
    expect(signature.spec.waf_action.app_firewall_detection_control.exclude_signature_contexts[0].signature_id).toBe(
      200900001,
    );
    expect(validateConfigPack(result.configPack).valid).toBe(true);
  });

  test('matches the XCify 0.2.0 synthetic reference after intentional renames', () => {
    const result = convert(parseAsmXml(policyBytes()), options());
    expect(result.configPack).toEqual(referencePack());
    expect(result.warnings).toEqual([]);
  });

  test('fails closed in strict mode and reports partial omissions', () => {
    const bad = parseAsmXml(
      Buffer.from(
        "<policy><blocking><violation id='UNREPRESENTABLE'><block>true</block></violation></blocking></policy>",
      ),
    );
    expect(() => convert(bad, options())).toThrow('UNREPRESENTABLE');
    const partial = convert(bad, options(true));
    expect(partial.report.complete).toBe(false);
    expect(partial.warnings[0]?.code).toBe('unsupported-enabled-feature');
  });

  test('enforces rule and missing-signature limits', () => {
    const urls = Array.from(
      { length: 257 },
      (_, index) => `<url name='/path-${index}'><is_allowed>false</is_allowed></url>`,
    ).join('');
    const policy = parseAsmXml(Buffer.from(`<policy><urls>${urls}</urls></policy>`));
    expect(() => convert(policy, options())).toThrow('256');
    const partial = convert(policy, options(true));
    expect(partial.warnings.some((warning) => warning.code === 'rule-limit')).toBe(true);
    const empty = { schema_version: 'asm-migration.signatures/v1' as const, signatures: [] };
    expect(() => convert(parseAsmXml(policyBytes()), { ...options(), signatures: empty })).toThrow('1001');
  });

  test('warns for IPv6 client controls in partial mode', () => {
    const policy = parseAsmXml(
      Buffer.from(
        '<policy><whitelist><ip_address>2001:db8::1</ip_address><subnet_mask>64</subnet_mask></whitelist></policy>',
      ),
    );
    expect(() => convert(policy, options())).toThrow('IPv6');
    expect(convert(policy, options(true)).warnings[0]?.code).toBe('ipv6-client');
  });

  test('chunks signature contexts without exceeding the pinned limit', () => {
    const signatures = Array.from({ length: 1025 }, (_, index) => ({ asm_id: index + 1, xc_id: 200_000_001 + index }));
    const signatureXml = signatures.map((item) => `<signature id='${item.asm_id}' />`).join('');
    const policy = parseAsmXml(
      Buffer.from(`<policy><attack_signature><enabled>false</enabled>${signatureXml}</attack_signature></policy>`),
    );
    const result = convert(policy, {
      namespace: 'example',
      allowPartial: false,
      signatures: { schema_version: 'asm-migration.signatures/v1', signatures },
    });
    const servicePolicy = result.configPack.resources.find((item) => item.kind === 'service_policy')!;
    const rules = (servicePolicy.spec.rule_list as { rules: Array<{ spec: Record<string, any> }> }).rules;
    expect(
      rules.map((rule) => rule.spec.waf_action?.app_firewall_detection_control.exclude_signature_contexts.length),
    ).toEqual([1024, 1]);
  });

  test('omits over-limit blocking pages only in partial mode', () => {
    const policy = parseAsmXml(
      Buffer.from(
        `<policy><blocking><response_page cause='default'><response_type>custom</response_type><response_html_code>${'x'.repeat(4096)}</response_html_code></response_page></blocking></policy>`,
      ),
    );
    expect(() => convert(policy, options())).toThrow('blocking page');
    expect(convert(policy, options(true)).warnings[0]?.code).toBe('blocking-page-limit');
  });

  test('deduplicates identical packs and rejects conflicting identities', () => {
    const first = convert(parseAsmXml(policyBytes()), options()).configPack;
    expect(mergeConfigPacks(first, first)).toEqual(first);
    const conflicting = structuredClone(first);
    conflicting.resources[0]!.spec = { monitoring: {} };
    expect(() => mergeConfigPacks(first, conflicting)).toThrow('conflicting resource identity');
  });
});

describe('utilities and contract', () => {
  test('normalizes and disambiguates names', () => {
    const value = `Policy ${'A'.repeat(100)}`;
    expect(dnsLabel(value)).toHaveLength(63);
    expect(dnsLabel(value)).not.toBe(dnsLabel(`${value}B`));
  });

  test.each([
    [0, 0],
    [1, 9],
    [10, 25],
    [98, 102],
    [100, 999],
  ])('renders integer ranges', (minimum, maximum) => {
    const expression = new RegExp(`^${regexForRange(minimum, maximum)}$`);
    for (let value = Math.max(0, minimum - 2); value <= maximum + 2; value += 1)
      expect(expression.test(String(value))).toBe(value >= minimum && value <= maximum);
  });

  test('rejects unknown fields, union conflicts, invalid IPv4 and low signature IDs', () => {
    const pack = (kind: any, spec: Record<string, unknown>) => ({
      schema_version: 'asm-migration.config-pack/v1',
      resources: [{ kind, metadata: { name: 'synthetic', namespace: 'example' }, spec }],
    });
    expect(validateConfigPack(pack('app_firewall', { blocking: {}, bogus: {} })).valid).toBe(false);
    expect(
      validateConfigPack(pack('app_firewall', { blocking: {}, monitoring: {} })).issues.some((item) =>
        item.message.includes('mutually exclusive'),
      ),
    ).toBe(true);
    expect(validateConfigPack(pack('ip_prefix_set', { ipv4_prefixes: [{ ipv4_prefix: '2001:db8::/64' }] })).valid).toBe(
      false,
    );
    const rule = {
      metadata: { name: 'one' },
      spec: {
        action: 'DENY',
        any_client: {},
        any_ip: {},
        any_asn: {},
        waf_action: {
          app_firewall_detection_control: { exclude_signature_contexts: [{ context: 'CONTEXT_ANY', signature_id: 1 }] },
        },
      },
    };
    expect(validateConfigPack(pack('service_policy', { rule_list: { rules: [rule] } })).valid).toBe(false);
  });

  test('reports envelope and resource issues together', () => {
    const report = validateConfigPack({
      schema_version: 'wrong/v0',
      resources: [
        { kind: 'unknown', metadata: { name: 'one', namespace: 'example' }, spec: {} },
        { kind: 'app_firewall', metadata: { name: 'two', namespace: 'example' }, spec: { bogus: {} } },
      ],
    });
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.path === '$.schema_version')).toBe(true);
    expect(report.issues.some((issue) => issue.resource_index === 0 && issue.message === 'unsupported resource kind')).toBe(true);
    expect(report.issues.some((issue) => issue.resource_index === 1 && issue.path !== '$')).toBe(true);
  });
});
