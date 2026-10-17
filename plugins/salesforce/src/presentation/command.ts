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
export function copyableCommand(p: PresentationAPI, argv: readonly string[], title = 'Command · copy and run') {
  const quote = (arg: string) => p.command([arg]).text;
  const argumentsText = argv.map((arg) => {
    if (width(quote(arg)) <= 24) return quote(arg);
    const characters = [...arg];
    const chunks: string[] = [];
    while (characters.length) {
      let count = 1;
      while (count < characters.length && width(quote(characters.slice(0, count + 1).join(''))) <= 24) count++;
      const space = characters.slice(0, count).lastIndexOf(' ');
      if (space >= count / 2) count = space + 1;
      chunks.push(quote(characters.splice(0, count).join('')));
    }
    return chunks.join('\\\n');
  });
  let head = argumentsText.shift() ?? 'sf';
  while (argumentsText.length && /^[a-z][a-z:]*$/.test(argumentsText[0]) && width(`${head} ${argumentsText[0]}`) <= 24)
    head += ` ${argumentsText.shift()}`;
  return { kind: 'code' as const, title, text: [head, ...argumentsText].join(' \\\n') };
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
