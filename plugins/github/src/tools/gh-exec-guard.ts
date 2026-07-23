// Pure guardrail helpers for the gh_exec passthrough tool.
// Keeps argv hygiene and read-only enforcement free of I/O so they are trivially testable.

// Matches ASCII control characters: C0 range (U+0000-U+001F) plus DEL (U+007F).
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional argv hygiene check
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

export function hasControlChars(arg: string): boolean {
  return CONTROL_CHAR_PATTERN.test(arg);
}

export const MUTATING_VERBS: ReadonlySet<string> = new Set([
  'create',
  'edit',
  'delete',
  'close',
  'reopen',
  'merge',
  'comment',
  'review',
  'rerun',
  'cancel',
  'sync',
  'fork',
  'rename',
  'lock',
  'unlock',
  'pin',
  'unpin',
  'transfer',
  'archive',
  'unarchive',
  'set',
  'add',
  'remove',
  'disable',
  'enable',
  'revoke',
  'import',
  'upload',
  'restore',
  'update',
  'approve',
  'ready',
  'draft',
]);

const MUTATING_API_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_BODY_FLAGS: ReadonlySet<string> = new Set(['-f', '-F', '--field', '--raw-field']);

export function findMutation(args: string[]): { blocked: boolean; reason?: string } {
  const positionals = args.filter((a) => !a.startsWith('-'));

  // gh api: block non-GET methods and body-field flags (which imply POST).
  if (positionals[0] === 'api') {
    let method: string | null = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-X' || a === '--method') {
        method = (args[i + 1] ?? '').toUpperCase();
      } else if (a.startsWith('--method=')) {
        method = a.slice('--method='.length).toUpperCase();
      }
    }
    if (method && MUTATING_API_METHODS.has(method)) {
      return { blocked: true, reason: `gh api with method ${method} is a mutating request` };
    }
    const hasBodyField = args.some((a) => API_BODY_FLAGS.has(a) || /^(--field|--raw-field)=/.test(a));
    if (hasBodyField && method !== 'GET') {
      return { blocked: true, reason: 'gh api with body fields implies a mutating (POST) request' };
    }
  }

  const verb = positionals.find((tok) => MUTATING_VERBS.has(tok));
  if (verb) {
    return { blocked: true, reason: `"${verb}" is a mutating operation` };
  }
  return { blocked: false };
}
