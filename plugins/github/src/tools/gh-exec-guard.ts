// Pure guardrail helpers for the gh_exec passthrough tool.
// Keeps argv hygiene and read-only enforcement free of I/O so they are trivially testable.
// Fail-safe allowlist design: unknown commands are blocked.

// Blocks ASCII control characters except tab (0x09), LF (0x0A), and CR (0x0D),
// so multi-line `--jq` expressions survive; plus DEL (0x7F).
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional argv hygiene (allow tab/LF/CR)
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

export function hasControlChars(arg: string): boolean {
  return CONTROL_CHAR_PATTERN.test(arg);
}

// Leaf read verbs — the token immediately after the command group in `gh <group> <verb>`.
export const READ_VERBS: ReadonlySet<string> = new Set([
  'list',
  'view',
  'diff',
  'checks',
  'status',
  'download',
  'watch',
  'get',
  'show',
  'ls',
]);

// Top-level read commands that do not follow the group+verb shape.
const READ_TOP: ReadonlySet<string> = new Set(['search', 'status', 'version', 'help']);

const API_MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Resolve the HTTP method gh will actually use for `gh api`:
// explicit --method/-X (any form) wins; otherwise gh sends POST when any body/input
// flag is present, else GET.
function effectiveApiMethod(args: string[]): string {
  let explicit: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-X' || a === '--method') explicit = (args[i + 1] ?? '').toUpperCase() || explicit;
    else if (a.startsWith('--method=')) explicit = a.slice('--method='.length).toUpperCase() || explicit;
    else if (a.startsWith('-X') && a.length > 2) explicit = a.slice(2).replace(/^=/, '').toUpperCase() || explicit;
  }
  if (explicit) return explicit;
  const hasBody = args.some(
    (a) =>
      a === '-f' ||
      a === '-F' ||
      a === '--field' ||
      a === '--raw-field' ||
      a === '--input' ||
      /^--(field|raw-field|input)=/.test(a) ||
      /^-[fF]./.test(a),
  );
  return hasBody ? 'POST' : 'GET';
}

export function findMutation(args: string[]): { blocked: boolean; reason?: string } {
  const positionals = args.filter((a) => !a.startsWith('-'));
  if (positionals.length === 0) return { blocked: true, reason: 'no gh command provided' };
  const top = positionals[0];

  if (top === 'api') {
    const method = effectiveApiMethod(args);
    if (API_MUTATING_METHODS.has(method)) {
      return { blocked: true, reason: `gh api resolves to a ${method} request (mutating)` };
    }
    return { blocked: false };
  }

  if (READ_TOP.has(top)) return { blocked: false };

  const verb = positionals[1];
  if (verb && READ_VERBS.has(verb)) return { blocked: false };
  return {
    blocked: true,
    reason: verb
      ? `"${top} ${verb}" is not a recognized read-only gh command; run writes through a confirmed path`
      : `"${top}" is not a recognized read-only gh command; run writes through a confirmed path`,
  };
}
