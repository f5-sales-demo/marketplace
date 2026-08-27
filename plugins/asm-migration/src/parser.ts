import { basename, extname } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import ipaddr from 'ipaddr.js';
import type {
  AsmPolicy,
  NamedControl,
  ParameterDefinition,
  SignatureDatabase,
  SignatureOverride,
  UrlDefinition,
} from './types';
import { MigrationError } from './types';

export const MAX_XML_BYTES = 128 * 1024 * 1024;
type Node = Record<string, unknown>;

const array = (value: unknown): unknown[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const object = (value: unknown): Node =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Node) : {};

function xmlText(value: unknown): string {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function text(node: Node, key: string, fallback?: string): string | undefined {
  const value = node[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'object') {
    const nested = object(value)['#text'];
    return nested === undefined ? fallback : xmlText(nested).trim();
  }
  return xmlText(value).trim();
}

function name(node: Node, fallback = '*'): string {
  return xmlText(
    node['@_name'] ?? text(node, 'name') ?? text(node, 'parameter_name') ?? text(node, 'header_name') ?? fallback,
  );
}

function truth(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  return ['1', 'true', 'enabled', 'yes'].includes(String(value).trim().toLowerCase());
}

function integer(value: string | undefined): number | undefined {
  if (value === undefined || value === '' || value === '0') return undefined;
  if (!/^-?\d+$/.test(value)) throw new MigrationError('validation', 'expected an integer value');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new MigrationError('validation', 'integer value is outside the supported range');
  return parsed;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function controls(values: unknown[]): NamedControl[] {
  const keyed = new Map<string, NamedControl>();
  for (const value of values) {
    const item = object(value);
    const control = {
      name: name(item),
      mandatory: truth(text(item, 'is_mandatory')),
      checkSignatures: truth(text(item, 'check_attack_signatures', text(item, 'check_signatures', 'true')), true),
    };
    keyed.set(`${control.name}\0${control.mandatory}\0${control.checkSignatures}`, control);
  }
  return [...keyed.values()].sort((a, b) =>
    `${a.name}\0${a.mandatory}\0${a.checkSignatures}`.localeCompare(`${b.name}\0${b.mandatory}\0${b.checkSignatures}`),
  );
}

function normalizedNetwork(item: Node): string | undefined {
  const address = text(item, 'ip_address') ?? (item['@_ip'] ? String(item['@_ip']) : undefined);
  const mask = text(item, 'subnet_mask') ?? (item['@_mask'] ? String(item['@_mask']) : undefined);
  if (!address) return undefined;
  try {
    const parsed = ipaddr.parse(address);
    let prefix: number;
    if (!mask) prefix = parsed.kind() === 'ipv6' ? 128 : 32;
    else if (/^\d+$/.test(mask)) prefix = Number(mask);
    else {
      const maskAddress = ipaddr.parse(mask);
      if (maskAddress.kind() !== parsed.kind()) throw new Error('address family mismatch');
      const bits = maskAddress
        .toByteArray()
        .map((byte) => byte.toString(2).padStart(8, '0'))
        .join('');
      if (bits.includes('01')) throw new Error('non-contiguous mask');
      prefix = bits.replace(/0/g, '').length;
    }
    const network =
      parsed.kind() === 'ipv4'
        ? ipaddr.IPv4.networkAddressFromCIDR(`${address}/${prefix}`)
        : ipaddr.IPv6.networkAddressFromCIDR(`${address}/${prefix}`);
    return `${network.toString()}/${prefix}`;
  } catch {
    throw new MigrationError('validation', 'invalid client network');
  }
}

function parameters(root: Node): ParameterDefinition[] {
  const result = new Map<string, ParameterDefinition>();
  const add = (value: unknown, url?: string) => {
    const item = object(value);
    const minimumValue = integer(text(item, 'minimum_value'));
    const maximumValue = integer(text(item, 'maximum_value'));
    const maximumLength = integer(text(item, 'maximum_length'));
    const parameter: ParameterDefinition = {
      name: name(item),
      location: String(item['@_location'] ?? text(item, 'location', 'any')),
      ...(url ? { url } : {}),
      ...(minimumValue !== undefined ? { minimumValue } : {}),
      ...(maximumValue !== undefined ? { maximumValue } : {}),
      ...(maximumLength !== undefined ? { maximumLength } : {}),
      checkSignatures: truth(text(item, 'check_attack_signatures', text(item, 'check_signatures', 'true')), true),
    };
    result.set(JSON.stringify(parameter), parameter);
  };
  for (const value of array(object(root.parameters).parameter)) add(value);
  for (const urlValue of array(object(root.urls).url)) {
    const url = object(urlValue);
    for (const value of [...array(url.parameter), ...array(object(url.parameters).parameter)])
      add(value, name(url, '/'));
  }
  return [...result.values()].sort((a, b) =>
    `${a.url ?? ''}\0${a.location}\0${a.name}`.localeCompare(`${b.url ?? ''}\0${b.location}\0${b.name}`),
  );
}

function signatureOverrides(root: Node): SignatureOverride[] {
  type Context = { type: SignatureOverride['contextType']; name: string; scopeUrl?: string };
  const groups = new Map<string, { context: Context; ids: Set<number>; disableAll: boolean }>();
  const add = (attack: Node, context: Context) => {
    const state = String(attack['#text'] ?? '')
      .trim()
      .toLowerCase();
    const enabled = !['disabled', 'false', '0'].includes(state) && truth(text(attack, 'enabled'), true);
    if (enabled) return;
    const ids = new Set<number>();
    const direct = attack['@_sig_id'] ?? attack['@_id'];
    if (direct !== undefined && /^\d+$/.test(String(direct))) ids.add(Number(direct));
    for (const value of array(attack.signature)) {
      const signature = object(value);
      const raw = signature['@_signature_id'] ?? signature['@_sig_id'] ?? signature['@_id'] ?? signature['#text'];
      if (raw !== undefined && /^\d+$/.test(String(raw).trim())) ids.add(Number(raw));
    }
    const key = `${context.type}\0${context.name}\0${context.scopeUrl ?? ''}`;
    const group = groups.get(key) ?? { context, ids: new Set<number>(), disableAll: false };
    for (const id of ids) group.ids.add(id);
    if (ids.size === 0) group.disableAll = true;
    groups.set(key, group);
  };
  const walk = (value: unknown, context: Context): void => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, context);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const node = object(value);
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('@_') || key === '#text' || key === 'attack_signatures') continue;
      if (key === 'attack_signature') {
        for (const attack of array(child)) add(object(attack), context);
        continue;
      }
      for (const childValue of array(child)) {
        const childNode = object(childValue);
        let next = context;
        if (key === 'url') next = { type: 'url', name: name(childNode), scopeUrl: name(childNode, '/') };
        if (key === 'parameter')
          next = {
            type: 'parameter',
            name: name(childNode),
            ...(context.scopeUrl ? { scopeUrl: context.scopeUrl } : {}),
          };
        if (key === 'header')
          next = { type: 'header', name: name(childNode), ...(context.scopeUrl ? { scopeUrl: context.scopeUrl } : {}) };
        if (key === 'cookie' || key === 'allowed_modified_cookie')
          next = { type: 'cookie', name: name(childNode), ...(context.scopeUrl ? { scopeUrl: context.scopeUrl } : {}) };
        walk(childValue, next);
      }
    }
  };
  walk(root, { type: 'global', name: '*' });
  for (const value of array(object(root.attack_signatures).signature)) {
    const signature = object(value);
    if (truth(text(signature, 'enabled'), true)) continue;
    const raw = signature['@_signature_id'];
    if (raw !== undefined && /^\d+$/.test(String(raw))) {
      const context: Context = { type: 'global', name: '*' };
      const key = 'global\0*\0';
      const group = groups.get(key) ?? { context, ids: new Set<number>(), disableAll: false };
      group.ids.add(Number(raw));
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .sort((a, b) =>
      `${a.context.type}\0${a.context.name}\0${a.context.scopeUrl ?? ''}`.localeCompare(
        `${b.context.type}\0${b.context.name}\0${b.context.scopeUrl ?? ''}`,
      ),
    )
    .map(({ context, ids, disableAll }) => ({
      contextType: context.type,
      contextName: context.name,
      disabledAsmIds: [...ids].sort((a, b) => a - b),
      disableAll,
      ...(context.scopeUrl ? { scopeUrl: context.scopeUrl } : {}),
    }));
}

export function parseAsmXml(payload: Uint8Array, sourcePath = 'policy.xml'): AsmPolicy {
  if (payload.byteLength > MAX_XML_BYTES)
    throw new MigrationError('unsafe_input', `policy exceeds ${MAX_XML_BYTES} byte limit`);
  const prefix = new TextDecoder().decode(payload.slice(0, 65_536)).toLowerCase();
  if (prefix.includes('<!doctype') || prefix.includes('<!entity'))
    throw new MigrationError('unsafe_input', 'DTD and entity declarations are not allowed');
  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(payload);
  } catch {
    throw new MigrationError('validation', 'invalid ASM XML encoding');
  }
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) throw new MigrationError('validation', 'invalid ASM XML');
  let parsed: Node;
  try {
    parsed = object(
      new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseTagValue: false,
        parseAttributeValue: false,
        processEntities: false,
        trimValues: true,
        removeNSPrefix: true,
        ignoreDeclaration: true,
      }).parse(xml),
    );
  } catch {
    throw new MigrationError('validation', 'invalid ASM XML');
  }
  const root = object(parsed.policy);
  if (!parsed.policy || Object.keys(parsed).length !== 1)
    throw new MigrationError('validation', 'root element must be policy');
  const blocking = object(root.blocking);
  const urls: UrlDefinition[] = array(object(root.urls).url).map((value) => {
    const item = object(value);
    const methodValues = [...array(item.method), ...array(object(item.methods).method)]
      .map((method) => {
        const node = object(method);
        return String(node['@_name'] ?? node['#text'] ?? method)
          .trim()
          .toUpperCase();
      })
      .filter(Boolean);
    return {
      name: name(item, '/'),
      allowed: truth(text(item, 'is_allowed'), true),
      checkSignatures: truth(text(item, 'check_attack_signatures', text(item, 'check_signatures', 'true')), true),
      methods: uniqueSorted(methodValues),
    };
  });
  const methodValues = [...array(object(root.http_methods).http_method), ...array(object(root.methods).method)]
    .map((value) => name(object(value)).toUpperCase().replace('UPDATE', 'PATCH'))
    .filter((value) => value !== '*');
  const responseCodes = array(root.allowed_response_code).map((value) => {
    const raw = typeof value === 'object' ? String(object(value)['#text'] ?? '') : String(value);
    if (!/^\d+$/.test(raw)) throw new MigrationError('validation', 'invalid HTTP response code');
    const code = Number(raw);
    if (code < 100 || code > 599) throw new MigrationError('validation', 'HTTP response code out of range');
    return code;
  });
  const networkValues = (values: unknown[]) =>
    uniqueSorted(
      values.map((value) => normalizedNetwork(object(value))).filter((value): value is string => Boolean(value)),
    ).sort((a, b) => (a.includes(':') === b.includes(':') ? a.localeCompare(b) : a.includes(':') ? 1 : -1));
  const customPages = array(blocking.response_page)
    .map(object)
    .filter((item) => item['@_cause'] === 'default' && text(item, 'response_type') === 'custom');
  const customBody = customPages.length ? text(customPages[0] ?? {}, 'response_html_code') : undefined;
  const unsupported = [
    ['csrf', object(root.csrf).enabled],
    ['session-awareness', object(root.session_awareness).enabled],
    ['redirection-protection', object(root.redirection_protection).enabled],
  ]
    .filter(([, value]) => truth(typeof value === 'object' ? object(value)['#text'] : value))
    .map(([key]) => key as string);
  return {
    sourceName: basename(sourcePath, extname(sourcePath)),
    enforcementMode:
      text(blocking, 'enforcement_mode', 'blocking')?.toLowerCase() === 'transparent' ? 'transparent' : 'blocking',
    violations: array(blocking.violation).map((value) => {
      const item = object(value);
      return {
        identifier: String(item['@_id'] ?? name(item)),
        alarm: truth(text(item, 'alarm')),
        block: truth(text(item, 'block')),
      };
    }),
    urls,
    methods: uniqueSorted(methodValues),
    headers: controls([...array(object(root.headers).header), ...array(root.header)]),
    modifiedCookies: controls(array(object(root.headers).allowed_modified_cookie)),
    parameters: parameters(root),
    disallowedFileTypes: uniqueSorted(
      array(object(object(root.file_types).disallowed_file_types).file_type)
        .map((value) => name(object(value)).toLowerCase().replace(/^\./, ''))
        .filter((value) => value !== '*'),
    ),
    allowedResponseCodes: [...new Set(responseCodes)].sort((a, b) => a - b),
    trustedClients: networkValues(array(root.whitelist)),
    blockedClients: networkValues([...array(root.blacklist), ...array(object(root.blocked_clients).client)]),
    signatureOverrides: signatureOverrides(root),
    ...(customBody ? { customResponse: { body: customBody, status: 200 } } : {}),
    unsupportedEnabledFeatures: unsupported,
  };
}

export function parseSignatureDatabase(payload: Uint8Array): SignatureDatabase {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
  } catch {
    throw new MigrationError('signature', 'invalid signature file');
  }
  const database = object(value);
  if (database.schema_version !== 'asm-migration.signatures/v1' || !Array.isArray(database.signatures))
    throw new MigrationError('signature', 'invalid signature file schema');
  const asmIds = new Set<number>();
  const xcIds = new Set<number>();
  const signatures = database.signatures.map((raw) => {
    const item = object(raw);
    const asmId = Number(item.asm_id);
    const xcId = Number(item.xc_id);
    if (
      !Number.isInteger(item.asm_id) ||
      asmId <= 0 ||
      !Number.isInteger(item.xc_id) ||
      xcId < 200_000_001 ||
      xcId > 299_999_999
    )
      throw new MigrationError('signature', 'invalid signature file identifiers');
    if (asmIds.has(asmId) || xcIds.has(xcId)) throw new MigrationError('signature', 'signature IDs must be unique');
    asmIds.add(asmId);
    xcIds.add(xcId);
    return { asm_id: asmId, xc_id: xcId, ...(typeof item.name === 'string' ? { name: item.name } : {}) };
  });
  return { schema_version: 'asm-migration.signatures/v1', signatures };
}
