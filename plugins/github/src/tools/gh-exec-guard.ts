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
// explicit --method/-X (any form) wins; otherwise gh sends POST when any body flag
// (-f/--field, -F/--raw-field, --input) is present, else GET.
//
// gh is a cobra/pflag CLI, so a boolean short flag may CLUSTER ahead of a
// value-taking short flag inside a single token: `-iF field=x` parses as
// `-i` (include, boolean) + `-F` (raw-field, value from the next arg), and `-iX POST`
// as include + method. Prefix matching on the token misses these, so we inspect
// the whole single-dash letter run — never just the char at index 1 — for the
// field (f/F) and method (X) letters. Over-flagging here is fail-safe: at worst
// it treats a read as a body/method write and blocks it; it never allows a write.
export function effectiveApiMethod(args: string[]): string {
  let explicit: string | null = null;
  let hasBody = false;

  const setExplicit = (raw: string): void => {
    const up = (raw ?? '').toUpperCase();
    if (up) explicit = up;
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    // Long-form (double-dash) flags — unchanged detection.
    if (a === '--method') {
      setExplicit(args[i + 1] ?? '');
      continue;
    }
    if (a.startsWith('--method=')) {
      setExplicit(a.slice('--method='.length));
      continue;
    }
    if (a === '--field' || a === '--raw-field' || a === '--input' || /^--(field|raw-field|input)=/.test(a)) {
      hasBody = true;
      continue;
    }
    if (a.startsWith('--')) continue;

    // Single-dash cluster token: /^-[A-Za-z]/ and NOT '--'. Strip the leading
    // '-' and inspect the letter run up to the first '=' (or end) so a boolean
    // short flag clustered ahead of a value flag can't hide the value flag.
    if (/^-[A-Za-z]/.test(a)) {
      const body = a.slice(1);
      const eq = body.indexOf('=');
      const letters = eq === -1 ? body : body.slice(0, eq);

      // Field flag anywhere in the cluster → this token carries a body.
      if (letters.includes('f') || letters.includes('F')) hasBody = true;

      // Method flag anywhere in the cluster → value is whatever follows the X
      // in the same token (leading '=' stripped), else the next arg.
      const xIdx = letters.indexOf('X');
      if (xIdx !== -1) {
        const after = body.slice(xIdx + 1).replace(/^=/, '');
        if (after) setExplicit(after);
        else setExplicit(args[i + 1] ?? '');
      }
    }
  }

  if (explicit) return explicit;
  return hasBody ? 'POST' : 'GET';
}

export function findMutation(args: string[]): { blocked: boolean; reason?: string } {
  // Cobra/pflag consumes the token AFTER a flag token as that flag's value, so a
  // value-taking flag can shift a command's real verb past positionals[1]. Mirror
  // cobra by excluding both flag tokens AND the token immediately following one.
  // This over-excludes tokens after boolean flags (fail-safe: at worst blocks a
  // read; never allows a mutation) and realigns the verb with what gh dispatches.
  const positionals = args.filter((a, i) => !a.startsWith('-') && !(i > 0 && args[i - 1].startsWith('-')));
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
