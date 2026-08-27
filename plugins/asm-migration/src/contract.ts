import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import bundleImport from '../contracts/f5xc-create-v1.json' with { type: 'json' };
import provenanceImport from '../contracts/provenance.json' with { type: 'json' };
import type { ContractIdentity, ContractIssue, ContractReport, Resource } from './types';

type Json = Record<string, unknown>;
const bundle = bundleImport as unknown as Json;
const provenance = provenanceImport as unknown as Json;
const schemas = (bundle.components as Json).schemas as Record<string, Json>;
const roots = bundle['x-asm-migration-roots'] as Record<string, string>;

export function contractIdentity(): ContractIdentity {
  const digest = String(provenance.bundle_sha256);
  const source = provenance.source as Json;
  return {
    repository: String(provenance.repository),
    commit: String(provenance.commit),
    source_spec_sha256: String(source.source_spec_sha256),
    catalog_sha256: String(source.catalog_sha256),
    bundle_sha256: digest,
  };
}

function pathOf(instancePath: string): string {
  if (!instancePath) return '$';
  return `$${instancePath.replace(/\/(\d+)(?=\/|$)/g, '[$1]').replace(/\/([^/]+)/g, '.$1')}`;
}

function resolveLayers(schema: Json): Json[] {
  const result = [schema];
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const name = ref.split('/').at(-1);
    const referenced = name ? schemas[name] : undefined;
    if (referenced) result.push(...resolveLayers(referenced));
  }
  if (Array.isArray(schema.allOf))
    for (const child of schema.allOf)
      if (child && typeof child === 'object') result.push(...resolveLayers(child as Json));
  return result;
}

function addIssue(
  issues: ContractIssue[],
  index: number,
  kind: string,
  parts: Array<string | number>,
  message: string,
): void {
  let path = '$';
  for (const part of parts) path += typeof part === 'number' ? `[${part}]` : `.${part}`;
  if (
    !issues.some(
      (item) => item.resource_index === index && item.kind === kind && item.path === path && item.message === message,
    )
  )
    issues.push({ resource_index: index, kind, path, message });
}

function enriched(
  value: unknown,
  schema: Json,
  parts: Array<string | number>,
  index: number,
  kind: string,
  issues: ContractIssue[],
): void {
  const layers = resolveLayers(schema);
  const properties: Record<string, Json> = {};
  let explicitMap: boolean | Json = false;
  for (const layer of layers) {
    if (layer.properties && typeof layer.properties === 'object') Object.assign(properties, layer.properties);
    if ('additionalProperties' in layer) explicitMap = layer.additionalProperties as boolean | Json;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Json;
    if (Object.keys(properties).length) {
      for (const key of Object.keys(record)
        .filter((key) => !(key in properties))
        .sort())
        addIssue(issues, index, kind, [...parts, key], 'field is absent from the create schema');
    } else if (explicitMap === false) {
      for (const key of Object.keys(record).sort())
        addIssue(issues, index, kind, [...parts, key], 'field is absent from the create schema');
    }
    for (const [name, childSchema] of Object.entries(properties)) {
      const required = resolveLayers(childSchema).some(
        (layer) => (layer['x-f5xc-required-for'] as Json | undefined)?.create === true,
      );
      if (required && !(name in record))
        addIssue(issues, index, kind, [...parts, name], 'required create field is missing');
      if (name in record) enriched(record[name], childSchema, [...parts, name], index, kind, issues);
    }
    if (explicitMap && typeof explicitMap === 'object')
      for (const [name, child] of Object.entries(record))
        if (!(name in properties)) enriched(child, explicitMap, [...parts, name], index, kind, issues);
    for (const layer of layers)
      for (const [extension, encoded] of Object.entries(layer)) {
        if (!extension.startsWith('x-ves-oneof-field-') || typeof encoded !== 'string') continue;
        const choices = JSON.parse(encoded) as string[];
        const present = choices.filter((choice) => choice in record);
        if (present.length > 1)
          addIssue(issues, index, kind, parts, `mutually exclusive fields are present: ${present.join(', ')}`);
      }
  }
  if (Array.isArray(value)) {
    const itemSchema = layers.find((layer) => layer.items)?.items;
    if (itemSchema && typeof itemSchema === 'object')
      value.forEach((child, childIndex) => {
        enriched(child, itemSchema as Json, [...parts, childIndex], index, kind, issues);
      });
    const unique = layers.some(
      (layer) => layer.uniqueItems === true || (layer['x-f5xc-constraints'] as Json | undefined)?.uniqueItems === true,
    );
    if (unique && new Set(value.map((item) => JSON.stringify(item))).size !== value.length)
      addIssue(issues, index, kind, parts, 'array items must be unique');
  }
  for (const layer of layers) {
    const constraints = (layer['x-f5xc-constraints'] as Json | undefined) ?? {};
    if (typeof value === 'string') {
      if (typeof constraints.pattern === 'string' && !new RegExp(`^(?:${constraints.pattern})$`).test(value))
        addIssue(issues, index, kind, parts, `does not match enriched pattern ${constraints.pattern}`);
      const byteLength = constraints.byteLength as Json | undefined;
      if (typeof byteLength?.max === 'number' && Buffer.byteLength(value) > byteLength.max)
        addIssue(issues, index, kind, parts, `UTF-8 value exceeds ${byteLength.max} bytes`);
      const rules = (layer['x-validation-rules'] as Json | undefined) ?? {};
      if (rules['ves.io.schema.rules.string.ipv4_prefix'] === 'true' && !validIpv4Prefix(value))
        addIssue(issues, index, kind, parts, 'is not an IPv4 prefix');
    }
    if (typeof value === 'number' && Number.isInteger(value)) {
      if (typeof constraints.minimum === 'number' && value < constraints.minimum)
        addIssue(issues, index, kind, parts, `value is below enriched minimum ${constraints.minimum}`);
      if (typeof constraints.maximum === 'number' && value > constraints.maximum)
        addIssue(issues, index, kind, parts, `value exceeds enriched maximum ${constraints.maximum}`);
      if (parts.at(-1) === 'signature_id' && value !== 0 && value < 200_000_001)
        addIssue(issues, index, kind, parts, 'signature ID must be 0 or in 200000001-299999999');
    }
  }
}

function validIpv4Prefix(value: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d|[12]\d|3[0-2])$/.exec(value);
  return Boolean(match?.slice(1, 5).every((part) => Number(part) <= 255));
}

function isResource(value: unknown): value is Resource {
  if (!value || typeof value !== 'object') return false;
  const item = value as Json;
  return (
    typeof item.kind === 'string' &&
    item.metadata !== null &&
    typeof item.metadata === 'object' &&
    item.spec !== null &&
    typeof item.spec === 'object'
  );
}

export function validateConfigPack(raw: unknown): ContractReport {
  const identity = contractIdentity();
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as Json).schema_version !== 'asm-migration.config-pack/v1' ||
    !Array.isArray((raw as Json).resources)
  ) {
    return {
      valid: false,
      contract: identity,
      resource_count: 0,
      validated_resource_count: 0,
      issues: [
        { path: '$', message: 'config pack must use asm-migration.config-pack/v1 and contain a resources array' },
      ],
    };
  }
  const resources = (raw as Json).resources as unknown[];
  const issues: ContractIssue[] = [];
  let validated = 0;
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
  addFormats(ajv);
  ajv.addFormat('boolean', true);
  resources.forEach((unknownResource, index) => {
    if (!isResource(unknownResource)) {
      issues.push({ resource_index: index, path: '$', message: 'invalid resource shape' });
      return;
    }
    const resource = unknownResource;
    const kind = resource.kind;
    const schemaName = roots[kind];
    if (!schemaName) {
      issues.push({ resource_index: index, kind, path: '$', message: 'unsupported resource kind' });
      return;
    }
    const before = issues.length;
    const body = { metadata: resource.metadata, spec: resource.spec };
    const validate = ajv.compile({ $ref: `#/components/schemas/${schemaName}`, components: bundle.components });
    if (!validate(body))
      for (const error of validate.errors ?? [])
        issues.push({
          resource_index: index,
          kind,
          path: pathOf(error.instancePath),
          message: error.message ?? 'contract validation failed',
        });
    const rootSchema = schemas[schemaName];
    if (rootSchema) enriched(body, rootSchema, [], index, kind, issues);
    if (issues.length === before) validated += 1;
  });
  return {
    valid: issues.length === 0,
    contract: identity,
    resource_count: resources.length,
    validated_resource_count: validated,
    issues,
  };
}
