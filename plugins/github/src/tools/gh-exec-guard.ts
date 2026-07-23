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
// as include + method. Crucially, pflag stops at the FIRST value-taking short in a
// cluster: the REST of the token becomes that flag's value. So `-fX=GET` is
// `--field` with value `X=GET` (a body field literally named X) — the trailing X is
// data, NOT a method flag — and gh sends POST. We therefore scan the letter run
// left→right and STOP at the first value-taking short: f/F marks a body (rest is the
// field value, never a method); X takes the token remainder (or next arg) as the
// method. Over-flagging here is fail-safe: at worst it blocks a read; never allows a write.
// gh api long flags that take a VALUE (consume the next token when written without
// `=`). Every OTHER `--long` is a boolean (--include, --paginate, --silent, --slurp,
// --verbose) and consumes nothing.
const LONG_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--method',
  '--field',
  '--raw-field',
  '--header',
  '--input',
  '--jq',
  '--template',
  '--cache',
  '--hostname',
  '--preview',
]);
// gh api long flags whose presence implies a request BODY (→ POST).
const LONG_BODY_FLAGS: ReadonlySet<string> = new Set(['--field', '--raw-field', '--input']);
// gh api single-char shorts that take a VALUE (from the token remainder, else the next
// token). Every other short (i, and any unknown letter) is boolean.
const SHORT_VALUE_FLAGS: ReadonlySet<string> = new Set(['X', 'f', 'F', 'H', 'q', 't', 'p']);
// Shorts that imply a request BODY.
const SHORT_BODY_FLAGS: ReadonlySet<string> = new Set(['f', 'F']);

// Resolve the HTTP method gh will actually use for `gh api`. gh is a cobra/pflag CLI, so
// a value-taking flag consumes the following token (or, for a short, the cluster
// remainder) as its VALUE — and that value must NEVER be reinterpreted as another flag.
// The earlier version scanned every token, so a value that happened to look like a flag
// (`--jq -Xhack`, `-q -XGET`, `-H -XGET`) was misread as `-X <method>`, forging a
// non-mutating method that overrode a real `-f` body POST and let a write through. We
// therefore consume each value-taking flag's value explicitly. Over-flagging a body is
// fail-safe (blocks a read); the danger is under-detecting one, so `-f`/`-F`/`--field`/
// `--raw-field`/`--input` always set hasBody even when their value is attached.
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
      // A value-taking long flag written without `=` consumes the next token as its
      // value; skip it so it is not reinterpreted as a method/body flag.
      if (inlineVal === undefined && LONG_VALUE_FLAGS.has(name)) i += 1;
      continue;
    }

    // Single-dash cluster token: /^-[A-Za-z]/ and NOT '--'. Scan letters left→right;
    // the FIRST value-taking short consumes the token remainder (or the next token) as
    // its value and ENDS the cluster — a trailing method-looking substring is data.
    if (/^-[A-Za-z]/.test(a)) {
      const body = a.slice(1);
      for (let j = 0; j < body.length; j++) {
        const c = body[j];
        if (!SHORT_VALUE_FLAGS.has(c)) continue; // boolean short (e.g. -i); keep scanning
        let value = body.slice(j + 1).replace(/^=/, '');
        if (value === '') {
          // No attached remainder: the value is the next token; consume it so it is
          // not reinterpreted as a flag.
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
// `stripFlags`? Only two forms take their value from the following token:
//   - a long flag written without `=`   (`--repo owner/x` → consumes `owner/x`)
//   - an exactly-2-char short            (`-R owner/x`     → consumes `owner/x`)
// A single-dash CLUSTER of length ≥ 3 (`-dp`, `-dm`) does NOT consume the next token —
// pflag reads any in-cluster value flag's value from the token REMAINDER, not the next
// arg. The earlier code excluded the token after *every* dash token, which dropped the
// real verb after a boolean cluster (`gh release -dp create view` → verb misread as
// `view`, a read) and let a write through — a false-negative. Long/2-char over-exclusion
// stays (can only block a read, never allow a write); cluster over-exclusion is removed.
function consumesNextAsValue(prev: string): boolean {
  if (prev.startsWith('--')) return !prev.includes('=');
  return /^-[A-Za-z]$/.test(prev);
}

export function findMutation(args: string[]): { blocked: boolean; reason?: string } {
  const positionals = args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    return !(i > 0 && consumesNextAsValue(args[i - 1]));
  });
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
