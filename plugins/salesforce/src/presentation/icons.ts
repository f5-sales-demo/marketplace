import type { View } from './shared';

type SymbolKey = 'icon.extensionSlashCommand' | 'lang.sql' | 'icon.file' | 'icon.host' | 'icon.extensionInstruction';
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

export function decorate(view: View, resolve: SymbolResolver, summaryKey?: SymbolKey): View {
  const title = (key: SymbolKey, text = '') => [resolve(key), text].filter(Boolean).join(' ') || undefined;
  return {
    ...view,
    ...(view.summary && summaryKey ? { summary: title(summaryKey, view.summary) } : {}),
    sections: view.sections.map((section, index) => {
      const name = section.title ?? '';
      const key =
        (index === 0 && section.kind === 'code' && !name) || /^Source query \d+$/.test(name)
          ? 'icon.extensionSlashCommand'
          : /^(Standard fields|Matching fields|Fields|Child relationships|Selected field metadata|Objects|Limits)$/.test(
                name,
              )
            ? 'icon.file'
            : name === 'Usage'
              ? 'icon.extensionInstruction'
              : name === 'Report scope'
                ? 'icon.host'
                : /^Pipeline summary/.test(name)
                  ? 'lang.sql'
                  : undefined;
      return key ? { ...section, title: title(key, name) } : section;
    }),
  };
}
