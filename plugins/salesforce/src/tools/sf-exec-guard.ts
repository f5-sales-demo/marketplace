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

// Compute the command path used for allowlisting: non-flag tokens, EXCLUDING the token
// immediately after any flag (its value), with each surviving positional split on ':'
// so the colon grammar is normalized to the space grammar. Flag tokens keep their form
// and never contribute path parts. Excluding the post-flag token first means a flag
// value that itself contains a ':' can never leak a path segment.
export function normalizeArgs(args: string[]): string[] {
  const positionals = args.filter((a, i) => !a.startsWith('-') && !(i > 0 && args[i - 1].startsWith('-')));
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
// boolean short flag may CLUSTER ahead of the method short inside one token: `-iX POST`
// parses as `-i` (include) + `-X` (method, value from the next arg). We inspect the
// whole single-dash letter run — never just index 1 — for the method letter X.
// --body/--file are body flags; their presence forces a mutating shape (reported as
// POST here, and additionally blocked outright by findMutation). Over-flagging is
// fail-safe: at worst it treats a read as a write and blocks it; it never allows a write.
export function effectiveApiMethod(args: string[]): string {
  let explicit: string | null = null;
  let hasBody = false;

  const setExplicit = (raw: string): void => {
    const up = (raw ?? '').toUpperCase();
    if (up) explicit = up;
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    if (a === '--method') {
      setExplicit(args[i + 1] ?? '');
      continue;
    }
    if (a.startsWith('--method=')) {
      setExplicit(a.slice('--method='.length));
      continue;
    }
    if (a === '--body' || a === '--file' || /^--(body|file)=/.test(a)) {
      hasBody = true;
      continue;
    }
    if (a.startsWith('--')) continue;

    // Single-dash cluster token: /^-[A-Za-z]/ and NOT '--'. Strip the leading '-' and
    // inspect the letter run up to the first '=' so a boolean short flag clustered
    // ahead of the method short can't hide it. sf's body/file shorts are `-b`/`-f`, so
    // a `b` or `f` anywhere in the cluster (`-f`, `-b`, `-if`, `-Sf`, `-bX`, attached
    // `-freq.json`) implies a body/write, mirroring the method-letter `X` detection.
    if (/^-[A-Za-z]/.test(a)) {
      const body = a.slice(1);
      const eq = body.indexOf('=');
      const letters = eq === -1 ? body : body.slice(0, eq);

      const xIdx = letters.indexOf('X');
      if (xIdx !== -1) {
        const after = body.slice(xIdx + 1).replace(/^=/, '');
        if (after) setExplicit(after);
        else setExplicit(args[i + 1] ?? '');
      }
      if (letters.includes('b') || letters.includes('f')) hasBody = true;
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
