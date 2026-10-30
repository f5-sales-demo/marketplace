import { createWireValidator } from './wire-schema';

type Json = Record<string, unknown>;
export const nodeHealthPath = '/api/operate/namespaces/{namespace}/sites/{site}/vpm/debug/{node}/exec-user';
export interface ExpectedCeNodeHealthIdentity {
  siteUid: string;
  node: string;
  instances: Record<string, string>;
}
export interface ExpectedCeNodeHealth extends ExpectedCeNodeHealthIdentity {
  expectedFqdn: string;
}
export function nodeHealthSchemaClosure(schemas: Json): Json {
  const selected: Json = {};
  const include = (key: string) => {
    if (Object.hasOwn(selected, key) || !Object.hasOwn(schemas, key)) return;
    selected[key] = schemas[key];
    walk(schemas[key]);
  };
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
    } else if (value && typeof value === 'object') {
      const row = value as Json;
      if (typeof row.$ref === 'string' && row.$ref.startsWith('#/components/schemas/'))
        include(row.$ref.slice('#/components/schemas/'.length));
      for (const [key, child] of Object.entries(row)) if (key !== '$ref') walk(child);
    }
  };
  for (const root of ['debugExecRequest', 'debugExecResponse', 'debugHealthResponse']) include(root);
  return selected;
}
function require(value: unknown): asserts value {
  if (!value) throw Error('Node health schema, identity or evidence is unqualified');
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value));
  return value as Json;
}
const text = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 256 &&
  v.trim() === v &&
  [...v].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127) &&
  !['undefined', 'null'].includes(v);
const name = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v) &&
  !['global', 'all', 'undefined', 'null'].includes(v);

/** JSON.parse validates grammar; the second pass rejects ambiguous duplicate keys, including
 * escaped spellings and keys nested in optional health evidence. No values enter diagnostics.
 */
export function parseNodeHealthJson(raw: string): Json {
  require(typeof raw === 'string' && raw.length > 0 && raw.length <= 131072);
  let parsed: Json;
  try {
    parsed = object(JSON.parse(raw));
  } catch {
    throw Error('Node health JSON is malformed or ambiguous');
  }
  let offset = 0;
  const whitespace = () => {
    while (/\s/u.test(raw[offset] ?? '') && offset < raw.length) offset++;
  };
  const string = () => {
    const token = /"(?:\\.|[^"\\])*"/y;
    token.lastIndex = offset;
    const match = token.exec(raw);
    require(match);
    offset = token.lastIndex;
    return JSON.parse(match[0]) as string;
  };
  const value = (depth: number): void => {
    require(depth <= 64);
    whitespace();
    if (raw[offset] === '{') {
      offset++;
      whitespace();
      const keys = new Set<string>();
      if (raw[offset] !== '}')
        while (true) {
          whitespace();
          const key = string();
          require(!keys.has(key));
          keys.add(key);
          whitespace();
          require(raw[offset++] === ':');
          value(depth + 1);
          whitespace();
          if (raw[offset] !== ',') break;
          offset++;
        }
      require(raw[offset++] === '}');
    } else if (raw[offset] === '[') {
      offset++;
      whitespace();
      if (raw[offset] !== ']')
        while (true) {
          value(depth + 1);
          whitespace();
          if (raw[offset] !== ',') break;
          offset++;
        }
      require(raw[offset++] === ']');
    } else if (raw[offset] === '"') string();
    else {
      const token = /(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/y;
      token.lastIndex = offset;
      const match = token.exec(raw);
      require(match);
      if (/^-?[0-9]/u.test(match[0])) require(Number.isFinite(Number(match[0])));
      offset = token.lastIndex;
    }
  };
  value(0);
  whitespace();
  require(offset === raw.length);
  return parsed;
}

/** Response annotations retain their observational meaning. readOnly is not a prohibition on
 * receiving that field; inferred extension annotations are not normative schema constraints.
 */
function responseSchemas(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(responseSchemas);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'readOnly')
      .map(([key, child]) => [key, responseSchemas(child)]),
  );
}
export function nodeHealthRequest(document: unknown, site: string, node: string) {
  require(name(site) && name(node));
  const api = object(document),
    operation = object(object(object(api.paths)[nodeHealthPath]).post);
  require(operation.operationId === 'ves.io.schema.operate.debug.CustomPublicAPI.ExecUser');
  require(object(operation.requestBody).required === true);
  require(Array.isArray(operation.parameters) && operation.parameters.length === 3);
  for (const key of ['namespace', 'site', 'node']) {
    const rows = operation.parameters.map(object).filter((v) => v.name === key);
    require(
      rows.length === 1 &&
        rows[0].in === 'path' &&
        rows[0].required === true &&
        object(rows[0].schema).type === 'string',
    );
  }
  require(
    object(object(object(object(operation.requestBody).content)['application/json']).schema).$ref ===
      '#/components/schemas/debugExecRequest',
  );
  require(
    object(object(object(object(object(operation.responses)['200']).content)['application/json']).schema).$ref ===
      '#/components/schemas/debugExecResponse',
  );
  const schemas = object(object(api.components).schemas),
    request = object(schemas.debugExecRequest),
    response = object(schemas.debugExecResponse),
    health = object(schemas.debugHealthResponse);
  require(request.type === 'object' && response.type === 'object' && health.type === 'object');
  const command = object(object(request.properties).command),
    returned = object(response.properties);
  require(
    command.type === 'array' &&
      object(command.items).type === 'string' &&
      object(returned.output).type === 'string' &&
      object(returned.return_code).type === 'integer',
  );
  const properties = object(health.properties);
  require(object(properties.hostname).type === 'string' && object(properties.fqdn).type === 'string');
  const state = object(properties.state),
    roles = object(properties.roles),
    stateSchema = object(schemas.debugVpmState);
  require(
    !Object.hasOwn(state, 'type') &&
      Array.isArray(state.allOf) &&
      state.allOf.length === 1 &&
      object(state.allOf[0]).$ref === '#/components/schemas/debugVpmState' &&
      stateSchema.type === 'string' &&
      Array.isArray(stateSchema.enum) &&
      JSON.stringify(stateSchema.enum) ===
        JSON.stringify([
          'WAITING_FOR_CONFIG',
          'WAITING_FOR_APPROVAL',
          'PROVISIONING',
          'PROVISIONED',
          'FAILED',
          'RESETTING',
        ]) &&
      roles.type === 'array' &&
      object(roles.items).type === 'string' &&
      ['software_version', 'os_version', 'version'].every((key) => object(properties[key]).type === 'string'),
  );
  createWireValidator(object(responseSchemas(schemas)), 'debugExecResponse');
  createWireValidator(object(responseSchemas(schemas)), 'debugHealthResponse');
  const body = { command: ['health'] };
  createWireValidator(schemas, 'debugExecRequest')(body);
  return {
    method: 'POST' as const,
    path: nodeHealthPath.replace('{namespace}', 'system').replace('{site}', site).replace('{node}', node),
    body,
    timeoutMs: 15000,
  };
}
export function validateExpectedNodeHealthIdentity(expected: ExpectedCeNodeHealthIdentity, nodes: string[]) {
  require(
    text(expected.siteUid) &&
      name(expected.node) &&
      nodes.includes(expected.node) &&
      [1, 3].includes(nodes.length) &&
      new Set(nodes).size === nodes.length,
  );
  const instances = object(expected.instances);
  require(
    Object.keys(instances).length === nodes.length &&
      nodes.every((node) => text(instances[node])) &&
      new Set(Object.values(instances)).size === nodes.length,
  );
}
export function validateExpectedNodeHealth(expected: ExpectedCeNodeHealth, nodes: string[]) {
  validateExpectedNodeHealthIdentity(expected, nodes);
  require(
    text(expected.expectedFqdn) &&
      expected.expectedFqdn.length <= 253 &&
      expected.expectedFqdn.startsWith(`${expected.node}.`) &&
      expected.expectedFqdn.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)),
  );
}

/** Acquire the reported registration FQDN from the selected, owned node's command response.
 * This validates the full response and expected hostname; no readiness claim is returned.
 * A subsequent independent command must verify this acquired identity before use.
 */
export function parseNodeHealthBindingResponse(
  document: unknown,
  value: unknown,
  expected: ExpectedCeNodeHealthIdentity,
  nodes: string[],
) {
  validateExpectedNodeHealthIdentity(expected, nodes);
  const schemas = object(responseSchemas(object(object(object(document).components).schemas))),
    response = object(value);
  createWireValidator(schemas, 'debugExecResponse')(response);
  require(response.return_code === 0 && typeof response.output === 'string' && response.output.length <= 65536);
  const health = parseNodeHealthJson(response.output);
  createWireValidator(schemas, 'debugHealthResponse')(health);
  require(typeof health.fqdn === 'string' && health.hostname === expected.node);
  const binding = { ...structuredClone(expected), expectedFqdn: health.fqdn };
  validateExpectedNodeHealth(binding, nodes);
  parseNodeHealthResponse(document, value, binding);
  return binding;
}
export function parseNodeHealthResponse(document: unknown, value: unknown, expected: ExpectedCeNodeHealth) {
  const schemas = object(responseSchemas(object(object(object(document).components).schemas))),
    response = object(value);
  createWireValidator(schemas, 'debugExecResponse')(response);
  require(response.return_code === 0 && typeof response.output === 'string' && response.output.length <= 65536);
  const health = parseNodeHealthJson(response.output);
  createWireValidator(schemas, 'debugHealthResponse')(health);
  require(
    health.hostname === expected.node &&
      health.fqdn === expected.expectedFqdn &&
      ['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'].includes(
        String(health.state),
      ) &&
      Array.isArray(health.roles) &&
      health.roles.length > 0 &&
      health.roles.length <= 32 &&
      health.roles.every(text) &&
      new Set(health.roles).size === health.roles.length &&
      [health.software_version, health.os_version, health.version].every(text),
  );
  return {
    status: 'observed' as const,
    readiness: health.state === 'PROVISIONED' ? ('ready' as const) : ('not-ready' as const),
    node: expected.node,
    fqdn: expected.expectedFqdn,
    state: health.state as string,
    roles: [...health.roles] as string[],
    softwareVersion: health.software_version as string,
    osVersion: health.os_version as string,
    vpmVersion: health.version as string,
  };
}
