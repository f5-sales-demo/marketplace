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
//
// glab is a cobra/pflag CLI, so a boolean short flag may CLUSTER ahead of a
// value-taking short flag inside a single token: `-iF title=x` parses as
// `-i` (include, boolean) + `-F` (field, value from the next arg), and `-iX POST`
// as include + method. Crucially, pflag stops at the FIRST value-taking short in a
// cluster: the REST of the token becomes that flag's value. So `-fX=GET` is
// `--raw-field` with value `X=GET` (a body field literally named X) — the trailing
// X is data, NOT a method flag — and glab sends POST. We therefore scan the letter
// run left→right and STOP at the first value-taking short: f/F marks a body (rest is
// the field value, never a method); X takes the token remainder (or next arg) as the
// method. Over-flagging here is fail-safe: at worst it blocks a read; never allows a write.
// glab api long flags that take a VALUE (consume the next token when written without
// `=`). Every OTHER `--long` is a boolean (--include, --silent, --paginate) and
// consumes nothing.
const LONG_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--method',
  '--field',
  '--raw-field',
  '--input',
  '--form',
  '--header',
  '--hostname',
]);
// glab api long flags whose presence implies a request BODY (→ POST).
const LONG_BODY_FLAGS: ReadonlySet<string> = new Set(['--field', '--raw-field', '--input', '--form']);
// glab api single-char shorts that take a VALUE (from the token remainder, else the
// next token). glab swaps gh's convention: -F = --field, -f = --raw-field, -H =
// --header, -X = --method. Every other short (i, and any unknown letter) is boolean.
const SHORT_VALUE_FLAGS: ReadonlySet<string> = new Set(['X', 'F', 'f', 'H']);
// Shorts that imply a request BODY.
const SHORT_BODY_FLAGS: ReadonlySet<string> = new Set(['F', 'f']);

// Resolve the HTTP method glab will actually use for `glab api`. glab is a cobra/pflag
// CLI, so a value-taking flag consumes the following token (or, for a short, the cluster
// remainder) as its VALUE — that value must NEVER be reinterpreted as another flag.
// Scanning every token let a value consumed by another flag (`-H -XGET`, `--header
// -XGET`) be misread as `-X <method>`, forging a non-mutating method that overrode a
// real body POST. We therefore consume each value-taking flag's value explicitly. Body
// shorts/longs always set hasBody even when their value is attached; over-flagging a
// body is fail-safe (blocks a read), under-detecting one is the danger.
export function effectiveApiMethod(args: string[]): string {
  let explicit: string | null = null;
  let hasBody = false;

  const setExplicit = (raw: string): void => {
    const up = (raw ?? '').toUpperCase();
    if (up) explicit = up;
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    // Long-form (double-dash) flags.
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq === -1 ? a : a.slice(0, eq);
      const inlineVal = eq === -1 ? undefined : a.slice(eq + 1);
      if (name === '--method') setExplicit(inlineVal ?? args[i + 1] ?? '');
      if (LONG_BODY_FLAGS.has(name)) hasBody = true;
      if (inlineVal === undefined && LONG_VALUE_FLAGS.has(name)) i += 1; // consume value token
      continue;
    }

    // Single-dash cluster token: scan letters left→right; the FIRST value-taking short
    // consumes the token remainder (or the next token) as its value and ENDS the cluster.
    if (/^-[A-Za-z]/.test(a)) {
      const body = a.slice(1);
      for (let j = 0; j < body.length; j++) {
        const c = body[j];
        if (!SHORT_VALUE_FLAGS.has(c)) continue; // boolean short (e.g. -i); keep scanning
        let value = body.slice(j + 1).replace(/^=/, '');
        if (value === '') {
          i += 1;
          value = args[i] ?? '';
        }
        if (c === 'X') setExplicit(value);
        if (SHORT_BODY_FLAGS.has(c)) hasBody = true;
        break; // remainder/next token is this flag's value, not more flags
      }
    }
  }

  if (explicit) return explicit;
  return hasBody ? 'POST' : 'GET';
}

// Does the flag token `prev` consume the NEXT argv token as its value, per cobra/pflag
// `stripFlags`? Only a long flag without `=` (`--repo x` → consumes `x`) or an
// exactly-2-char short (`-R x` → consumes `x`) take their value from the following
// token. A single-dash CLUSTER of length >= 3 (`-dp`, `-dm`) does NOT — pflag reads any
// in-cluster value flag's value from the token REMAINDER, not the next arg. Excluding
// the token after every dash token (the earlier code) dropped the real verb after a
// boolean cluster and let a write through; long/2-char over-exclusion is retained
// (it can only block a read, never allow a write), cluster over-exclusion is removed.
function consumesNextAsValue(prev: string): boolean {
  if (prev.startsWith('--')) return !prev.includes('=');
  return /^-[A-Za-z]$/.test(prev);
}

export function findMutation(args: string[]): { blocked: boolean; reason?: string } {
  const positionals = args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    return !(i > 0 && consumesNextAsValue(args[i - 1]));
  });
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
