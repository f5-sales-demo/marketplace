// Keep this renderer hermetic: no runtime/native imports from the host package.
const plain = (text: string) => Bun.stripANSI(text);
const charWidth = (c: string) =>
  /\p{Mark}/u.test(c)
    ? 0
    : /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60]/u.test(c)
      ? 2
      : 1;
const visibleWidth = (text: string) => [...plain(text)].reduce((n, c) => n + charWidth(c), 0);
function wrapTextWithAnsi(text: string, width: number): string[] {
  return plain(text)
    .split('\n')
    .flatMap((line) => {
      const output: string[] = [];
      let current = '',
        used = 0;
      for (const c of line) {
        const size = charWidth(c);
        if (used + size > width && current) {
          output.push(current);
          current = '';
          used = 0;
        }
        current += c;
        used += size;
      }
      output.push(current);
      return output;
    });
}
function wrapWords(text: string, width: number): string[] {
  return text.split('\n').flatMap((line) => {
    const out: string[] = [];
    let current = '';
    for (const word of line.split(/(?<=\s)/)) {
      if (current && visibleWidth(current + word) > width) {
        out.push(current.trimEnd());
        current = '';
      }
      if (visibleWidth(word) > width) {
        const chunks = wrapTextWithAnsi(word, width);
        out.push(...chunks.slice(0, -1));
        current = chunks.at(-1) ?? '';
      } else current += word;
    }
    out.push(current.trimEnd());
    return out;
  });
}
function renderTable(
  headers: string[],
  rows: string[][],
  width: number,
  options: { symbols: any; bold: (s: string) => string },
  _align: string[],
): string[] {
  const count = headers.length;
  if (!count) return [];
  if (width < count * 4 + 1)
    return rows.flatMap((row) => row.flatMap((cell, i) => wrapTextWithAnsi(`${headers[i]}: ${cell}`, width)));
  const available = width - count * 3 - 1;
  const widths = headers.map((head, i) =>
    Math.max(
      3,
      Math.min(
        35,
        Math.max(...[head, ...rows.map((r) => r[i])].map((s) => Math.max(...s.split('\n').map(visibleWidth)))),
      ),
    ),
  );
  while (widths.reduce((a, b) => a + b, 0) > available) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest]--;
  }
  if (
    widths.some(
      (n, i) =>
        n <
        Math.min(
          headers[i] === 'Month' ? 6 : 10,
          Math.max(...[headers[i], ...rows.map((r) => r[i])].map(visibleWidth)),
        ),
    )
  )
    return rows.flatMap((row) => row.flatMap((cell, i) => wrapWords(`${headers[i]}: ${cell}`, width)));
  const box = options.symbols;
  const h = box?.horizontal ?? '─',
    v = box?.vertical ?? '│';
  const rule = (left: string, middle: string, right: string) =>
    left + widths.map((n) => h.repeat(n + 2)).join(middle) + right;
  const line = (cells: string[]) =>
    v +
    cells
      .map((s, i) => {
        const pad = ' '.repeat(Math.max(0, widths[i] - visibleWidth(s)));
        return _align[i] === 'right' ? ` ${pad}${s} ` : ` ${s}${pad} `;
      })
      .join(v) +
    v;
  const output = [rule(box?.topLeft ?? '┌', box?.teeDown ?? '┬', box?.topRight ?? '┐')];
  for (const [i, row] of [headers, ...rows].entries()) {
    const cells = row.map((s, k) => wrapWords(s, widths[k]));
    for (let j = 0; j < Math.max(...cells.map((c) => c.length)); j++) output.push(line(cells.map((c) => c[j] ?? '')));
    if (i < rows.length) output.push(rule(box?.teeRight ?? '├', box?.cross ?? '┼', box?.teeLeft ?? '┤'));
  }
  output.push(rule(box?.bottomLeft ?? '└', box?.teeUp ?? '┴', box?.bottomRight ?? '┘'));
  return output;
}

import type { Options, View } from './shared';

// Resolve layout through the existing component surface, at the actual frame width.
export function component(title: string, view: (width: number) => View, options: Options, theme: any, isError = false) {
  return {
    invalidate() {},
    render(width: number): string[] {
      const inner = Math.max(1, width - 3);
      const result = view(inner);
      const lines: string[] = [];
      const wrap = (text: string) => wrapTextWithAnsi(text, inner);
      if (result.summary) lines.push(...wrap(theme.fg('toolTitle', result.summary)));
      for (const warning of result.warnings ?? []) {
        const known =
          warning === 'Results are incomplete. Counts and conclusions apply only to returned data.' ||
          warning === 'Output is still streaming; results are not final.';
        if (
          known &&
          result.sections.some(
            (s) =>
              s.kind === 'markdown' &&
              /Partial results|Partial related records|Provisional results|Pipeline:|Discovering pipeline scope|Preparing pipeline/.test(
                s.text,
              ),
          )
        )
          continue;
        lines.push(...wrap(theme.fg('warning', warning)));
      }
      for (const section of result.sections) {
        if (section.title) lines.push(...wrap(theme.fg('dim', section.title)));
        if (section.kind === 'table') {
          const shown = options.expanded ? section.rows : section.rows.slice(0, 12);
          const text = (value: unknown) =>
            typeof value === 'string' ? value || '""' : (JSON.stringify(value) ?? 'undefined');
          lines.push(
            ...renderTable(
              section.columns.map((c) => c.label ?? c.key),
              shown.map((row) => section.columns.map((c) => text(row[c.key]))),
              inner,
              { symbols: theme.boxSharp, bold: (s: string) => theme.bold(s) },
              section.columns.map((c) => c.align ?? 'left'),
            ),
          );
          if (shown.length < section.rows.length)
            lines.push(...wrap(`${section.rows.length - shown.length} more rows in expanded details`));
        } else if (section.kind === 'fields') {
          for (const [key, value] of Object.entries(section.values))
            lines.push(
              ...wrap(`${key}: ${typeof value === 'string' ? value : (JSON.stringify(value) ?? 'undefined')}`),
            );
        } else lines.push(...wrapWords(section.text, inner));
      }
      const box = theme.boxSharp;
      const border = (text: string) => theme.fg('dim', text);
      const hasRunningCue = result.sections.some(
        (s) => s.kind === 'markdown' && /Pipeline:|Discovering pipeline scope|Preparing pipeline/.test(s.text),
      );
      const heading = `${title}${isError ? ' · Failed' : options.isPartial && !hasRunningCue ? ' · In progress' : ''}`;
      const head = wrapTextWithAnsi(heading, Math.max(1, width - 4))[0] ?? '';
      return [
        border(
          `${box.topLeft}${box.horizontal} ${head}${box.horizontal.repeat(Math.max(0, width - visibleWidth(head) - 4))}${box.topRight}`,
        ),
        ...lines.map(
          (line) =>
            `${border(`${box.vertical} `)}${line}${' '.repeat(Math.max(0, inner - visibleWidth(line)))}${border(box.vertical)}`,
        ),
        border(`${box.bottomLeft}${box.horizontal.repeat(Math.max(0, width - 2))}${box.bottomRight}`),
      ];
    },
  };
}
