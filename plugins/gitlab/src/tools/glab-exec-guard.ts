// Pure guardrail helpers for the glab_exec passthrough tool.
// Keeps argv hygiene and read-only enforcement free of I/O so they are trivially testable.
// Fail-safe allowlist design: unknown commands are blocked.
//
// `hasControlChars` lives in ./shared (added in Task 3) — imported by the tool,
// re-exported here is deliberately avoided so there is a single source of truth.

// Leaf read verbs — the token immediately after the command group in `glab <group> <verb>`.
// glab uses `view`/`show` (NOT gh's `checks`/`watch`/`download`).
export const READ_VERBS: ReadonlySet<string> = new Set(['list', 'view', 'diff', 'show', 'get', 'status', 'trace']);

// Top-level read commands that do not follow the group+verb shape.
const READ_TOP: ReadonlySet<string> = new Set(['search', 'version', 'help']);

const API_MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Resolve the HTTP method `glab api` will actually use:
// explicit --method/-X (any form) wins; otherwise glab sends POST when any body
// flag (-F/--field, -f/--raw-field, --input, --form) is present, else GET.
export function effectiveApiMethod(args: string[]): string {
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
      a === '--form' ||
      /^--(field|raw-field|input|form)=/.test(a) ||
      /^-[fF]./.test(a),
  );
  return hasBody ? 'POST' : 'GET';
}

export function findMutation(args: string[]): { blocked: boolean; reason?: string } {
  // Cobra/pflag consumes the token AFTER a flag token as that flag's value, so a
  // value-taking flag can shift a command's real verb past positionals[1]. Mirror
  // cobra by excluding both flag tokens AND the token immediately following one.
  // This over-excludes tokens after boolean flags (fail-safe: at worst blocks a
  // read; never allows a mutation) and realigns the verb with what glab dispatches.
  const positionals = args.filter((a, i) => !a.startsWith('-') && !(i > 0 && args[i - 1].startsWith('-')));
  if (positionals.length === 0) return { blocked: true, reason: 'no glab command provided' };
  const top = positionals[0];

  if (top === 'api') {
    const method = effectiveApiMethod(args);
    if (API_MUTATING_METHODS.has(method)) {
      return { blocked: true, reason: `glab api resolves to a ${method} request (mutating)` };
    }
    return { blocked: false };
  }

  if (READ_TOP.has(top)) return { blocked: false };

  const verb = positionals[1];
  if (verb && READ_VERBS.has(verb)) return { blocked: false };
  return {
    blocked: true,
    reason: verb
      ? `"${top} ${verb}" is not a recognized read-only glab command; run writes through a confirmed path`
      : `"${top}" is not a recognized read-only glab command; run writes through a confirmed path`,
  };
}
