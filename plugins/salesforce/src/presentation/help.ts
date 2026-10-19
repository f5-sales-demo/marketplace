import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import type { Args, Options, Result, View } from './shared';
import { code, evidence, hint, literal, texts } from './shared';

export function helpView(p: PresentationAPI, result: Result, options: Options, args: Args): View {
  const text = texts(result).join('\n');
  const sections: Record<string, string[]> = {};
  const purpose: string[] = [];
  let heading = '';
  for (const line of text.split('\n')) {
    if (/^[A-Z][A-Z /-]+$/.test(line.trim()) && line === line.trim()) {
      heading = line.trim();
      sections[heading] ??= [];
    } else if (heading) sections[heading].push(line);
    else purpose.push(line);
  }
  const usage = sections.USAGE?.join('\n').trim();
  if (!usage)
    return {
      summary: 'Salesforce CLI help',
      sections: [
        code(text || '(no help output)', 'Complete help text'),
        ...(options.expanded && result.details !== undefined ? [literal(result.details, 'Metadata')] : []),
      ],
    };
  const required: string[] = [],
    optional: string[] = [];
  let flag = '';
  const add = () => {
    if (flag) (/\(required\)|\[required\]/i.test(flag) ? required : optional).push(flag);
    flag = '';
  };
  for (const line of [...(sections.FLAGS ?? []), ...(sections['GLOBAL FLAGS'] ?? []), ...(sections.ARGUMENTS ?? [])]) {
    if (/^\s*(?:-\w,?\s+)?--[\w-]+|^\s*[A-Z][A-Z_]+\s{2,}/.test(line)) {
      add();
      flag = line.trim();
    } else if (line.trim()) flag += `\n${line.trim()}`;
  }
  add();
  return {
    summary:
      purpose.join(' ').trim() ||
      sections.DESCRIPTION?.filter((l) => l.trim())[0]?.trim() ||
      `Help for sf ${String(args.command_path ?? '')}`.trim(),
    sections: [
      code(usage, 'Usage'),
      ...(required.length ? [code(required.join('\n'), 'Required inputs')] : []),
      ...(optional.length ? [code(optional.join('\n'), 'Optional flags')] : []),
      ...(sections.EXAMPLES?.join('').trim() ? [code(sections.EXAMPLES.join('\n').trim(), 'Examples')] : []),
      ...(options.expanded
        ? [
            hint('Help sections parsed from returned headings; required markers may be absent.'),
            ...evidence(p, result, args),
          ]
        : []),
    ],
  };
}
