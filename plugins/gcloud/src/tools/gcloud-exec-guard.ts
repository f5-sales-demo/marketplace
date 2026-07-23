// Pure guardrail helpers for the gcloud_exec passthrough tool.
// Keeps argv hygiene and read-only enforcement free of I/O so they are trivially
// testable. Fail-safe allowlist design: unrecognized verbs are blocked.
//
// `hasControlChars` lives in ./shared (Task 1) — the tool imports it from there so
// there is a single source of truth; it is deliberately NOT re-exported here.
//
// gcloud grammar: `gcloud [alpha|beta] <group> [<subgroup>…] <verb> [positional args] [--flags]`.
// The read/write decision scans ALL non-flag tokens (see getPositionals) — the
// azure "all-positionals" model — rather than trying to isolate the verb by
// position. Any flag-value exclusion / "drop the token after a flag" logic
// over-excludes and is exactly the bug class that broke the GitHub/GitLab/Salesforce
// guards (`-dp create`, `-fX=GET` slipping a write past the guard). Taking every
// non-flag token is fail-safe: a flag value that happens to equal a verb is blocked
// (rare, safe) and a write verb can never be hidden by exclusion.

// Exact read-only verbs that do not fit a read prefix.
export const READ_EXACT: ReadonlySet<string> = new Set([
  'list',
  'describe',
  'get-iam-policy',
  'get-value',
  'get-server-config',
  'get-ancestors',
  'list-grantable-roles',
  'print-settings',
  'version',
  'info',
]);

// Verb prefixes that denote a read across gcloud's `<verb>-<noun>` naming.
export const READ_PREFIXES: readonly string[] = ['list-', 'describe-'];

// Top-level commands that take no group/verb (resolved when positionals[0] is one).
export const READ_TOP: ReadonlySet<string> = new Set(['version', 'info', 'help', 'topic', 'cheat-sheet']);

// Verbs that execute code, open interactive sessions, or mint/consume credentials.
// These are neither pure reads nor simple mutations — they are execution/credential
// vectors and must never run through the passthrough, even read-shaped ones.
export const DANGEROUS_VERBS: ReadonlySet<string> = new Set([
  'ssh',
  'scp',
  'connect',
  'call',
  // `execute` is a genuine execution vector — `gcloud run jobs execute`, `gcloud
  // workflows execute` run code — so it is named explicitly (rather than left to the
  // fail-safe unrecognized-verb block) to route through the cli-operator with a clear
  // reason. NB: `run` is deliberately NOT a dangerous verb — it collides with the Cloud
  // Run group and would refuse legitimate reads like `gcloud run services list`; its
  // real vectors are covered by `execute` (run jobs execute) and `deploy` (run deploy).
  'execute',
  'interactive',
  'login',
  'revoke',
  'get-credentials',
  // print-access-token / print-identity-token mint and print usable bearer credentials
  // to stdout, which would flow into agent context and logs — a credential-exposure
  // vector. Route token minting through the confirmed cli-operator path, not the
  // read-only passthrough.
  'print-access-token',
  'print-identity-token',
  'reset-windows-password',
  'simulate-maintenance-event',
  'enable-service',
  'configure-docker',
]);

// Verbs that create, change, or destroy state.
export const MUTATING_VERBS: ReadonlySet<string> = new Set([
  'create',
  'delete',
  'update',
  'patch',
  'remove',
  'add',
  'set',
  'set-iam-policy',
  'add-iam-policy-binding',
  'remove-iam-policy-binding',
  'deploy',
  'import',
  'export',
  'apply',
  'enable',
  'disable',
  'start',
  'stop',
  'restart',
  'resize',
  'suspend',
  'resume',
  'reset',
  'rollback',
  'promote',
  'migrate',
  'undelete',
  'restore',
  'activate',
  'deactivate',
  'attach',
  'detach',
  'bind',
  'unbind',
  'clear',
  'move',
  'clone',
  'copy',
  'wait',
  'abandon',
  'recreate',
  'rotate',
  'acknowledge',
  'publish',
  'seek',
  'purge',
  'cancel',
  'override',
  'unset',
  'snapshot',
  'upgrade',
  'downgrade',
  'repair',
  'drain',
  'uncordon',
  'cordon',
  'add-tags',
  'remove-tags',
]);

const WRITE_DELEGATION =
  'gcloud_exec is read-only by default. Run write/destructive operations through an ' +
  'explicitly confirmed path (delegate to the gcloud:cli-operator agent), not gcloud_exec.';

// Every argument that is not itself a flag. We deliberately do NOT exclude
// "flag values" (the `foo` in `--zone foo`): telling value-taking flags apart from
// boolean switches without the full gcloud grammar is error-prone, and any mistake
// lets a destructive verb slip through (e.g. `--zone create instances delete`) or a
// leading global flag hide the real verb. For a read-only *security* guardrail we
// fail safe and treat every non-flag token as a candidate verb.
export function getPositionals(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith('-'));
}

function isKnownVerb(tok: string): boolean {
  return (
    READ_EXACT.has(tok) ||
    READ_PREFIXES.some((p) => tok.startsWith(p)) ||
    DANGEROUS_VERBS.has(tok) ||
    MUTATING_VERBS.has(tok)
  );
}

// The leftmost positional that is a recognized verb (read, dangerous, or mutating);
// null if none is recognized.
export function findVerb(positionals: string[]): string | null {
  return positionals.find((tok) => isKnownVerb(tok)) ?? null;
}

// First positional that is a dangerous execution/credential verb, else null.
export function findDangerous(positionals: string[]): string | null {
  return positionals.find((tok) => DANGEROUS_VERBS.has(tok)) ?? null;
}

// First positional that is a mutating verb, else null.
export function findMutating(positionals: string[]): string | null {
  return positionals.find((tok) => MUTATING_VERBS.has(tok)) ?? null;
}

export function isRead(verb: string): boolean {
  return READ_EXACT.has(verb) || READ_PREFIXES.some((p) => verb.startsWith(p));
}

export function checkGcloud(args: string[]): { blocked: boolean; reason?: string } {
  const positionals = getPositionals(args);

  // 1. No command at all.
  if (positionals.length === 0) {
    return { blocked: true, reason: 'no gcloud command provided' };
  }

  // 2. Dangerous execution/credential vectors (scan-anywhere, defense-in-depth).
  const d = findDangerous(positionals);
  if (d) {
    return {
      blocked: true,
      reason:
        `"${d}" is an execution/credential vector (opens a session, runs code, or mints/consumes ` +
        `credentials) and cannot run through gcloud_exec. Run it through the gcloud:cli-operator agent.`,
    };
  }

  // 3. Mutating operations (scan-anywhere, defense-in-depth).
  const m = findMutating(positionals);
  if (m) {
    return { blocked: true, reason: `"${m}" is a mutating operation. ${WRITE_DELEGATION}` };
  }

  // 4. Top-level read commands (`version`, `info`, `help`, `topic`, `cheat-sheet`).
  if (READ_TOP.has(positionals[0])) {
    return { blocked: false };
  }

  // 5. Require an explicit recognized read verb — fail-safe on unknown verbs.
  const v = findVerb(positionals);
  if (v && isRead(v)) {
    return { blocked: false };
  }

  return {
    blocked: true,
    reason:
      'unrecognized gcloud command; provide a read-only verb ' +
      `(list/describe/get-iam-policy/…). ${WRITE_DELEGATION}`,
  };
}

// Default to JSON for machine-readable output, but respect a caller-supplied
// --format so `--format=table(...)`, `--format=yaml`, `--format=csv`, and
// `--format=value(...)` are honored instead of overridden.
export function buildGcloudArgs(args: string[]): string[] {
  const hasFormat = args.some((a) => a === '--format' || a.startsWith('--format='));
  return hasFormat ? [...args] : [...args, '--format=json'];
}
