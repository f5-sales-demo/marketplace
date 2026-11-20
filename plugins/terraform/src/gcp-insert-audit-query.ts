/** Fixed Admin Activity read scope. This query grants no execution authority. */
export interface GcpInsertAuditWindow {
  readonly after: string;
  readonly before: string;
}
const resourceName = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export function compileGcpInsertAuditQuery(project: string, zone: string, node: string, input: GcpInsertAuditWindow) {
  const window = { ...input };
  if (
    !resourceName.test(project) ||
    !resourceName.test(zone) ||
    !resourceName.test(node) ||
    Object.keys(window).sort().join(',') !== 'after,before' ||
    ![window.after, window.before].every(
      (value) =>
        typeof value === 'string' &&
        /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString() === value,
    ) ||
    Date.parse(window.after) < 0 ||
    Date.parse(window.before) <= Date.parse(window.after) ||
    Date.parse(window.before) - Date.parse(window.after) > 7200000
  )
    throw new Error('Fixed original Compute insert audit window required');
  const logName = `projects/${project}/logs/cloudaudit.googleapis.com%2Factivity`;
  const resource = `projects/${project}/zones/${zone}/instances/${node}`;
  const filter = [
    `logName=${JSON.stringify(logName)}`,
    'protoPayload.serviceName="compute.googleapis.com"',
    'protoPayload.methodName="v1.compute.instances.insert"',
    `protoPayload.resourceName=${JSON.stringify(resource)}`,
    `timestamp>=${JSON.stringify(window.after)}`,
    `timestamp<=${JSON.stringify(window.before)}`,
  ].join(' AND ');
  return Object.freeze({
    resourceNames: Object.freeze([`projects/${project}`]),
    filter,
    pageSize: 100,
    orderBy: 'timestamp asc' as const,
  });
}

export function hasAuditControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}
