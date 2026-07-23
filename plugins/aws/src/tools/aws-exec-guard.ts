// Pure guardrail helpers for the aws_exec passthrough tool.
// Keeps argv hygiene and read-only enforcement free of I/O so they are trivially
// testable. Fail-safe allowlist design: unknown operations are blocked.
//
// `hasControlChars` lives in ./shared (Task 1) — the tool imports it from there so
// there is a single source of truth; it is deliberately NOT re-exported here.
//
// aws grammar is `aws <service> <operation>` (space-separated, 2-deep). There is
// NO `api`/HTTP passthrough, so — unlike gitlab/glab — there is no effectiveApiMethod
// or HTTP-method inference. The read/write decision is made purely on the operation
// token (positionals[1]), with an s3 special-case for its non-`<verb>-<noun>` verbs.

// Top-level read commands that take no service/operation (e.g. `aws help`).
export const READ_TOP: ReadonlySet<string> = new Set(['help']);

// `aws s3` (the high-level transfer command, distinct from `aws s3api`) uses bare
// verbs rather than the `<verb>-<noun>` convention, so it needs an explicit table.
// `ls` is the only read; the rest move/delete objects or buckets.
export const S3_READ_OPS: ReadonlySet<string> = new Set(['ls']);
export const S3_WRITE_OPS: ReadonlySet<string> = new Set(['cp', 'mv', 'rm', 'sync', 'mb', 'rb']);

// Operation-name prefixes that denote a read across the AWS CLI's `<verb>-<noun>`
// naming convention. Anything not matched here (or in READ_EXACT) is blocked.
export const READ_PREFIXES: readonly string[] = [
  'describe-',
  'list-',
  'get-',
  'lookup-',
  'search-',
  'batch-get-',
  'head-',
  'estimate-',
  'simulate-',
  'preview-',
  'filter-',
  'check-',
  'resolve-',
];

// Exact read operations that do not fit the prefix convention.
export const READ_EXACT: ReadonlySet<string> = new Set(['ls', 'wait', 'help', 'scan', 'select', 'query']);

// Port of the gitlab guard's positional extraction with FLAG-VALUE EXCLUSION: drop
// every flag token AND the token immediately following a flag. This prevents a
// value-taking global flag (e.g. `--region us-east-1`) from shifting the real
// operation out of positionals[1] (which would let `--region us-east-1 ec2
// run-instances` masquerade as a read). Over-excluding the token after a boolean
// flag is fail-safe: at worst it blocks a read; it never allows a write.
export function getPositionals(args: string[]): string[] {
  return args.filter((a, i) => !a.startsWith('-') && !(i > 0 && args[i - 1].startsWith('-')));
}

const WRITE_DELEGATION =
  'aws_exec is read-only by default. Run write/destructive operations through an ' +
  'explicitly confirmed path (delegate to the aws:cli-operator agent), not aws_exec.';

export function findMutation(args: string[]): { blocked: boolean; reason?: string } {
  const positionals = getPositionals(args);
  if (positionals.length === 0) {
    return { blocked: true, reason: 'no aws command provided' };
  }

  const service = positionals[0];
  const op = positionals[1];

  // Top-level reads (`aws help`) take no operation.
  if (READ_TOP.has(service)) return { blocked: false };

  // s3 high-level command: explicit allow/deny table, fail-safe on anything else.
  if (service === 's3') {
    if (op && S3_READ_OPS.has(op)) return { blocked: false };
    if (op && S3_WRITE_OPS.has(op)) {
      return { blocked: true, reason: `"s3 ${op}" writes to S3. ${WRITE_DELEGATION}` };
    }
    return {
      blocked: true,
      reason: op
        ? `"s3 ${op}" is not a recognized read-only S3 command. ${WRITE_DELEGATION}`
        : `"s3" requires a subcommand; only "s3 ls" is allowed as read-only. ${WRITE_DELEGATION}`,
    };
  }

  // Generic services: read iff the operation matches the allowlist.
  if (!op) {
    return {
      blocked: true,
      reason: `"${service}" has no operation; provide a read-only operation. ${WRITE_DELEGATION}`,
    };
  }

  const isRead = READ_EXACT.has(op) || READ_PREFIXES.some((p) => op.startsWith(p));
  if (isRead) return { blocked: false };

  return {
    blocked: true,
    reason: `"${service} ${op}" is not a recognized read-only aws operation. ${WRITE_DELEGATION}`,
  };
}

// Default to JSON for machine-readable output, but respect a caller-supplied
// --output / -o so `-o table` and `-o text` are honored instead of overridden.
export function buildAwsArgs(args: string[]): string[] {
  const hasOutput = args.some((a) => a === '--output' || a === '-o');
  return hasOutput ? [...args] : [...args, '--output', 'json'];
}
