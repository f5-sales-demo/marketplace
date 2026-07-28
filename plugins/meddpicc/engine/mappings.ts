import { resolveSchemaPath } from './schema-path';

export interface SfdcMappingCheck {
  ok: boolean;
  checked: number;
  failures: string[];
}

interface SfdcMapping {
  fieldMappings?: Array<{ schemaPath: string }>;
}

/**
 * Check that every Salesforce field mapping names a real place in the deal schema.
 *
 * `sfdc-field-mapping.json` pairs a Salesforce field with a `schemaPath` in the deal, and the
 * skill uses it to move values between the two. A mistyped path there does not fail loudly — it
 * maps to nothing, so a field silently never syncs and nobody can see why from the outside.
 *
 * This used to check the workbook's cell mapping as well. That mapping is gone: the workbook is
 * generated from `workbook-spec.json` now, and `check-spec` resolves every path in it against
 * this same schema, by the same walker.
 */
export function checkSfdcMapping(schema: unknown, sfdcMapping: unknown): SfdcMappingCheck {
  const paths = (((sfdcMapping ?? {}) as SfdcMapping).fieldMappings ?? []).map((m) => m.schemaPath);
  const failures = paths.filter((p) => !resolveSchemaPath(schema, p));
  return { ok: failures.length === 0, checked: paths.length, failures };
}
