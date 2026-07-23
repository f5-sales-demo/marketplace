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

// Global value-taking flags whose NEXT token (in space form) is a value, not a
// positional. These can precede or interleave the service+operation, so their
// value must be excluded from positional extraction — otherwise a value-taking
// flag (e.g. `--region us-east-1`) would shift the real operation out of
// positionals[1] and let `--region us-east-1 ec2 run-instances` masquerade as a
// read.
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--region',
  '--profile',
  '--output',
  '--query',
  '--endpoint-url',
  '--color',
  '--ca-bundle',
  '--cli-read-timeout',
  '--cli-connect-timeout',
  '--page-size',
  '--max-items',
  '--starting-token',
]);

// Positional extraction with FLAG-VALUE EXCLUSION restricted to KNOWN value-taking
// flags. A token is a positional iff it does NOT start with `-` AND its preceding
// token is not a value-taking flag in space form. Boolean flags (e.g.
// `--no-cli-pager`, `--debug`) take no value, so the token after them is NOT
// dropped — this closes the bypass where a boolean placed before the operation
// dropped the real (write) verb and promoted a later read-prefixed bare positional
// into the operation slot. `--flag=value` forms consume no separate token, so
// nothing extra is dropped for them.
export function getPositionals(args: string[]): string[] {
  return args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    if (i > 0) {
      const prev = args[i - 1];
      if (VALUE_FLAGS.has(prev) && !prev.includes('=')) return false;
    }
    return true;
  });
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
