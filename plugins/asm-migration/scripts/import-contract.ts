import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const ROOTS = {
  app_firewall: 'app_firewallCreateRequest',
  ip_prefix_set: 'ip_prefix_setCreateRequest',
  service_policy: 'service_policyCreateRequest',
  service_policy_rule: 'service_policy_ruleCreateRequest',
} as const;

const CREATE_OPERATIONS = {
  app_firewall: {
    operationId: 'ves.io.schema.app_firewall.API.Create',
    path: '/api/config/namespaces/{metadata.namespace}/app_firewalls',
  },
  ip_prefix_set: {
    operationId: 'ves.io.schema.ip_prefix_set.API.Create',
    path: '/api/config/namespaces/{metadata.namespace}/ip_prefix_sets',
  },
  service_policy: {
    operationId: 'ves.io.schema.service_policy.API.Create',
    path: '/api/config/namespaces/{metadata.namespace}/service_policys',
  },
  service_policy_rule: {
    operationId: 'ves.io.schema.service_policy_rule.API.Create',
    path: '/api/config/namespaces/{metadata.namespace}/service_policy_rules',
  },
} as const;

const object = (value: Json | undefined, label: string): JsonObject => {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object`);
  return value;
};

const sorted = (value: Json): Json => {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sorted(value[key] as Json)]),
  );
};

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function references(value: Json, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) references(item, found);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && typeof child === 'string') {
        if (!child.startsWith('#/components/schemas/')) throw new Error(`unsupported reference: ${child}`);
        found.add(
          decodeURIComponent(child.slice('#/components/schemas/'.length)).replaceAll('~1', '/').replaceAll('~0', '~'),
        );
      } else references(child, found);
    }
  }
  return found;
}

export function buildContract(
  openapiBytes: Uint8Array,
  catalogBytes: Uint8Array,
  release: string,
  commit: string,
): { bundle: JsonObject; provenance: JsonObject } {
  if (!/^v\d+\.\d+\.\d+$/.test(release)) throw new Error(`invalid release tag: ${release}`);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`invalid immutable commit: ${commit}`);
  const openapi = object(JSON.parse(new TextDecoder().decode(openapiBytes)), 'OpenAPI document');
  const catalog = object(JSON.parse(new TextDecoder().decode(catalogBytes)), 'API catalog');
  const paths = object(openapi.paths, 'OpenAPI paths');
  const components = object(openapi.components, 'OpenAPI components');
  const schemas = object(components.schemas, 'OpenAPI schemas');
  const groups = catalog.apiOperations;
  if (!Array.isArray(groups)) throw new Error('API catalog apiOperations must be an array');
  const catalogOperations = groups.flatMap((group) => {
    const operations = object(group, 'API group').operations;
    if (!Array.isArray(operations)) throw new Error('API group operations must be an array');
    return operations.map((operation) => object(operation, 'catalog operation'));
  });

  for (const [kind, expected] of Object.entries(CREATE_OPERATIONS)) {
    const root = ROOTS[kind as keyof typeof ROOTS];
    const post = object(object(paths[expected.path], `OpenAPI path ${expected.path}`).post, `POST ${expected.path}`);
    if (post.operationId !== expected.operationId) throw new Error(`unexpected operationId for ${expected.path}`);
    const requestBody = object(post.requestBody, `${expected.operationId} requestBody`);
    const content = object(requestBody.content, `${expected.operationId} request content`);
    const media = object(content['application/json'], `${expected.operationId} JSON request`);
    const schema = object(media.schema, `${expected.operationId} request schema`);
    if (schema.$ref !== `#/components/schemas/${root}`)
      throw new Error(`unexpected request schema for ${expected.operationId}`);
    const catalogOperation = catalogOperations.find((operation) => operation.operationId === expected.operationId);
    if (!catalogOperation) throw new Error(`catalog is missing ${expected.operationId}`);
    if (
      catalogOperation.method !== 'POST' ||
      catalogOperation.path !== expected.path ||
      catalogOperation.requestSchema !== root
    )
      throw new Error(`catalog disagrees with OpenAPI for ${expected.operationId}`);
  }

  const selected = new Map<string, Json>();
  const pending: string[] = Object.values(ROOTS).sort().reverse();
  while (pending.length) {
    const name = pending.pop() as string;
    if (selected.has(name)) continue;
    const schema = schemas[name];
    if (schema === undefined) throw new Error(`unresolved schema reference: ${name}`);
    selected.set(name, schema);
    for (const dependency of [...references(schema)].sort().reverse())
      if (!selected.has(dependency)) pending.push(dependency);
  }
  const selectedSchemas = Object.fromEntries(
    [...selected.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  const bundle = sorted({
    components: { schemas: selectedSchemas },
    info: { title: 'XCify pinned F5 XC create contract', version: commit },
    openapi: openapi.openapi ?? '3.0.0',
    'x-asm-migration-roots': ROOTS,
  }) as JsonObject;
  const bundleBytes = new TextEncoder().encode(`${JSON.stringify(bundle, null, 2)}\n`);
  const provenance = sorted({
    bundle_sha256: digest(bundleBytes),
    commit,
    generator: { name: 'asm-migration contract import', version: '2' },
    license: {
      attribution: 'Copyright f5-sales-demo/api-specs-enriched contributors',
      spdx: 'MIT',
    },
    release,
    repository: 'f5-sales-demo/api-specs-enriched',
    roots: ROOTS,
    schema_count: selected.size,
    source: {
      catalog_path: 'api-catalog.json',
      catalog_sha256: digest(catalogBytes),
      openapi_path: 'openapi.json',
      source_spec_sha256: digest(openapiBytes),
    },
  }) as JsonObject;
  return { bundle, provenance };
}

if (import.meta.main) {
  const [openapiPath, catalogPath, release, commit, outputDirectory = resolve(import.meta.dir, '../contracts')] =
    Bun.argv.slice(2);
  if (!openapiPath || !catalogPath || !release || !commit)
    throw new Error('usage: bun scripts/import-contract.ts OPENAPI CATALOG RELEASE COMMIT [OUTPUT_DIRECTORY]');
  const { bundle, provenance } = buildContract(readFileSync(openapiPath), readFileSync(catalogPath), release, commit);
  const bundlePath = resolve(outputDirectory, 'f5xc-create-v1.json');
  writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  const format = Bun.spawnSync(
    [
      'bun',
      'x',
      'biome',
      'format',
      '--write',
      '--config-path',
      resolve(import.meta.dir, '../../../biome.json'),
      bundlePath,
    ],
    { cwd: resolve(import.meta.dir, '..'), stdout: 'inherit', stderr: 'inherit' },
  );
  if (format.exitCode !== 0) throw new Error('Biome could not format the generated contract');
  provenance.bundle_sha256 = digest(readFileSync(bundlePath));
  writeFileSync(resolve(outputDirectory, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
}
