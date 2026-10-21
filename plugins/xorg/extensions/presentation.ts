import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { controllerArgv, type DesktopInput } from './commands';

type Section = ReturnType<PresentationAPI['data']>[number];
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
const known = (value: unknown) => (value === undefined || value === null ? 'unknown' : value);

/** Domain data only; xcsh owns commands, layout, expansion, themes and timers. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const scope = (input: unknown) => {
    const args = record(input);
    return fields(
      { Session: known(args.session), Command: known(args.command), Action: known(args.action) },
      'Requested desktop scope',
    );
  };
  return p.withPresentation(tool, {
    call(input: unknown) {
      return {
        summary: tool.label ?? tool.name,
        sections: [scope(input), p.command(controllerArgv(input as DesktopInput), 'Desktop command')],
      };
    },
    result(
      result: { details?: unknown; content: readonly { type: string; text?: string }[]; isError?: boolean },
      options: { expanded: boolean; isPartial: boolean },
      input: unknown,
    ) {
      const d = record(result.details);
      const envelope = record(d.observation);
      const fallback = () => ({
        sections: [
          ...p.data(result.details),
          ...result.content
            .filter((b) => b.type === 'text')
            .map((b) => ({ kind: 'code' as const, title: 'Complete controller output', text: b.text ?? '' })),
        ],
      });
      if (
        typeof envelope.ok !== 'boolean' ||
        typeof d.exitCode !== 'number' ||
        result.content.some((b) => b.type !== 'text')
      )
        return fallback();
      const ok = envelope.ok && d.exitCode === 0 && !result.isError;
      const payload = envelope.result;
      if (envelope.ok && (payload === null || typeof payload !== 'object')) return fallback();
      if (!envelope.ok && typeof envelope.error !== 'string') return fallback();
      const rows = Array.isArray(payload) ? payload : undefined;
      const r = record(payload);
      const sections: Section[] = [
        scope(input),
        fields(
          { OK: ok, 'Exit code': d.exitCode, State: known(r.state), 'Item count': rows?.length ?? 'unknown' },
          'Desktop outcome',
        ),
      ];
      const collection = (items: unknown, title: string) => {
        if (
          !Array.isArray(items) ||
          !items.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
        )
          return;
        const keys = ['id', 'title', 'pid', 'name', 'role', 'state', 'mapped', 'width', 'height'];
        const columns = keys
          .filter((key) => items.some((item) => key in item))
          .map((key) => ({
            key,
            label:
              ({ id: 'Window ID', pid: 'PID', width: 'Width (px)', height: 'Height (px)' } as Record<string, string>)[
                key
              ] ?? key[0].toUpperCase() + key.slice(1),
          }));
        if (!columns.length) columns.push({ key: 'name', label: 'Name' });
        sections.push({ kind: 'table', title, rows: items, columns, previewRows: 12 });
      };
      if (rows) collection(rows, 'Desktop items');
      const scalars = Object.fromEntries(
        Object.entries(r).filter(([, value]) => value === null || typeof value !== 'object'),
      );
      if (Object.keys(scalars).length) sections.push({ kind: 'fields', title: 'Operation findings', values: scalars });
      for (const key of ['windows', 'nodes', 'displays'])
        if (key in r) collection(r[key], key[0].toUpperCase() + key.slice(1));
      if (!ok && !options.expanded)
        sections.push({
          kind: 'code',
          title: 'Complete corrective guidance',
          text: typeof envelope.error === 'string' ? envelope.error : String(d.stderr ?? d.output ?? ''),
        });
      const warnings = ['Results apply to the selected desktop session; unavailable sessions are not empty desktops.'];
      if (options.isPartial) warnings.push('Output is still streaming; results are not final.');
      if (options.expanded) {
        const complete = [
          scope(input),
          { kind: 'code' as const, title: 'Complete controller evidence', text: JSON.stringify(envelope, null, 2) },
        ];
        for (const [title, text] of [
          ['Additional stdout', d.output],
          ['Additional stderr', d.stderr],
        ] as const) {
          if (typeof text !== 'string' || !text.trim()) continue;
          try {
            if (JSON.stringify(JSON.parse(text)) === JSON.stringify(envelope)) continue;
          } catch {
            /* Preserve opaque controller text. */
          }
          complete.push({ kind: 'code', title, text });
        }
        return {
          summary: ok ? 'Xorg desktop operation completed' : 'Xorg desktop operation failed',
          sections: complete,
          warnings,
          expandedEvidence: 'provided' as const,
        };
      }
      return {
        summary: ok ? 'Xorg desktop operation completed' : 'Xorg desktop operation failed',
        sections,
        warnings,
        expandedEvidence: 'provided' as const,
      };
    },
  });
}
