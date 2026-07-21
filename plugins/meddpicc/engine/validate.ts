import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ instancePath: string; keyword: string; message: string; schemaPath: string }>;
}

export function validateDeal(deal: unknown, schema: unknown): ValidationResult {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateFn = ajv.compile(schema as object);
  const valid = validateFn(deal) as boolean;
  const errors = (validateFn.errors ?? []).map((e) => ({
    instancePath: e.instancePath,
    keyword: e.keyword,
    message: e.message ?? '',
    schemaPath: e.schemaPath,
  }));
  return { valid, errors };
}
