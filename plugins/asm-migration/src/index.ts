// @ts-expect-error dist/runtime.js is a committed artifact generated from src/runtime.ts.
import { convertInput, validateInput } from '../dist/runtime.js';
import type { ContractIssue, ConversionWarning } from './types';

interface TypeFactory {
  Object(properties: Record<string, unknown>): unknown;
  String(options?: Record<string, unknown>): unknown;
  Union(items: unknown[]): unknown;
  Literal(value: string): unknown;
  Optional(schema: unknown): unknown;
  Boolean(options?: Record<string, unknown>): unknown;
}

interface ExtensionApi {
  typebox: { Type: TypeFactory };
  setLabel(label: string): void;
  registerTool(tool: unknown): void;
}

function errorResult(tool: string, error: unknown) {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'ToolAbortError')) throw error;
  const known = error instanceof Error && error.name === 'MigrationError';
  const category = known && 'category' in error ? String(error.category) : 'io';
  const message = known ? error.message : 'The operation could not be completed.';
  return {
    content: [{ type: 'text' as const, text: `ASM migration failed (${category}): ${message}` }],
    isError: true,
    details: { tool, ok: false, errorCategory: category },
  };
}

const factory = async (pi: ExtensionApi) => {
  pi.setLabel('ASM Migration');
  // xcsh supplies TypeBox at runtime; this avoids a runtime dependency import.
  const Type = pi.typebox.Type;
  pi.registerTool({
    name: 'asm_migration_validate',
    label: 'Validate ASM Migration Input',
    description:
      'Validate an exported BIG-IP ASM policy or asm-migration config pack locally without writing files or using the network.',
    parameters: Type.Object({
      inputPath: Type.String({ description: 'Path to the ASM XML policy or config-pack JSON' }),
      inputType: Type.Union([Type.Literal('asm-policy'), Type.Literal('config-pack')]),
    }),
    async execute(
      _id: string,
      params: { inputPath: string; inputType: 'asm-policy' | 'config-pack' },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: { cwd: string },
    ) {
      try {
        const result = await validateInput({ ...params, cwd: ctx.cwd, signal });
        const issues = result.contract?.issues ?? [];
        const text = result.valid
          ? `${params.inputType} is valid.`
          : `${params.inputType} is invalid: ${issues.map((issue: ContractIssue) => `${issue.path}: ${issue.message}`).join('; ')}`;
        return {
          content: [{ type: 'text' as const, text }],
          ...(result.valid ? {} : { isError: true }),
          details: { tool: 'asm_migration_validate', ...result },
        };
      } catch (error) {
        return errorResult('asm_migration_validate', error);
      }
    },
  });
  pi.registerTool({
    name: 'asm_migration_convert',
    label: 'Convert ASM Policy',
    description:
      'Convert an exported BIG-IP ASM XML policy into four deterministic, contract-validated F5 XC review artifacts. This tool never deploys resources.',
    parameters: Type.Object({
      policyPath: Type.String({ description: 'Path to the exported BIG-IP ASM XML policy' }),
      signaturesPath: Type.String({ description: 'Path to an asm-migration.signatures/v1 mapping file' }),
      namespace: Type.String({ description: 'Target F5 XC namespace' }),
      outputDirectory: Type.String({ description: 'Directory for the four managed output files' }),
      targetName: Type.Optional(Type.String({ description: 'Optional target resource name' })),
      allowPartial: Type.Optional(
        Type.Boolean({
          default: false,
          description: 'Emit explicitly incomplete review output when behavior cannot be represented',
        }),
      ),
      overwrite: Type.Optional(
        Type.Boolean({
          default: false,
          description: 'Replace existing managed output files while preserving unrelated files',
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        policyPath: string;
        signaturesPath: string;
        namespace: string;
        outputDirectory: string;
        targetName?: string;
        allowPartial?: boolean;
        overwrite?: boolean;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: { cwd: string },
    ) {
      try {
        const result = await convertInput({ ...params, cwd: ctx.cwd, signal });
        const warningText = result.warnings.length
          ? ` Warnings: ${result.warnings.map((warning: ConversionWarning) => `${warning.code}: ${warning.message}`).join('; ')}`
          : '';
        const review = result.complete
          ? 'Output is complete and still requires operator review before deployment.'
          : 'Output is PARTIAL and unsuitable for deployment until every warning is reviewed and remediated.';
        return {
          content: [
            { type: 'text' as const, text: `Created ${result.outputFiles.join(', ')}. ${review}${warningText}` },
          ],
          details: { tool: 'asm_migration_convert', ...result },
        };
      } catch (error) {
        return errorResult('asm_migration_convert', error);
      }
    },
  });
};

export default factory;
