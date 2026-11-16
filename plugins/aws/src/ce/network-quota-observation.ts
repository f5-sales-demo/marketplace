import { createHash } from 'node:crypto';
import { type AwsExecApi, type AwsExecError, detectAwsError } from '../aws/exec';

type Json = Record<string, unknown>;
export interface AwsNetworkQuotaFailure {
  kind: 'command-failed' | 'invalid-response';
  retryable: boolean;
  detailSha256: string;
}
export interface AwsNetworkQuotaObservation {
  serviceCode: string;
  quotas: Json[];
  ok: boolean;
  attempts: number;
  failure?: AwsNetworkQuotaFailure;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const transient = (error: AwsExecError) =>
  error.name === 'AwsThrottlingError' ||
  (error.name === 'AwsExecError' &&
    /requesttimeout|serviceunavailable|internalerror|internalfailure|connection (?:reset|closed|was closed)|(?:connect|read) timeout on endpoint|could not connect to the endpoint|endpointconnectionerror/i.test(
      error.message,
    ));

/** Retry only transient reads; persistent, unauthorized and incomplete evidence remains unavailable. */
export async function observeAwsNetworkQuotas(
  api: AwsExecApi,
  serviceCode: string,
  region: string,
  options: { pause?: (milliseconds: number) => Promise<void> } = {},
): Promise<AwsNetworkQuotaObservation> {
  if (!['ec2', 'vpc', 'elasticloadbalancing'].includes(serviceCode) || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region))
    throw new Error('Resolved network quota service and region required');
  const pause = options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempts = 1; attempts <= 3; attempts++) {
    let raw: Awaited<ReturnType<AwsExecApi['exec']>>;
    try {
      raw = await api.exec('aws', [
        'service-quotas',
        'list-service-quotas',
        '--service-code',
        serviceCode,
        '--region',
        region,
        '--output',
        'json',
      ]);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      // Thrown transport failures carry no authoritative result and are retained as unavailable.
      return {
        serviceCode,
        quotas: [],
        ok: false,
        attempts,
        failure: { kind: 'command-failed', retryable: false, detailSha256: digest(String(error)) },
      };
    }
    if (raw.exitCode !== 0) {
      const retryable = transient(detectAwsError(raw.stderr, raw.exitCode));
      if (retryable && attempts < 3) {
        await pause(200 * attempts);
        continue;
      }
      return {
        serviceCode,
        quotas: [],
        ok: false,
        attempts,
        failure: { kind: 'command-failed', retryable, detailSha256: digest(raw.stderr) },
      };
    }
    let data: unknown;
    try {
      data = JSON.parse(raw.stdout);
    } catch {
      data = undefined;
    }
    if (
      !object(data) ||
      ['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(data, key)) ||
      !Array.isArray(data.Quotas) ||
      !data.Quotas.every(
        (row) =>
          object(row) &&
          typeof row.QuotaCode === 'string' &&
          !!row.QuotaCode.trim() &&
          typeof row.QuotaName === 'string' &&
          !!row.QuotaName.trim() &&
          typeof row.Value === 'number' &&
          Number.isFinite(row.Value) &&
          (row.ServiceCode === undefined || row.ServiceCode === serviceCode),
      )
    )
      return {
        serviceCode,
        quotas: [],
        ok: false,
        attempts,
        failure: { kind: 'invalid-response', retryable: false, detailSha256: digest(raw.stdout) },
      };
    return { serviceCode, quotas: data.Quotas as Json[], ok: true, attempts };
  }
  throw new Error('Network quota read exhausted without a result');
}
