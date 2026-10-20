type Json = Record<string, unknown>;
const defaultFormat =
  'version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status';

/** Interpret existing Flow Logs without returning addresses or raw log messages. */
export function interpretFlowLogEvents(
  response: Json,
  scope: { accountId: string; interfaceIds: string[]; start: number; end: number },
  logFormat?: string,
) {
  if (!Array.isArray(response.events) || response.events.length > 100 || Object.hasOwn(response, 'nextToken'))
    throw new Error('Missing or partial Flow Log events');
  const fields =
    logFormat === undefined
      ? defaultFormat.split(' ')
      : logFormat
          .trim()
          .split(/\s+/)
          .map((field) => {
            const match = /^\$\{([a-z-]+)\}$/.exec(field);
            if (!match) throw new Error('Unsupported Flow Log format');
            return match[1];
          });
  if (
    new Set(fields).size !== fields.length ||
    ['account-id', 'interface-id', 'start', 'end', 'action', 'log-status'].some((field) => !fields.includes(field))
  )
    throw new Error('Flow Log format lacks resource or freshness identity');
  const interfaces = new Set(scope.interfaceIds);
  let accepted = 0,
    rejected = 0,
    unavailable = 0;
  for (const value of response.events) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Flow Log event');
    const event = value as Json;
    if (
      typeof event.timestamp !== 'number' ||
      !Number.isFinite(event.timestamp) ||
      event.timestamp < scope.start ||
      event.timestamp > scope.end ||
      typeof event.message !== 'string'
    )
      throw new Error('Stale or malformed Flow Log event');
    const values = event.message.trim().split(/\s+/);
    if (values.length !== fields.length) throw new Error('Flow Log record format differs');
    const record = Object.fromEntries(fields.map((field, index) => [field, values[index]]));
    if (record['account-id'] !== scope.accountId || !interfaces.has(record['interface-id']))
      throw new Error('Flow Log record scope differs');
    if (['NODATA', 'SKIPDATA'].includes(record['log-status'])) {
      unavailable++;
      continue;
    }
    const start = Number(record.start) * 1000,
      end = Number(record.end) * 1000;
    if (
      record['log-status'] !== 'OK' ||
      !/^\d+$/.test(record.start) ||
      !/^\d+$/.test(record.end) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < scope.start ||
      end > scope.end ||
      start > end ||
      !['ACCEPT', 'REJECT'].includes(record.action)
    )
      throw new Error('Invalid Flow Log sample');
    if (record.action === 'ACCEPT') accepted++;
    else rejected++;
  }
  return {
    status:
      unavailable || accepted + rejected === 0 ? 'unknown' : rejected ? 'rejections-observed' : 'accepts-observed',
    accepted,
    rejected,
    unavailable,
    canSatisfyTrafficGate: false,
    window: { start: new Date(scope.start).toISOString(), end: new Date(scope.end).toISOString() },
    maxEvents: 100,
  };
}
