import type { PluginInterface } from '../az/types';
import azExecDescription from '../prompts/az-exec.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

const MAX_OUTPUT_LENGTH = 50000;

// `az` is spawned argv-style (Bun.spawn(['az', ...args])) with NO shell, so shell
// metacharacters are inert — the argv boundary is the real command-injection control
// (per OWASP / CISA guidance). We therefore do NOT filter shell metacharacters, which
// would only break valid Azure CLI `--query` (JMESPath) syntax such as `||`, backtick
// literals, and pipes. The one genuine hygiene concern is a NUL/control byte, which
// malforms an execve argv.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control bytes for argv hygiene
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export function hasControlChars(arg: string): boolean {
  return CONTROL_CHAR_PATTERN.test(arg);
}

// Read-only-by-default guardrail. `az` verbs are conventional; we block clearly
// mutating verbs so writes must go through an explicit, confirmed path (the
// cli-operator agent). Reads (list*, show, get*, check*, ...) pass by default.
export const MUTATING_VERBS: ReadonlySet<string> = new Set([
  'create',
  'new',
  'delete',
  'remove',
  'purge',
  'update',
  'set',
  'add',
  'start',
  'stop',
  'restart',
  'deallocate',
  'redeploy',
  'reset',
  'regenerate',
  'renew',
  'rotate',
  'move',
  'invoke',
  'execute',
  'enable',
  'disable',
  'attach',
  'detach',
  'approve',
  'reject',
  'cancel',
  'revoke',
  'grant',
  'assign',
  'unassign',
  'lock',
  'unlock',
  'register',
  'unregister',
  'scale',
  'migrate',
  'failover',
  'restore',
  'deploy',
  'install',
  'uninstall',
  'upgrade',
  'publish',
  'import',
  'upload',
  'activate',
  'deactivate',
  'associate',
  'disassociate',
  'generate',
]);

// Positional tokens are the az command path + verb. Flags, and the value that
// immediately follows a value-taking flag, are excluded. Global flags such as
// `--subscription`/`--debug` may appear ANYWHERE, including before the command
// group, so we must not stop scanning at the first flag — doing so would let a
// destructive op hide behind a leading flag (e.g. `--subscription X group delete`).
export function getPositionals(args: string[]): string[] {
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) continue;
    const prev = args[i - 1];
    // Skip the value of a space-form value-taking flag (e.g. `-n foo`, `--name foo`).
    // `--flag=value` is itself flag-shaped and already skipped above.
    if (prev?.startsWith('-') && !prev.includes('=')) continue;
    positionals.push(arg);
  }
  return positionals;
}

// The verb for messaging is the last positional (e.g.
// `network routeserver peering list-learned-routes -g rg` -> `list-learned-routes`).
export function findVerb(args: string[]): string | null {
  return getPositionals(args).at(-1) ?? null;
}

// Fail safe: a command is mutating if ANY positional token is a mutating verb,
// regardless of its position relative to flags. This prevents flag-first argument
// ordering from bypassing the read-only guardrail.
export function findMutatingVerb(args: string[]): string | null {
  return getPositionals(args).find((tok) => MUTATING_VERBS.has(tok)) ?? null;
}

export function isMutating(args: string[]): boolean {
  return findMutatingVerb(args) !== null;
}

// Default to JSON for machine-readable output, but respect a caller-supplied
// --output / -o so `-o table` and `-o tsv` work instead of being overridden.
export function buildAzArgs(args: string[]): string[] {
  const hasOutput = args.some((a) => a === '--output' || a === '-o');
  return hasOutput ? [...args] : [...args, '--output', 'json'];
}

export function createAzExecTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "az" itself)' }), {
      description: 'Command arguments as array, e.g. ["webapp", "list", "--resource-group", "myRG"]',
    }),
  });

  return {
    name: 'az_exec',
    label: 'Azure CLI Execute',
    description: azExecDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { args: string[] },
      _signal: unknown,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'az_exec' as const };

      if (!params.args || params.args.length === 0) {
        return errorResult('Error: args array must not be empty. Provide az subcommand and flags.', base);
      }

      for (const arg of params.args) {
        if (hasControlChars(arg)) {
          return errorResult(`Error: argument contains a control character and cannot be passed to az: "${arg}"`, base);
        }
      }

      const mutatingVerb = findMutatingVerb(params.args);
      if (mutatingVerb !== null) {
        return errorResult(
          `Error: "${mutatingVerb}" is a mutating operation. az_exec is read-only by default. ` +
            'Run write/destructive operations through an explicitly confirmed path (delegate to the ' +
            'azure:cli-operator agent) rather than az_exec.',
          base,
        );
      }

      const api = makeExecApi(ctx.cwd);
      const args = buildAzArgs(params.args);

      try {
        const result = await api.exec('az', args);
        if (result.exitCode !== 0) {
          return errorResult(`az command failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`, {
            ...base,
            errorType: 'exec_error',
          });
        }
        let output = result.stdout;
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = `${output.slice(0, MAX_OUTPUT_LENGTH)}\n\n[Output truncated at ${MAX_OUTPUT_LENGTH} characters]`;
        }
        return textResult(output, base);
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}
