import { resolveSchemaPath } from './schema-path';

export interface MappingCheck {
  ok: boolean;
  cell: { checked: number; failures: string[] };
  sfdc: { checked: number; failures: string[] };
}

interface CellMapping {
  staticFields?: Array<{ jsonPath: string }>;
  dynamicSections?: Array<{ jsonPath: string; columns?: Record<string, string> }>;
}
interface SfdcMapping {
  fieldMappings?: Array<{ schemaPath: string }>;
}

export function checkMappings(schema: unknown, cellMapping: unknown, sfdcMapping: unknown): MappingCheck {
  const cell = (cellMapping ?? {}) as CellMapping;
  const sfdc = (sfdcMapping ?? {}) as SfdcMapping;

  const cellPaths: string[] = [];
  for (const f of cell.staticFields ?? []) cellPaths.push(f.jsonPath);
  for (const sec of cell.dynamicSections ?? []) {
    cellPaths.push(sec.jsonPath);
    for (const field of Object.keys(sec.columns ?? {})) cellPaths.push(`${sec.jsonPath}.${field}`);
  }
  const cellFailures = cellPaths.filter((p) => !resolveSchemaPath(schema, p));

  const sfdcPaths = (sfdc.fieldMappings ?? []).map((m) => m.schemaPath);
  const sfdcFailures = sfdcPaths.filter((p) => !resolveSchemaPath(schema, p));

  return {
    ok: cellFailures.length === 0 && sfdcFailures.length === 0,
    cell: { checked: cellPaths.length, failures: cellFailures },
    sfdc: { checked: sfdcPaths.length, failures: sfdcFailures },
  };
}
