type Json = Record<string, unknown>;
export interface CeComponentCatalogEntry {
  node: string;
  name: string;
  value: string;
}
export const componentCatalogPath = '/api/operate/namespaces/{namespace}/sites/{site}/vpm/debug/global/list-service';
function require(value: unknown): asserts value {
  if (!value) throw Error('Component catalog schema or evidence is unqualified');
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value));
  return value as Json;
}
export function componentCatalogRequest(api: unknown, site: string) {
  require(/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(site));
  const document = object(api),
    operation = object(object(object(document.paths)[componentCatalogPath]).get);
  require(operation.operationId === 'ves.io.schema.operate.debug.CustomPublicAPI.ListVolterraServices');
  require(Array.isArray(operation.parameters) && operation.parameters.length === 2);
  for (const name of ['namespace', 'site']) {
    const rows = operation.parameters.map(object).filter((v) => v.name === name);
    require(
      rows.length === 1 &&
        rows[0].in === 'path' &&
        rows[0].required === true &&
        object(rows[0].schema).type === 'string',
    );
  }
  const response = object(
    object(object(object(object(operation.responses)['200']).content)['application/json']).schema,
  );
  require(response.$ref === '#/components/schemas/debugListServicesResponse');
  const schemas = object(object(document.components).schemas),
    row = object(schemas.debugService),
    responseSchema = object(schemas.debugListServicesResponse);
  require(row.type === 'object' && responseSchema.type === 'object');
  const properties = object(row.properties);
  require(Object.keys(properties).length === 3);
  for (const key of ['node', 'name', 'value']) require(object(properties[key]).type === 'string');
  const rows = object(object(responseSchema.properties).service);
  require(rows.type === 'array' && object(rows.items).$ref === '#/components/schemas/debugService');
  return { method: 'GET' as const, path: `/api/operate/namespaces/system/sites/${site}/vpm/debug/global/list-service` };
}
/** Short service values and display names remain separate; neither is a status namespace.
 * This catalog has no documented original sample timestamp and does not prove node health.
 */
export function parseComponentCatalog(response: unknown, nodes: string[]): CeComponentCatalogEntry[] {
  require(Array.isArray(nodes) && [1, 3].includes(nodes.length) && new Set(nodes).size === nodes.length);
  const value = object(response);
  require(
    Object.keys(value).length === 1 &&
      Array.isArray(value.service) &&
      value.service.length > 0 &&
      value.service.length <= 4096,
  );
  const rows = value.service.map(object),
    seen = new Set<string>();
  for (const row of rows) {
    require(Object.keys(row).length === 3 && typeof row.node === 'string' && nodes.includes(row.node));
    for (const key of ['name', 'value'])
      require(
        typeof row[key] === 'string' && row[key].length > 0 && row[key].length <= 1024 && row[key].trim() === row[key],
      );
    require(typeof row.value === 'string' && !/^__.*__$/.test(row.value));
    const key = JSON.stringify([row.node, row.value]);
    require(!seen.has(key));
    seen.add(key);
  }
  require(nodes.every((node) => rows.some((row) => row.node === node)));
  return rows
    .map((row) => ({ node: row.node as string, name: row.name as string, value: row.value as string }))
    .sort((a, b) => JSON.stringify([a.node, a.value]).localeCompare(JSON.stringify([b.node, b.value])));
}
