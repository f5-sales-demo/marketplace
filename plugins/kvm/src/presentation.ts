type ViewSection =
  | { kind: 'fields'; title?: string; values: Record<string, unknown> }
  | { kind: 'table'; title?: string; columns: { key: string; label?: string }[]; rows: Record<string, unknown>[] }
  | { kind: 'markdown'; text: string };
type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };

/** Domain data only: xcsh owns terminal layout, preview policy and the active theme. */
function sections(value: unknown, title?: string): ViewSection[] {
  if (
    Array.isArray(value) &&
    value.length &&
    value.every((row) => row && typeof row === 'object' && !Array.isArray(row))
  ) {
    return [
      {
        kind: 'table',
        title,
        columns: [...new Set(value.flatMap((row) => Object.keys(row)))].map((key) => ({ key })),
        rows: value,
      },
    ];
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const values: Record<string, unknown> = {};
    const nested: ViewSection[] = [];
    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === 'object') nested.push(...sections(child, title ? `${title}.${key}` : key));
      else values[key] = child;
    }
    return [...(Object.keys(values).length ? [{ kind: 'fields' as const, title, values }] : []), ...nested];
  }
  return [{ kind: 'fields', title, values: { value } }];
}

export function presentTool<T extends { name: string; label?: string }>(tool: T) {
  return {
    ...tool,
    presentation: {
      call: (args: unknown) => ({ summary: tool.label ?? tool.name, sections: sections(args) }),
      result: (result: Result) => ({
        sections: result.content
          .filter((block) => block.type === 'text')
          .flatMap((block) => {
            try {
              return sections(JSON.parse(block.text ?? ''));
            } catch {
              return [{ kind: 'markdown' as const, text: block.text ?? '(no output)' }];
            }
          }),
      }),
    },
  };
}
