import { type Options, ownedTables, type View } from './shared';

type SymbolKey =
  | 'status.info'
  | 'status.warning'
  | 'status.running'
  | 'status.disabled'
  | 'icon.extensionSlashCommand'
  | 'lang.sql'
  | 'icon.file'
  | 'icon.host'
  | 'icon.extensionInstruction';
export type SymbolResolver = (key: SymbolKey) => string | undefined;
export interface PresentationContext {
  hasUI: boolean;
  ui: { readonly theme: { symbol(key: SymbolKey): string } };
}

// Read the UI's theme getter on every presentation; never retain a preset snapshot.
export function sessionSymbols() {
  let context: PresentationContext | undefined;
  return {
    bind(next: PresentationContext) {
      context = next;
    },
    resolve: ((key) => (context?.hasUI ? context.ui.theme.symbol(key) : undefined)) as SymbolResolver,
  };
}

export function decorate(view: View, resolve: SymbolResolver, options: Options): View {
  const { states = [], ...output } = view;
  let missing = false;
  const sections = view.sections.flatMap((section) => {
    if (section.kind !== 'table' || !ownedTables.has(section)) return [section];
    const formatted = {
      ...section,
      rows: section.rows.map((row) =>
        Object.fromEntries(
          section.columns.map(({ key }) => {
            const value = row[key];
            if (value !== null && value !== undefined) return [key, value];
            missing = true;
            return [key, resolve('status.disabled') ?? 'No value'];
          }),
        ),
      ),
    };
    if (options.expanded || formatted.rows.length <= 3) return [formatted];
    // xcsh 23.5.1 previews three rows per table. Keep ordinary result sets visible
    // in sequential table blocks without changing the shared presentation contract.
    const visible = formatted.rows.slice(0, 12);
    const blocks = [];
    for (let i = 0; i < visible.length; i += 3)
      blocks.push({ ...formatted, ...(i ? { title: undefined } : {}), rows: visible.slice(i, i + 3) });
    if (formatted.rows.length > visible.length)
      blocks.push({
        kind: 'markdown' as const,
        text: `${formatted.rows.length - visible.length} more rows in expanded details`,
      });
    return blocks;
  });
  const cues = states.map(({ kind, text }) => ({
    kind: 'markdown' as const,
    text: [resolve(`status.${kind}`), text].filter(Boolean).join(' '),
  }));
  const cueIndex = sections.findIndex((section) => section.kind === 'table');
  const insert = cueIndex < 0 ? sections.length : cueIndex;
  return {
    ...output,
    sections: [
      ...sections.slice(0, insert),
      ...cues,
      ...sections.slice(insert),
      ...(missing
        ? [{ kind: 'markdown' as const, text: [resolve('status.disabled'), 'No value'].filter(Boolean).join(' ') }]
        : []),
    ],
  };
}
