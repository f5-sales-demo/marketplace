import { isDeepStrictEqual } from 'node:util';
import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

type Section = ReturnType<PresentationAPI['data']>[number];
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const known = (value: unknown) => (value === undefined || value === null ? 'unknown' : value);
const fields = (title: string, values: Record<string, unknown>): Section => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
const scope = (input: unknown) => {
  const args = record(input);
  return fields('Requested Zoom scope', {
    Action: known(args.action),
    'Meeting ID': known(args.meeting_id),
    'Invitation URL': known(args.invitation_url),
    'Requested state': known(args.state),
  });
};
const outcome = (d: Record<string, unknown>) =>
  fields('Zoom outcome', {
    Session: known(d.session),
    Control: known(d.control),
    'Exit code': d.exitCode,
    Verified: known(d.verified),
    Changed: known(d.changed),
  });
const success = (d: Record<string, unknown>, isError = false) => d.exitCode === 0 && !isError;
const summary = (d: Record<string, unknown>, isError = false) =>
  success(d, isError) ? 'Zoom observation or control completed' : 'Zoom observation or control failed';

/** Messages retain full data through shared expansion; no private renderer is needed. */
export function commandPresentation(p: PresentationAPI, d: Record<string, unknown>) {
  return {
    summary: summary(d),
    warnings: success(d) ? [] : ['Zoom command failed; inspect the complete corrective guidance.'],
    sections: [outcome(d), ...p.data(d)],
  };
}

/** Zoom owns domain observations; xcsh owns layout, framing, expansion and themes. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    call(input: unknown) {
      return { summary: tool.label ?? tool.name, sections: [scope(input)] };
    },
    result(
      result: { details?: unknown; content: readonly { type: string; text?: string }[]; isError?: boolean },
      options: { expanded: boolean; isPartial: boolean },
      input: unknown,
    ) {
      const d = record(result.details);
      // The runtime appends automatic evidence for opaque observations. Keep this
      // view useful without copying the same raw payload into adapter sections.
      const fallback = () => ({
        summary: 'Zoom observation is unavailable or malformed',
        warnings: ['Expand the result for complete output and corrective guidance; readiness is unverified.'],
        sections: [scope(input)],
      });
      if (
        typeof d.exitCode !== 'number' ||
        !Number.isFinite(d.exitCode) ||
        result.content.some((b) => b.type !== 'text')
      )
        return fallback();
      const warnings = [
        'Observed Zoom state applies to the returned session; unknown values are not readiness evidence.',
      ];
      if (options.isPartial) warnings.push('Output is still streaming; results are not final.');
      if (options.expanded) {
        const sections: Section[] = [
          scope(input),
          { kind: 'code', title: 'Complete Zoom evidence', text: JSON.stringify(d, null, 2) },
        ];
        for (const block of result.content) {
          if (!block.text) continue;
          try {
            if (isDeepStrictEqual(JSON.parse(block.text), d)) continue;
          } catch {
            /* Preserve opaque corrective guidance. */
          }
          sections.push({ kind: 'code', title: 'Additional Zoom output', text: block.text });
        }
        return { summary: summary(d, result.isError), sections, warnings, expandedEvidence: 'provided' as const };
      }
      const sections: Section[] = [scope(input), outcome(d)];
      const awareness = record(d.awareness);
      if (Object.keys(awareness).length)
        sections.push(
          fields('Observed meeting state', {
            Meeting: known(awareness.meeting),
            'Meeting ID': known(awareness.meeting_id),
            Audio: known(awareness.audio),
            Video: known(awareness.video),
            Sharing: known(awareness.share),
            Hand: known(awareness.hand),
          }),
        );
      const camera = record(d.terminal_camera);
      if (Object.keys(camera).length)
        sections.push(fields('Terminal camera', { Ready: known(camera.ready), Guidance: known(camera.error) }));
      const remaining = Object.fromEntries(
        Object.entries(d).filter(
          ([key]) =>
            ![
              'exitCode',
              'session',
              'control',
              'changed',
              'verified',
              'awareness',
              'terminal_camera',
              'evidence',
            ].includes(key),
        ),
      );
      sections.push(...p.data(remaining));
      const evidence = record(d.evidence);
      const items = record(evidence.accessibility).items;
      if (Array.isArray(items) && items.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
        sections.push({
          kind: 'table',
          title: 'Accessibility observations',
          rows: items,
          previewRows: 12,
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'role', label: 'Role' },
            { key: 'pid', label: 'PID' },
            { key: 'checked', label: 'Checked' },
          ],
        });
      }
      return { summary: summary(d, result.isError), sections, warnings, expandedEvidence: 'provided' as const };
    },
  });
}
