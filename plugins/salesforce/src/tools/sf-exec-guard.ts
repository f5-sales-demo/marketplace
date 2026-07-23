// Pure guardrail helpers for the sf_exec passthrough tool.
// Keeps argv hygiene and read-only enforcement free of I/O so they stay trivially
// testable. Fail-safe allowlist design: unknown commands are BLOCKED.
//
// Ported from the adversarially-hardened gitlab glab_exec guard and adapted for the
// Salesforce CLI's `topic:command:subcommand` grammar. Two protections are carried
// over intact:
//   1. FLAG-VALUE EXCLUSION — the token immediately after any flag token is treated
//      as that flag's value and excluded from the command path. This closes the
//      flag-value-shift bypass where a value-taking flag pushes the real verb past
//      positionals[1] (e.g. `org -s list create` where `create` is the true verb).
//   2. SINGLE-DASH SHORT-FLAG-CLUSTER parsing in effectiveApiMethod — every letter in
//      a `-iX` run is inspected, never just the char at index 1, so a boolean short
//      (`-i`) clustered ahead of the method short (`-X`) cannot hide it.
//
// sf-specific hardening: normalizeArgs splits each POSITIONAL token on ':' so the
// colon form (`org:list`, `data:create`) decomposes to the same path as the space
// form and cannot evade a space-based allowlist check. Flag tokens keep their form.
//
// `hasControlChars` lives in ./shared (Task 1) and is imported by the tool, not here,
// so there is a single source of truth for argv hygiene.

const API_MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Read-only command PREFIXES on the normalized positional path. sf commands are up to
// three tokens deep, so a path is allowed when it STARTS WITH one of these prefixes.
// Anything not matched here (or the api-request / single-top rules below) is blocked.
const READ_PREFIXES: ReadonlyArray<readonly string[]> = [
  ['data', 'query'],
  ['data', 'search'],
  ['data', 'export'],
  ['data', 'resume'],
  ['org', 'list'],
  ['org', 'display'],
  ['apex', 'list'],
  ['apex', 'get'],
  ['apex', 'tail'],
  ['sobject', 'describe'],
  ['sobject', 'list'],
  ['schema', 'sobject', 'list'],
  ['schema', 'sobject', 'describe'],
  ['limits', 'api', 'display'],
];

// Single-token top-level read commands (meta topics with no write subcommands).
const READ_TOP: ReadonlySet<string> = new Set(['version', 'help', 'commands', 'which', 'info']);

// Does the flag token `prev` consume the NEXT argv token as its value? Only a long flag
// without `=` (`--target-org x` → consumes `x`) or an exactly-2-char short (`-o x` →
// consumes `x`) take their value from the following token. A single-dash CLUSTER of
// length >= 3 (`-fp`, combined booleans) does NOT — its value, if any, is the token
// remainder, not the next arg. Excluding the token after every dash token (the earlier
// code) dropped the real subcommand after a boolean cluster and could let a write path
// resolve to a read prefix; long/2-char over-exclusion is retained (it can only block a
// read, never allow a write), cluster over-exclusion is removed.
function consumesNextAsValue(prev: string): boolean {
  if (prev.startsWith('--')) return !prev.includes('=');
  return /^-[A-Za-z]$/.test(prev);
}

// Compute the command path used for allowlisting: non-flag tokens, EXCLUDING a flag's
// value token (per consumesNextAsValue), with each surviving positional split on ':'
// so the colon grammar is normalized to the space grammar. Flag tokens keep their form
// and never contribute path parts. Excluding the post-flag value first means a flag
// value that itself contains a ':' can never leak a path segment.
export function normalizeArgs(args: string[]): string[] {
  const positionals = args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    return !(i > 0 && consumesNextAsValue(args[i - 1]));
  });
  const path: string[] = [];
  for (const token of positionals) {
    for (const part of token.split(':')) {
      if (part.length > 0) path.push(part);
    }
  }
  return path;
}

function startsWith(path: string[], prefix: readonly string[]): boolean {
  if (path.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

// Resolve the HTTP method `sf api request rest|graphql` will actually use. An explicit
// --method/-X (any form) wins; sf otherwise defaults to GET. sf is an oclif CLI, so a
// boolean short flag may CLUSTER ahead of a value-taking short inside one token: `-iX POST`
// parses as `-i` (include) + `-X` (method, value from the next arg). Crucially, the
// parser stops at the FIRST value-taking short in a cluster: the REST of the token
// becomes that flag's value. So `-fX=GET` is `--file` with value `X=GET` (the trailing
// X is data, NOT a method flag) — a body → POST. We therefore scan the letter run
// left→right and STOP at the first value-taking short: b/f marks a body (rest is that
// flag's value, never a method); X takes the token remainder (or next arg) as the method.
// --body/--file are body flags too; their presence forces a mutating shape (reported as
// POST here, and additionally blocked outright by findMutation). Over-flagging is
// fail-safe: at worst it treats a read as a write and blocks it; it never allows a write.
// sf api request long flags that take a VALUE (consume the next token when written
// without `=`). Every OTHER `--long` is a boolean (--include, --stream-to-file) and
// consumes nothing.
const LONG_VALUE_FLAGS: ReadonlySet<string> = new Set(['--method', '--body', '--file', '--header']);
// Long flags whose presence implies a request BODY (→ POST).
const LONG_BODY_FLAGS: ReadonlySet<string> = new Set(['--body', '--file']);
// sf api request single-char shorts that take a VALUE (from the token remainder, else
// the next token): X = --method, b = --body, f = --file, h = --header. Every other short
// (i, S, and any unknown letter) is boolean.
const SHORT_VALUE_FLAGS: ReadonlySet<string> = new Set(['X', 'b', 'f', 'h']);
// Shorts that imply a request BODY.
const SHORT_BODY_FLAGS: ReadonlySet<string> = new Set(['b', 'f']);

// Resolve the HTTP method `sf api request rest|graphql` will actually use. A value-taking
// flag consumes the following token (or, for a short, the cluster remainder) as its
// VALUE — that value must NEVER be reinterpreted as another flag. Scanning every token
// let a value consumed by another flag (`--header -XGET`, `-h -XGET`) be misread as
// `-X <method>`, forging a method that overrode a real `--method`/body. We consume each
// value-taking flag's value explicitly. (hasApiBodyFlag below is an independent
// belt-and-suspenders that blocks any api request carrying a body flag at all.)
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

// Does the api request carry a body payload flag? Such a flag can smuggle a mutating
// method/body the method check alone cannot see, so its mere presence blocks the request
// regardless of the resolved method. sf exposes both long forms (--body/--file, any form)
// and single-dash shorts (`-b`/`-f`), and shorts may cluster or attach a value
// (`-if`, `-freq.json`, `-b{}`), so any single-dash token whose letter run includes
// `b` or `f` counts too.
function hasApiBodyFlag(args: string[]): boolean {
  return args.some((a) => {
    if (a === '--body' || a === '--file' || a.startsWith('--body=') || a.startsWith('--file=')) return true;
    if (a.startsWith('--') || !/^-[A-Za-z]/.test(a)) return false;
    const body = a.slice(1);
    const eq = body.indexOf('=');
    const letters = eq === -1 ? body : body.slice(0, eq);
    return letters.includes('b') || letters.includes('f');
  });
}

export function findMutation(args: string[]): { blocked: boolean; reason?: string } {
  const path = normalizeArgs(args);
  if (path.length === 0) return { blocked: true, reason: 'no sf command provided' };

  // `sf api request rest|graphql` passthrough: allow only a GET with no body payload.
  if (startsWith(path, ['api', 'request'])) {
    if (hasApiBodyFlag(args)) {
      return {
        blocked: true,
        reason: 'sf api request with --body/--file can carry a mutating payload; only bodyless GET reads are allowed',
      };
    }
    const method = effectiveApiMethod(args);
    if (API_MUTATING_METHODS.has(method)) {
      return { blocked: true, reason: `sf api request resolves to a ${method} request (mutating)` };
    }
    if (method !== 'GET') {
      return { blocked: true, reason: `sf api request resolves to a non-GET (${method}) request` };
    }
    return { blocked: false };
  }

  for (const prefix of READ_PREFIXES) {
    if (startsWith(path, prefix)) return { blocked: false };
  }
  if (READ_TOP.has(path[0])) return { blocked: false };

  return {
    blocked: true,
    reason: `"${path.join(' ')}" is not a recognized read-only sf command; run writes through a confirmed path`,
  };
}
