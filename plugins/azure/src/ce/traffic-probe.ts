import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { type AzExecApi, detectAzError } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { observeAzureTrafficSource } from './traffic-source';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure traffic evidence');
  return value as Json;
}

async function optional(storage: Pick<CeDeploymentStore, 'read'>, name: string): Promise<Json | undefined> {
  try {
    return object(await storage.read(name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Execute a content-bound HTTP GET from one explicitly reviewed Azure VM. */
export async function collectAzureTrafficProbe(
  plan: AzureCePlan,
  storage: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
  checkpointKey = 'azure-traffic-probe',
) {
  verifyAzureCePlan(plan);
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure traffic probe requires explicit platform HTTP ingress');
  await storage.verify();
  const source = await observeAzureTrafficSource(plan, api, signal);
  const probe = plan.intent.ingress.probe;
  const listener = plan.intent.ingress.listener;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(checkpointKey))
    throw new Error('Invalid Azure traffic probe checkpoint identity');
  const file = `${checkpointKey}.json`;
  let state = await optional(storage, file);
  if (state) {
    const attempts = state.attempts;
    if (
      state.schemaVersion !== 1 ||
      state.engine !== plan.engine ||
      state.planSha256 !== plan.planSha256 ||
      state.sourceVmResourceId !== source.resourceId ||
      state.sourceVmId !== source.vmId ||
      state.sourceNicResourceId !== source.nicResourceId ||
      state.sourcePrivateAddress !== source.privateAddress ||
      !['ready', 'complete'].includes(String(state.phase)) ||
      (attempts !== undefined &&
        (!Array.isArray(attempts) ||
          attempts.some(
            (attempt) =>
              !attempt ||
              typeof attempt !== 'object' ||
              typeof (attempt as Json).observedAt !== 'string' ||
              !Number.isFinite(Date.parse(String((attempt as Json).observedAt))),
          )))
    )
      throw new Error('Azure traffic probe checkpoint differs from the owning plan');
    if (state.phase === 'complete') {
      const evidence = object(state.evidence);
      if (
        evidence.status !== 'healthy' ||
        evidence.source !== 'azure:vm-run-command' ||
        evidence.sourceVmResourceId !== source.resourceId ||
        evidence.sourceVmId !== source.vmId ||
        evidence.sourcePrivateAddress !== source.privateAddress ||
        evidence.httpStatus !== probe.expectedStatus ||
        evidence.bodySha256 !== probe.expectedBodySha256 ||
        evidence.expectedStatus !== probe.expectedStatus ||
        evidence.expectedBodySha256 !== probe.expectedBodySha256 ||
        typeof evidence.observedAt !== 'string' ||
        !Number.isFinite(Date.parse(evidence.observedAt))
      )
        throw new Error('Persisted Azure traffic evidence differs from the owning plan');
      return evidence;
    }
  } else {
    state = {
      schemaVersion: 1,
      engine: plan.engine,
      planSha256: plan.planSha256,
      sourceVmResourceId: source.resourceId,
      sourceVmId: source.vmId,
      sourceNicResourceId: source.nicResourceId,
      sourcePrivateAddress: source.privateAddress,
      phase: 'ready',
    };
    await storage.write(file, state);
  }

  const expectedDigest = probe.expectedBodySha256;
  const command =
    `body=$(mktemp); trap 'rm -f "$body"' EXIT; ` +
    `code=$(curl --silent --show-error --max-time 15 --output "$body" --write-out '%{http_code}' ` +
    `--header 'Host: ${listener.domain}' ` +
    `'http://${listener.privateAddress}:${plan.intent.ingress.port}${probe.path}'); ` +
    `digest=$(sha256sum "$body" | awk '{print $1}'); printf '%s %s\n' "$code" "$digest"; ` +
    `[ "$code" = "${probe.expectedStatus}" ] && [ "$digest" = "${expectedDigest}" ]`;
  const result = await api.exec(
    'az',
    [
      'vm',
      'run-command',
      'invoke',
      '--ids',
      source.resourceId,
      '--command-id',
      'RunShellScript',
      '--scripts',
      command,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  let response: Json;
  try {
    response = object(JSON.parse(result.stdout));
  } catch {
    throw new Error('Malformed Azure traffic probe response');
  }
  const rows = Array.isArray(response.value)
    ? response.value.map((value) => object(value))
    : (() => {
        throw new Error('Malformed Azure traffic probe response');
      })();
  const stdoutRows = rows.filter((row) => row.code === 'ComponentStatus/StdOut/succeeded');
  const stderrRows = rows.filter((row) => row.code === 'ComponentStatus/StdErr/succeeded');
  if (
    stdoutRows.length !== 1 ||
    stderrRows.length !== 1 ||
    typeof stdoutRows[0].message !== 'string' ||
    typeof stderrRows[0].message !== 'string'
  )
    throw new Error('Malformed Azure traffic probe response');
  const match = /^(\d{3}) ([a-f0-9]{64})\n?$/.exec(stdoutRows[0].message);
  const evidence = {
    status: stderrRows[0].message === '' && match ? ('healthy' as const) : ('degraded' as const),
    source: 'azure:vm-run-command' as const,
    sourceVmResourceId: source.resourceId,
    sourceVmId: source.vmId,
    sourcePrivateAddress: source.privateAddress,
    httpStatus: match ? Number(match[1]) : undefined,
    bodySha256: match?.[2],
    expectedStatus: probe.expectedStatus,
    expectedBodySha256: probe.expectedBodySha256,
    observedAt: new Date().toISOString(),
  };
  if (
    evidence.status !== 'healthy' ||
    evidence.httpStatus !== probe.expectedStatus ||
    evidence.bodySha256 !== probe.expectedBodySha256
  ) {
    const attempts = Array.isArray(state.attempts) ? state.attempts.map(object) : [];
    attempts.push({
      httpStatus: evidence.httpStatus,
      bodySha256: evidence.bodySha256,
      stderrPresent: stderrRows[0].message.length > 0,
      observedAt: evidence.observedAt,
    });
    await storage.write(file, { ...state, phase: 'ready', attempts: attempts.slice(-40) });
    throw new Error('Azure traffic probe has not converged; retry the saved checkpoint');
  }
  await storage.write(file, { ...state, phase: 'complete', evidence });
  return evidence;
}
