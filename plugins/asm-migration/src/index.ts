// @ts-expect-error dist/runtime.js is a committed artifact generated from src/runtime.ts.
import { convertInput, validateInput } from '../dist/runtime.js';
import type { ContractIdentity, ContractIssue, ConversionWarning } from './types';

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

function contractText(contract: ContractIdentity): string {
  return [
    `repository ${contract.repository}`,
    `commit ${contract.commit}`,
    `bundle SHA-256 ${contract.bundle_sha256}`,
  ].join(', ');
}

function issueText(issue: ContractIssue): string {
  const resource = issue.resource_index === undefined ? 'config pack' : `resource ${issue.resource_index}`;
  const kind = issue.kind ? ` (${issue.kind})` : '';
  return `${resource}${kind}, path ${issue.path}: ${issue.message}`;
}

function countText(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? entries.map(([kind, count]) => `${kind}=${count}`).join(', ') : 'none';
}

function warningText(warnings: ConversionWarning[]): string {
  return warnings.length
    ? warnings.map((warning) => `${warning.code}: ${warning.message}`).join('; ')
    : 'none';
}

function errorResult(tool: string, error: unknown) {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'ToolAbortError')) throw error;
  const known = error instanceof Error && error.name === 'MigrationError';
  const category = known && 'category' in error ? String(error.category) : 'io';
  let message = known ? error.message : 'The operation could not be completed.';
  if (category === 'output' && message.includes('symlinked'))
    message +=
      ' On macOS, use /private/tmp or another normal directory instead of /tmp, which is a symlink.';
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
        let text: string;
        if (result.policy) {
          const unsupported = result.policy.unsupportedEnabledFeatures.length
            ? result.policy.unsupportedEnabledFeatures.join(', ')
            : 'none';
          text = [
            'asm-policy is valid.',
            `Enforcement mode: ${result.policy.enforcementMode}.`,
            `Unsupported enabled features: ${unsupported}.`,
          ].join(' ');
        } else {
          const contract = result.contract!;
          const status = contract.valid ? 'valid' : 'invalid';
          const issueSummary = issues.length ? ` Issues: ${issues.map(issueText).join('; ')}.` : ' Issues: none.';
          text =
            `config-pack is ${status} against the pinned contract (${contractText(contract.contract)}). ` +
            `Resource count: ${contract.resource_count}; validated resource count: ${contract.validated_resource_count}.` +
            issueSummary;
        }
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
        const review = result.complete
          ? 'Complete output still requires operator review before deployment, including rules, signature mappings, client networks, blocking behavior, and the contract validation report.'
          : 'PARTIAL REVIEW OUTPUT: unsuitable for deployment until every warning is reviewed and remediated.';
        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Conversion complete: ${result.complete}. Resource counts: ${countText(result.resourceCounts)}.`,
                `Pinned contract: ${contractText(result.contract)}.`,
                `Created exactly four managed review files: ${result.outputFiles.join(', ')}.`,
                `Warnings: ${warningText(result.warnings)}.`,
                review,
              ].join(' '),
            },
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
