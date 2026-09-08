import { sha256Hex } from './canonical';

/** AWS CLI decodes EC2 Output to plain text. Console evidence is historical and never proves CE health. */
export function summarizeAwsConsoleOutput(
  result: { exitCode: number; stdout: string; stderr: string },
  instanceId: string,
  observedAt = new Date().toISOString(),
) {
  const base = { instanceId, source: 'aws:ec2:get-console-output', observedAt, scope: 'console-signals-only' };
  const unknown = { ...base, ok: false, cloudInitFinished: null, errorsDetected: null, warningsDetected: null };
  if (result.exitCode !== 0) return { ...unknown, reason: 'console-unavailable' };
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    return { ...unknown, reason: 'malformed-console-response' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ...unknown, reason: 'malformed-console-response' };
  const value = raw as Record<string, unknown>;
  const timestamp =
    typeof value.Timestamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.Timestamp)
      ? Date.parse(value.Timestamp)
      : Number.NaN;
  const now = Date.parse(observedAt);
  if (
    value.InstanceId !== instanceId ||
    typeof value.Output !== 'string' ||
    !value.Output.trim() ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(now) ||
    timestamp > now + 5000
  )
    return { ...unknown, reason: 'console-identity-time-or-output-unavailable' };
  const lines = value.Output.split(/\r?\n/);
  return {
    ...base,
    ok: true,
    timestamp: value.Timestamp,
    ageSeconds: Math.max(0, (now - timestamp) / 1000),
    bytes: Buffer.byteLength(value.Output),
    digest: sha256Hex(value.Output),
    cloudInitFinished: lines.some((line) => /cloud-init\b.*\bfinished at\b/i.test(line)),
    warningsDetected: lines.some((line) => /\bWARNING\b|\[WARN\]/i.test(line)),
    errorsDetected: lines.some(
      (line) =>
        /failed to run module\b|running module\b.*\bfailed\b|failed to start\b.*\bcloud-init\b/i.test(line) ||
        (/\bERROR\b|\bCRITICAL\b/.test(line) && /cloud-init\b|\b(?:cc_\w+|util|stages|schema)\.py\b/i.test(line)),
    ),
  };
}
