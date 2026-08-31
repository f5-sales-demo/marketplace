import { describe, expect, test } from 'bun:test';
import { buildContract } from '../scripts/import-contract';

const definitions = [
  ['app_firewall', 'app_firewalls'],
  ['ip_prefix_set', 'ip_prefix_sets'],
  ['service_policy', 'service_policys'],
  ['service_policy_rule', 'service_policy_rules'],
] as const;

function inputs() {
  const schemas: Record<string, unknown> = {
    shared: { properties: { child: { $ref: '#/components/schemas/leaf' } }, type: 'object' },
    leaf: { type: 'string' },
  };
  const paths: Record<string, unknown> = {};
  const apiOperations: unknown[] = [];
  for (const [kind, collection] of definitions) {
    const root = `${kind}CreateRequest`;
    const operationId = `ves.io.schema.${kind}.API.Create`;
    const path = `/api/config/namespaces/{metadata.namespace}/${collection}`;
    schemas[root] = { allOf: [{ $ref: '#/components/schemas/shared' }] };
    paths[path] = {
      post: {
        operationId,
        requestBody: { content: { 'application/json': { schema: { $ref: `#/components/schemas/${root}` } } } },
      },
    };
    apiOperations.push({
      apiIdentity: `ves.io.schema.${kind}`,
      operations: [{ method: 'POST', operationId, path, requestSchema: root }],
    });
  }
  return {
    openapi: new TextEncoder().encode(JSON.stringify({ openapi: '3.0.0', paths, components: { schemas } })),
    catalog: new TextEncoder().encode(JSON.stringify({ apiOperations })),
  };
}

describe('released contract importer', () => {
  test('verifies all create operations and emits stable transitive schemas', () => {
    const source = inputs();
    const first = buildContract(source.openapi, source.catalog, 'v4.0.3', 'a'.repeat(40));
    const second = buildContract(source.openapi, source.catalog, 'v4.0.3', 'a'.repeat(40));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.keys((first.bundle.components as { schemas: Record<string, unknown> }).schemas)).toEqual([
      'app_firewallCreateRequest',
      'ip_prefix_setCreateRequest',
      'leaf',
      'service_policyCreateRequest',
      'service_policy_ruleCreateRequest',
      'shared',
    ]);
    expect(first.provenance.release).toBe('v4.0.3');
  });

  test('fails on unresolved transitive references and catalog disagreement', () => {
    const source = inputs();
    const openapi = JSON.parse(new TextDecoder().decode(source.openapi));
    delete openapi.components.schemas.leaf;
    expect(() =>
      buildContract(new TextEncoder().encode(JSON.stringify(openapi)), source.catalog, 'v4.0.3', 'b'.repeat(40)),
    ).toThrow('unresolved schema reference: leaf');
    const catalog = JSON.parse(new TextDecoder().decode(source.catalog));
    catalog.apiOperations[2].operations[0].path = '/wrong';
    expect(() =>
      buildContract(source.openapi, new TextEncoder().encode(JSON.stringify(catalog)), 'v4.0.3', 'b'.repeat(40)),
    ).toThrow('catalog disagrees');
  });
});
