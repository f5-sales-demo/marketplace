import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import type { Args } from './shared';

// The smallest supported frame has room for 25 columns. Explicit continuations
// keep terminal reflow from inserting shell-significant newlines. Adjacent quoted
// chunks form one argument; quoting itself remains owned by the host API.
const width = (text: string) =>
  Math.max(
    ...text
      .split('\n')
      .map((line) => [...line].reduce((n, c) => n + (c === '\t' ? 8 : c.charCodeAt(0) > 127 ? 2 : 1), 0)),
  );
export function copyableCommand(
  p: PresentationAPI,
  argv: readonly string[],
  title?: string,
  columns = process.stdout.columns ?? 40,
) {
  const available = Math.max(25, columns);
  const single = p.command(argv).text;
  if (!single.includes('\n') && width(single) <= available) return { kind: 'code' as const, title, text: single };
  const quote = (arg: string) => p.command([arg]).text;
  const lines: string[] = [];
  let line = '';
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const encoded = quote(arg);
    const separator = line ? ' ' : '';
    const last = index === argv.length - 1;
    if (!encoded.includes('\n') && width(line + separator + encoded) <= available - (last ? 0 : 2)) {
      line += separator + encoded;
      continue;
    }
    // Start a new line only if this argument fits there without splitting.
    if (!encoded.includes('\n') && width(encoded) <= available - (last ? 0 : 2)) {
      if (line) lines.push(line + ' \\');
      line = encoded;
      continue;
    }
    const characters = [...arg];
    if (line) line += ' ';
    while (characters.length) {
      let count = 0;
      while (count < characters.length && width(line + quote(characters.slice(0, count + 1).join(''))) <= available - 1)
        count++;
      if (!count) {
        lines.push(line.trimEnd() + ' \\');
        line = '';
        continue;
      }
      const space = characters.slice(0, count).lastIndexOf(' ');
      if (space >= count / 2) count = space + 1;
      line += quote(characters.splice(0, count).join(''));
      if (characters.length) {
        lines.push(line + '\\');
        line = '';
      }
    }
  }
  if (line) lines.push(line);
  return { kind: 'code' as const, title, text: lines.join('\n') };
}

export function toolArgv(name: string, args: Args): string[] | undefined {
  if (name === 'sf_exec') return Array.isArray(args.args) ? ['sf', ...args.args.map(String)] : undefined;
  if (name === 'sf_help')
    return [
      'sf',
      ...String(args.command_path ?? '')
        .trim()
        .split(/[ :]/)
        .filter(Boolean),
      '--help',
    ];
  const argv =
    name === 'sf_query'
      ? ['sf', 'data', 'query', '--query', String(args.query ?? '')]
      : name === 'sf_describe'
        ? ['sf', 'sobject', 'describe', '--sobject', String(args.sobject ?? '').trim()]
        : name === 'sf_org_display'
          ? ['sf', 'org', 'display']
          : undefined;
  if (!argv) return undefined;
  if (args.target_org) argv.push('--target-org', String(args.target_org));
  if (name === 'sf_query' && args.use_tooling_api) argv.push('--use-tooling-api');
  if (name === 'sf_query' && args.all_rows) argv.push('--all-rows');
  return [...argv, '--json'];
}
