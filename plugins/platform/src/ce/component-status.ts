type Json = Record<string, unknown>;
export interface ExpectedCeComponentStatus {
  siteUid: string;
  vesNamespace: string;
  services: { node: string; name: string }[];
}
export interface CeComponentStatus {
  node: string;
  name: string;
  status: 'Ready';
  message: string;
}
function require(value: unknown): asserts value {
  if (!value) throw Error('Component status schema or evidence is unqualified');
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value));
  return value as Json;
}
export const componentStatusPath =
  '/api/operate/namespaces/{namespace}/sites/{site}/vpm/debug/global/{vesnamespace}/status';
const safeName = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** Verify the operation and response mapping in the already verified immutable API bytes. */
export function componentStatusRequest(api: unknown, site: string, namespace: string) {
  require(safeName.test(site) && safeName.test(namespace));
  const document = object(api),
    operation = object(object(object(document.paths)[componentStatusPath]).get);
  require(operation.operationId === 'ves.io.schema.operate.debug.CustomPublicAPI.Status');
  const response = object(
    object(object(object(object(operation.responses)['200']).content)['application/json']).schema,
  );
  require(response.$ref === '#/components/schemas/debugStatusResponse');
  require(Array.isArray(operation.parameters));
  const parameters = operation.parameters.map(object);
  for (const name of ['namespace', 'site', 'vesnamespace', 'cached']) {
    const matches = parameters.filter((v) => v.name === name);
    require(matches.length === 1);
    const p = matches[0];
    require(
      p.in === (name === 'cached' ? 'query' : 'path') &&
        p.required === (name !== 'cached') &&
        object(p.schema).type === (name === 'cached' ? 'boolean' : 'string'),
    );
  }
  const schemas = object(object(document.components).schemas),
    row = object(schemas.debugStatus),
    responseSchema = object(schemas.debugStatusResponse);
  require(row.type === 'object' && responseSchema.type === 'object');
  const properties = object(row.properties);
  require(Object.keys(properties).length === 4);
  for (const key of ['node', 'name', 'status', 'message']) require(object(properties[key]).type === 'string');
  const rows = object(object(responseSchema.properties).status);
  require(rows.type === 'array' && object(rows.items).$ref === '#/components/schemas/debugStatus');
  return {
    method: 'GET' as const,
    path: `/api/operate/namespaces/system/sites/${site}/vpm/debug/global/${namespace}/status?cached=false`,
  };
}
export function validateExpectedComponentStatus(expected: ExpectedCeComponentStatus, nodes: string[]) {
  require(
    typeof expected.siteUid === 'string' &&
      expected.siteUid.length > 0 &&
      expected.siteUid.length <= 1024 &&
      expected.siteUid.trim() === expected.siteUid &&
      safeName.test(expected.vesNamespace) &&
      Array.isArray(expected.services) &&
      expected.services.length > 0 &&
      expected.services.length <= 4096,
  );
  const identities = new Set<string>();
  for (const service of expected.services) {
    const v = object(service);
    require(
      Object.keys(v).length === 2 &&
        typeof v.node === 'string' &&
        nodes.includes(v.node) &&
        typeof v.name === 'string' &&
        v.name.length > 0 &&
        v.name.length <= 1024 &&
        v.name.trim() === v.name,
    );
    const key = JSON.stringify([v.node, v.name]);
    require(!identities.has(key));
    identities.add(key);
  }
  require(nodes.every((node) => expected.services.some((v) => v.node === node)));
}
/** Only the documented Ready spelling is recognized. No inferred down or node-health state. */
export function parseComponentStatus(response: unknown, expected: ExpectedCeComponentStatus): CeComponentStatus[] {
  const value = object(response);
  require(
    Object.keys(value).length === 1 && Array.isArray(value.status) && value.status.length === expected.services.length,
  );
  const rows = value.status.map(object),
    seen = new Set<string>();
  for (const row of rows) {
    require(
      Object.keys(row).length === 4 &&
        typeof row.node === 'string' &&
        typeof row.name === 'string' &&
        row.status === 'Ready' &&
        typeof row.message === 'string' &&
        row.message.length <= 65536,
    );
    const key = JSON.stringify([row.node, row.name]);
    require(!seen.has(key) && expected.services.some((v) => v.node === row.node && v.name === row.name));
    seen.add(key);
  }
  return expected.services.map((v) => {
    const row = rows.find((row) => row.node === v.node && row.name === v.name);
    require(row);
    return { ...v, status: 'Ready', message: row.message as string };
  });
}
