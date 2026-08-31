import { Buffer } from 'node:buffer';
import { validateConfigPack } from './contract';
import { dnsLabel, uniqueRuleNames } from './naming';
import { regexForRange } from './ranges';
import type { AsmPolicy, ConfigPack, ConversionResult, ConversionWarning, Resource, SignatureDatabase } from './types';
import { MigrationError } from './types';

export const LIMITS = {
  responseCodes: 48,
  blockingPage: 4096,
  prefixes: 1024,
  prefixRefs: 4,
  rules: 256,
  signatureContexts: 1024,
} as const;
const IMPLICIT_RESPONSE_CODES = [
  100, 101, 102, 103, 200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304, 305, 306, 307, 308,
];
const VIOLATION_MAP: Record<string, string> = {
  FILETYPE: 'VIOL_FILETYPE',
  HTTP_STATUS_IN_RESPONSE: 'VIOL_HTTP_RESPONSE_STATUS',
  ILLEGAL_METHOD: 'VIOL_METHOD',
  METHOD: 'VIOL_METHOD',
  MISSING_MANDATORY_HEADER: 'VIOL_MANDATORY_HEADER',
};
const XC_HTTP_METHODS = new Set([
  'ANY',
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'CONNECT',
  'OPTIONS',
  'TRACE',
  'PATCH',
  'COPY',
]);
type Rule = { metadata: { name: string }; spec: Record<string, unknown> };

export interface ConvertOptions {
  namespace: string;
  targetName?: string;
  allowPartial: boolean;
  signatures: SignatureDatabase;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
function failOrWarn(message: string, code: string, allowPartial: boolean, warnings: ConversionWarning[]): void {
  if (!allowPartial) throw new MigrationError('conversion', message);
  warnings.push({ code, message, blocking: true });
}
function baseRule(action: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action,
    waf_action: { none: {} },
    any_client: {},
    any_ip: {},
    any_asn: {},
    path: { prefix_values: ['/'] },
    ...extra,
  };
}
function pathMatcher(value?: string): Record<string, unknown> {
  if (!value) return { prefix_values: ['/'] };
  if (!value.includes('*')) return { exact_values: [value] };
  const regex = `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}$`;
  const simple = /^\^([^.*+?{}[\]\\|()]+)\.\*\$$/.exec(regex);
  return simple ? { prefix_values: [simple[1]] } : { regex_values: [regex] };
}
function signatureRule(
  contextType: string,
  signatureIds: number | number[],
  path?: Record<string, unknown>,
  contextName?: string,
): Record<string, unknown> {
  const ids = Array.isArray(signatureIds) ? signatureIds : [signatureIds];
  const context = contextType === 'global' ? 'CONTEXT_ANY' : `CONTEXT_${contextType.toUpperCase()}`;
  const named = ['parameter', 'header', 'cookie'].includes(contextType) ? contextName : undefined;
  return baseRule('NEXT_POLICY', {
    ...(path ? { path } : {}),
    waf_action: {
      app_firewall_detection_control: {
        exclude_signature_contexts: ids.map((signature_id) => ({
          context,
          ...(named ? { context_name: named } : {}),
          signature_id,
        })),
      },
    },
  });
}

function appFirewall(
  policy: AsmPolicy,
  namespace: string,
  target: string,
  options: ConvertOptions,
  warnings: ConversionWarning[],
): Resource {
  const disabled = [
    ...new Set(
      policy.violations
        .filter((item) => !item.block && VIOLATION_MAP[item.identifier])
        .map((item) => VIOLATION_MAP[item.identifier] ?? ''),
    ),
  ].sort();
  const statusEnforced = policy.violations.some((item) => item.identifier === 'HTTP_STATUS_IN_RESPONSE' && item.block);
  let allowed: Record<string, unknown> | undefined;
  if (statusEnforced) {
    const responseCodes = [...new Set([...IMPLICIT_RESPONSE_CODES, ...policy.allowedResponseCodes])].sort(
      (a, b) => a - b,
    );
    if (responseCodes.length > LIMITS.responseCodes)
      failOrWarn(
        `${responseCodes.length} allowed response codes exceed pinned contract limit ${LIMITS.responseCodes}`,
        'response-code-limit',
        options.allowPartial,
        warnings,
      );
    else allowed = { response_code: responseCodes };
  }
  let blockingPage: Record<string, unknown> | undefined;
  if (policy.customResponse) {
    const normalized = policy.customResponse.body.replaceAll('<%TS.request.ID()%>', '{{request_id}}');
    const encoded = Buffer.from(normalized).toString('base64');
    if (encoded.length > LIMITS.blockingPage)
      failOrWarn(
        `custom blocking page exceeds pinned encoded-size limit ${LIMITS.blockingPage}`,
        'blocking-page-limit',
        options.allowPartial,
        warnings,
      );
    else blockingPage = { response_code: 'OK', blocking_page: `string:///${encoded}` };
  }
  return {
    kind: 'app_firewall',
    metadata: { name: dnsLabel(`${target}-app-firewall`), namespace },
    spec: {
      ...(policy.enforcementMode === 'blocking' ? { blocking: {} } : { monitoring: {} }),
      ...(disabled.length
        ? { detection_settings: { violation_settings: { disabled_violation_types: disabled }, violations_view: [] } }
        : {}),
      ...(allowed ? { allowed_response_codes: allowed } : {}),
      ...(blockingPage ? { blocking_page: blockingPage } : {}),
    },
  };
}

function clientControls(
  policy: AsmPolicy,
  namespace: string,
  target: string,
  options: ConvertOptions,
  warnings: ConversionWarning[],
): [Resource[], Rule[]] {
  const resources: Resource[] = [];
  const rules: Rule[] = [];
  for (const [purpose, values, action, skipWaf] of [
    ['trusted', policy.trustedClients, 'NEXT_POLICY', true],
    ['blocked', policy.blockedClients, 'DENY', false],
  ] as const) {
    const ipv4 = values.filter((value) => !value.includes(':'));
    const ipv6 = values.filter((value) => value.includes(':'));
    if (ipv6.length)
      failOrWarn(
        `${purpose} IPv6 clients cannot be represented by ip_prefix_set`,
        'ipv6-client',
        options.allowPartial,
        warnings,
      );
    let prefixChunks = chunks(ipv4, LIMITS.prefixes);
    if (prefixChunks.length > LIMITS.prefixRefs) {
      failOrWarn(
        `${purpose} clients require ${prefixChunks.length} prefix sets; rule reference limit is ${LIMITS.prefixRefs}`,
        'prefix-set-reference-limit',
        options.allowPartial,
        warnings,
      );
      prefixChunks = prefixChunks.slice(0, LIMITS.prefixRefs);
    }
    const refs: Array<{ name: string; namespace: string }> = [];
    prefixChunks.forEach((chunk, index) => {
      const suffix = prefixChunks.length === 1 ? '' : `-${index + 1}`;
      const name = dnsLabel(`${target}-${purpose}-clients${suffix}`);
      resources.push({
        kind: 'ip_prefix_set',
        metadata: { name, namespace },
        spec: { ipv4_prefixes: chunk.map((ipv4_prefix) => ({ ipv4_prefix })) },
      });
      refs.push({ name, namespace });
    });
    if (refs.length)
      rules.push({
        metadata: { name: `${skipWaf ? 'bypass-waf-for' : 'deny'}-${purpose}-clients` },
        spec: {
          action,
          any_client: {},
          any_asn: {},
          path: { prefix_values: ['/'] },
          ip_matcher: { prefix_sets: refs },
          waf_action: skipWaf ? { waf_skip_processing: {} } : { none: {} },
        },
      });
  }
  return [resources, rules];
}

function serviceRules(policy: AsmPolicy, options: ConvertOptions, warnings: ConversionWarning[]): Rule[] {
  const raw: Array<[string, Record<string, unknown>]> = [];
  for (const url of [...policy.urls].sort((a, b) => a.name.localeCompare(b.name))) {
    const path = pathMatcher(url.name);
    if (!url.allowed) raw.push([`deny-url-${url.name}`, baseRule('DENY', { path })]);
    if (!url.checkSignatures) raw.push([`disable-signatures-url-${url.name}`, signatureRule('url', 0, path)]);
    if (url.methods.length && url.methods.every((method) => XC_HTTP_METHODS.has(method)))
      raw.push([
        `deny-illegal-methods-url-${url.name}`,
        baseRule('DENY', { path, http_method: { methods: url.methods, invert_matcher: true } }),
      ]);
  }
  if (policy.methods.length && policy.methods.every((method) => XC_HTTP_METHODS.has(method)))
    raw.push([
      'deny-illegal-methods',
      baseRule('DENY', { http_method: { methods: policy.methods, invert_matcher: true } }),
    ]);
  for (const header of policy.headers) {
    if (header.mandatory)
      raw.push([
        `require-header-${header.name}`,
        baseRule('DENY', { headers: [{ name: header.name.toLowerCase(), check_not_present: {} }] }),
      ]);
    if (!header.checkSignatures)
      raw.push([`disable-signatures-header-${header.name}`, signatureRule('header', 0, undefined, header.name)]);
  }
  for (const parameter of policy.parameters) {
    const path = parameter.url ? pathMatcher(parameter.url) : { prefix_values: ['/'] };
    if (parameter.minimumValue !== undefined && parameter.maximumValue !== undefined) {
      const regex = regexForRange(parameter.minimumValue, parameter.maximumValue);
      raw.push([
        `parameter-range-${parameter.name}`,
        baseRule('DENY', {
          path,
          query_params: [
            { key: parameter.name, check_present: {} },
            { key: parameter.name, invert_matcher: true, item: { regex_values: [`^${regex}$`] } },
          ],
        }),
      ]);
    }
    if (parameter.maximumLength !== undefined)
      raw.push([
        `parameter-maximum-length-${parameter.name}`,
        baseRule('DENY', {
          path,
          query_params: [{ key: parameter.name, item: { regex_values: [`^.{${parameter.maximumLength + 1},}$`] } }],
        }),
      ]);
    if (!parameter.checkSignatures)
      raw.push([`disable-signatures-parameter-${parameter.name}`, signatureRule('parameter', 0, path, parameter.name)]);
  }
  if (policy.disallowedFileTypes.length)
    raw.push([
      'deny-file-types',
      baseRule('DENY', {
        path: { suffix_values: policy.disallowedFileTypes.map((item) => `.${item}`), transformers: ['LOWER_CASE'] },
      }),
    ]);
  const mapping = new Map(options.signatures.signatures.map((item) => [item.asm_id, item.xc_id]));
  for (const override of policy.signatureOverrides) {
    const mapped: number[] = [];
    const missing: number[] = [];
    for (const asmId of override.disabledAsmIds) {
      const xcId = mapping.get(asmId);
      if (xcId) mapped.push(xcId);
      else if (asmId >= 200_000_001 && asmId <= 299_999_999) mapped.push(asmId);
      else missing.push(asmId);
    }
    if (missing.length)
      failOrWarn(
        `signature mapping missing ASM IDs: ${missing.join(', ')}`,
        'missing-signature',
        options.allowPartial,
        warnings,
      );
    const ids = override.disableAll ? [0] : [...new Set(mapped)].sort((a, b) => a - b);
    chunks(ids, LIMITS.signatureContexts).forEach((chunk, index) => {
      if (!chunk.length) return;
      const suffix = ids.length <= LIMITS.signatureContexts ? '' : `-${index + 1}`;
      raw.push([
        `signature-exclusion-${override.contextType}-${override.contextName}${suffix}`,
        signatureRule(
          override.contextType,
          chunk,
          override.scopeUrl ? pathMatcher(override.scopeUrl) : undefined,
          override.contextName,
        ),
      ]);
    });
  }
  const names = uniqueRuleNames(raw.map(([name]) => name));
  return raw.map(([, spec], index) => ({ metadata: { name: names[index] ?? 'rule' }, spec }));
}

export function convert(policy: AsmPolicy, options: ConvertOptions): ConversionResult {
  const warnings: ConversionWarning[] = [];
  const unsupported = new Set(policy.unsupportedEnabledFeatures);
  for (const violation of policy.violations)
    if (!VIOLATION_MAP[violation.identifier])
      unsupported.add(violation.block ? violation.identifier : `disabled-violation:${violation.identifier}`);
  for (const method of [...policy.methods, ...policy.urls.flatMap((url) => url.methods)])
    if (!XC_HTTP_METHODS.has(method)) unsupported.add(`http-method:${method}`);
  if (policy.modifiedCookies.length) unsupported.add('allowed-modified-cookie');
  if (unsupported.size) {
    const values = [...unsupported].sort();
    if (!options.allowPartial)
      throw new MigrationError(
        'conversion',
        `enabled behavior cannot be represented by the pinned contract: ${values.join(', ')}`,
      );
    warnings.push(
      ...values.map((feature) => ({
        code: 'unsupported-enabled-feature',
        message: `Enabled behavior was omitted: ${feature}`,
        blocking: true,
      })),
    );
  }
  const target = dnsLabel(options.targetName ?? policy.sourceName);
  const namespace = dnsLabel(options.namespace);
  const resources: Resource[] = [appFirewall(policy, namespace, target, options, warnings)];
  const [clientResources, clientRules] = clientControls(policy, namespace, target, options, warnings);
  resources.push(...clientResources);
  let rules = [...clientRules, ...serviceRules(policy, options, warnings)];
  if (rules.length > LIMITS.rules) {
    failOrWarn(
      `generated ${rules.length} rules; pinned contract limit is ${LIMITS.rules}`,
      'rule-limit',
      options.allowPartial,
      warnings,
    );
    rules = rules.slice(0, LIMITS.rules);
    const referenced = new Set(
      rules.flatMap((rule) =>
        (
          ((rule.spec.ip_matcher as Record<string, unknown> | undefined)?.prefix_sets as
            | Array<{ name: string }>
            | undefined) ?? []
        ).map((ref) => ref.name),
      ),
    );
    for (let index = resources.length - 1; index >= 0; index -= 1)
      if (resources[index]?.kind === 'ip_prefix_set' && !referenced.has(resources[index]?.metadata.name ?? ''))
        resources.splice(index, 1);
  }
  resources.push({
    kind: 'service_policy',
    metadata: { name: dnsLabel(`${target}-service-policy`), namespace },
    spec: { rule_list: { rules } },
  });
  resources.sort((a, b) => `${a.kind}\0${a.metadata.name}`.localeCompare(`${b.kind}\0${b.metadata.name}`));
  const configPack: ConfigPack = { schema_version: 'asm-migration.config-pack/v1', resources };
  const validation = validateConfigPack(configPack);
  if (!validation.valid)
    throw new MigrationError(
      'contract',
      `generated config pack violates pinned contract: ${validation.issues
        .slice(0, 5)
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
  const counts: Record<string, number> = {};
  for (const resource of resources) counts[resource.kind] = (counts[resource.kind] ?? 0) + 1;
  const resource_counts = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  return {
    configPack,
    warnings,
    report: {
      complete: !warnings.some((warning) => warning.blocking),
      resource_counts,
      warning_count: warnings.length,
      contract: validation.contract,
      contract_valid: true,
    },
    inputHashes: {},
  };
}

export function mergeConfigPacks(...packs: ConfigPack[]): ConfigPack {
  const resources = new Map<string, Resource>();
  for (const pack of packs)
    for (const resource of pack.resources) {
      const key = `${resource.kind}/${resource.metadata.namespace}/${resource.metadata.name}`;
      const previous = resources.get(key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(resource))
        throw new MigrationError('conversion', `conflicting resource identity: ${key}`);
      resources.set(key, resource);
    }
  const merged: ConfigPack = {
    schema_version: 'asm-migration.config-pack/v1',
    resources: [...resources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, resource]) => resource),
  };
  if (!validateConfigPack(merged).valid)
    throw new MigrationError('contract', 'merged config pack violates pinned contract');
  return merged;
}
