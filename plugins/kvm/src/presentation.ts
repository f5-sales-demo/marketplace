import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { controllerArgv, KVM_SMSV2_PROTOCOL } from './tools';

type Section = ReturnType<PresentationAPI['data']>[number];
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const value = (v: unknown) => (v === undefined || v === null ? 'unknown' : v);
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});

/** Domain data only; xcsh owns layout, commands, expansion, themes and lifecycle. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const action = tool.name.replace('kvm_smsv2_', '');
  const effective = (input: unknown) => (['deploy', 'reconcile'].includes(action) ? record(input) : {});
  const scope = (input: unknown): Section[] => {
    const args = effective(input);
    return Object.keys(args).length ? [fields(args, 'Requested scope')] : [];
  };
  const table = (rows: unknown, title: string): Section[] => {
    if (rows !== null && typeof rows === 'object' && !Array.isArray(rows)) {
      return [
        {
          kind: 'table',
          title,
          previewRows: 12,
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'state', label: 'State' },
          ],
          rows: Object.entries(rows).map(([name, state]) => ({ name, state })),
        },
      ];
    }
    if (!Array.isArray(rows) || !rows.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r))) return [];
    return [
      {
        kind: 'table',
        title,
        previewRows: 12,
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'state', label: 'State' },
          { key: 'owned', label: 'Owned' },
        ],
        rows,
      },
    ];
  };
  return p.withPresentation(tool, {
    call(input: unknown) {
      return {
        summary: tool.label ?? tool.name,
        sections: [...scope(input), p.command(controllerArgv(action, effective(input)), 'Controller command')],
      };
    },
    result(
      result: { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean },
      options: { expanded: boolean; isPartial: boolean },
      input: unknown,
    ) {
      const d = record(result.details);
      const fallback = () => ({
        sections: [
          ...scope(input),
          ...(result.details === undefined ? [] : p.data(result.details)),
          ...result.content
            .filter((b) => b.type === 'text')
            .map((b) => ({ kind: 'code' as const, title: 'Complete operator guidance', text: b.text ?? '' })),
        ],
      });
      if (
        d.schemaVersion !== KVM_SMSV2_PROTOCOL ||
        d.action !== action ||
        typeof d.controllerVersion !== 'string' ||
        typeof d.ok !== 'boolean' ||
        (result.isError === true && d.ok) ||
        result.content.some((b) => b.type !== 'text')
      )
        return fallback();
      if (
        (!d.ok && typeof d.error !== 'string') ||
        (d.ok && (d.result === null || typeof d.result !== 'object' || Array.isArray(d.result)))
      )
        return fallback();
      const texts: Section[] = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code',
          title: result.isError || !d.ok ? 'Complete corrective guidance' : 'Complete operator guidance',
          text: b.text ?? '',
        }));
      let summary = `KVM ${action} failed; corrective action required`;
      let sections: Section[] = [
        fields(
          { Action: action, OK: d.ok, 'Controller version': d.controllerVersion, Error: value(d.error) },
          'Controller outcome',
        ),
      ];
      if (d.ok) {
        const r = record(d.result);
        if (action === 'readiness') {
          const c = record(r.checks);
          const capacity = record(c.capacity);
          const lan = record(c.lan);
          summary =
            r.state === 'ready'
              ? 'KVM host ready'
              : r.state === 'setup_required'
                ? 'KVM host requires setup'
                : 'KVM host readiness unknown';
          sections = [
            fields(
              {
                State: value(r.state),
                'Core ready': value(c.coreReady),
                'Platform supported': value(c.platform),
                'Bridge ready': value(lan.bridgeReady),
                'LAN guidance': value(lan.gap),
                'CPU count': value(capacity.cpu),
                'Memory (GiB)': value(capacity.memoryGiB),
                'Free disk (GiB)': value(capacity.diskFreeGiB),
                'Capacity ready': value(capacity.ready),
                'Storage available': value(capacity.storageAvailable),
                'Storage root': value(capacity.storageRoot),
              },
              'Host readiness',
            ),
          ];
          const flattenChecks = (prefix: string, item: unknown): { check: string; ready: unknown }[] => {
            const entries = Object.entries(record(item));
            return entries.length
              ? entries.flatMap(([key, child]) => flattenChecks(`${prefix}.${key}`, child))
              : [{ check: prefix, ready: value(item) }];
          };
          const checkRows = Object.entries(c)
            .filter(([key]) => !['capacity', 'lan'].includes(key))
            .flatMap(([key, item]) => flattenChecks(key, item));
          if (checkRows.length)
            sections.push({
              kind: 'table',
              title: 'Readiness checks',
              columns: [
                { key: 'check', label: 'Check' },
                { key: 'ready', label: 'Ready' },
              ],
              rows: checkRows,
              previewRows: 12,
            });
        } else {
          const status = ['deploy', 'reconcile'].includes(action) ? record(r.status) : r;
          const traffic = record(status.traffic);
          if (action === 'destroy' || status.destroyed === true) {
            const remaining = Array.isArray(status.remainingOwned) ? status.remainingOwned : undefined;
            summary =
              remaining?.length === 0 && status.bridgeRestored === true
                ? 'KVM owned resources removed'
                : 'KVM removal requires review';
            sections = [
              fields(
                {
                  'Site name': value(status.siteName),
                  'Remaining owned count': remaining?.length ?? 'unknown',
                  'Bridge restored': value(status.bridgeRestored),
                  Destroyed: value(status.destroyed),
                },
                'Removal outcome',
              ),
              ...table(remaining, 'Remaining owned resources'),
            ];
          } else {
            summary =
              status.accepted === true
                ? 'KVM deployment accepted'
                : status.accepted === false
                  ? 'KVM deployment requires review'
                  : 'KVM acceptance unknown';
            sections = [
              fields(
                {
                  'Site name': value(status.siteName),
                  Accepted: value(status.accepted),
                  'Zero change': value(status.zeroChange),
                  'Traffic samples': value(traffic.samples),
                  'Successful samples': value(traffic.successes),
                },
                'Deployment outcome',
              ),
              ...table(status.domains, 'Domains'),
            ];
            const site = record(status.site);
            const lan = record(status.lan);
            const images = record(status.images);
            const registration = record(status.registration);
            const host = record(status.host);
            const application = record(status.application);
            sections.push(
              fields(
                {
                  'Site state': value(site.state),
                  'Site error count': value(site.errorCount),
                  'Registration count': value(registration.count),
                  'Online registration count': value(registration.onlineCount),
                  'CE identity ready': value(host.ceIdentityReady),
                  'Inside identity ready': value(host.sliIdentityReady),
                  'Workload identity ready': value(host.workloadIdentityReady),
                  'Bridge ready': value(lan.bridgeReady),
                  'Local HTTP ready': value(lan.localHttp),
                  'Origin owned': value(record(application.origin).owned),
                  'HTTP LB owned': value(record(application.httpLb).owned),
                  'LAN conflict free': value(lan.conflictFree),
                  'Static inside address': value(lan.sliStatic),
                  'Images verified': value(images.verified),
                },
                'Acceptance evidence',
              ),
            );
          }
        }
      }
      if (options.isPartial) summary = `KVM ${action} in progress; outcome pending`;
      return {
        summary,
        expandedEvidence: 'provided' as const,
        sections: options.expanded
          ? [...p.data(d, 'Complete safe evidence'), ...texts]
          : [...scope(input), ...sections, ...texts],
      };
    },
  });
}
