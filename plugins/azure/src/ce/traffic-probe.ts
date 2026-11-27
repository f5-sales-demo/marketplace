import { randomUUID } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { type AzExecApi, detectAzError } from '../az/exec';
import { guardAzureCeApplyObject } from './apply-request';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { validateAzureTrafficCheckpoint } from './traffic-artifact-provenance';
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
    const evidence = validateAzureTrafficCheckpoint(plan, state);
    if (canonicalSha256(state.sourceIdentity) !== canonicalSha256(source.identity))
      throw new Error('Azure traffic probe checkpoint source attachment differs from current identity');
    if (evidence) return evidence;
  } else {
    state = {
      schemaVersion: 2,
      engine: plan.engine,
      planSha256: plan.planSha256,
      sourceVmResourceId: source.resourceId,
      sourceVmId: source.vmId,
      sourceNicResourceId: source.nicResourceId,
      sourcePrivateAddress: source.privateAddress,
      sourceIdentity: source.identity,
      sourceObservedAt: source.observedAt,
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
  signal?.throwIfAborted();
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
    const pending = { ...state, phase: 'ready', attempts: attempts.slice(-40) };
    validateAzureTrafficCheckpoint(plan, pending);
    await storage.write(file, pending);
    throw new Error('Azure traffic probe has not converged; retry the saved checkpoint');
  }
  const complete = { ...state, phase: 'complete', evidence };
  validateAzureTrafficCheckpoint(plan, complete);
  await storage.write(file, complete);
  return evidence;
}

/** Collect a new reviewed VM HTTP/content sample, retaining older resumable probe history.
 * A per-invocation guest challenge rejects replay of an earlier Run Command response.
 * The local interval describes this probe invocation; it is never a CE publication heartbeat.
 */
export async function collectAzureCurrentTrafficProbe(
  request: AzureCePlan,
  storage: CeDeploymentStore,
  transport: AzExecApi,
  signal?: AbortSignal,
) {
  verifyAzureCePlan(request);
  const plan = structuredClone(request),
    requestSha256 = canonicalSha256(request),
    ownerSha256 = canonicalSha256(storage.owner),
    environmentSha256 = canonicalSha256(process.env),
    directory = storage.directory,
    deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
    startedAt = new Date().toISOString(),
    sampleId = randomUUID(),
    marker = `xcsh-current-traffic:${sampleId}`,
    key = `traffic-${sampleId}`;
  const seal = () => {
    deadline.throwIfAborted();
    if (
      canonicalSha256(request) !== requestSha256 ||
      canonicalSha256(plan) !== requestSha256 ||
      canonicalSha256(storage.owner) !== ownerSha256 ||
      storage.directory !== directory ||
      canonicalSha256(process.env) !== environmentSha256
    )
      throw Error('Azure current traffic request or owner changed during collection');
  };
  if (
    ownerSha256 !==
    canonicalSha256({
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    })
  )
    throw Error('Azure current traffic requires the exact deployment owner');
  const store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']),
    api = guardAzureCeApplyObject(transport, seal);
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), aborted.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const boundedApi: AzExecApi = { exec: (command, args, options) => bounded(() => api.exec(command, args, options)) };
  let invocations = 0;
  const challengedApi: AzExecApi = {
    exec: async (command, args, options) => {
      seal();
      if (command !== 'az' || args[0] !== 'vm' || args[1] !== 'run-command')
        return boundedApi.exec(command, args, options);
      if (++invocations !== 1) throw Error('Azure current traffic sample must execute exactly one reviewed probe');
      const index = args.indexOf('--scripts') + 1;
      if (index === 0 || typeof args[index] !== 'string') throw Error('Azure current traffic probe command is missing');
      const challenged = [...args];
      challenged[index] += `; probe_status=$?; printf '\n%s\n' '${marker}'; exit "$probe_status"`;
      const raw = await boundedApi.exec(command, challenged, options);
      seal();
      if (raw.exitCode !== 0) return raw;
      let response: Json;
      try {
        response = object(JSON.parse(raw.stdout));
      } catch {
        throw Error('Malformed Azure current traffic response');
      }
      if (!Array.isArray(response.value)) throw Error('Malformed Azure current traffic response');
      const rows = response.value.map(object),
        stdout = rows.filter((row) => row.code === 'ComponentStatus/StdOut/succeeded');
      const match =
        stdout.length === 1 && typeof stdout[0].message === 'string'
          ? new RegExp(`^(\\d{3}) ([a-f0-9]{64})\\n?\\n${marker}\\n?$`).exec(stdout[0].message)
          : null;
      if (!match) throw Error('Azure current traffic response does not match this guest challenge');
      stdout[0].message = `${match[1]} ${match[2]}\n`;
      return { ...raw, stdout: JSON.stringify(response) };
    },
  };
  const evidence = await collectAzureTrafficProbe(plan, store, challengedApi, deadline, key);
  seal();
  if (invocations !== 1) throw Error('Azure current traffic cannot use a completed historical checkpoint');
  const checkpoint = object(await store.read(`${key}.json`));
  if (canonicalSha256(validateAzureTrafficCheckpoint(plan, checkpoint)) !== canonicalSha256(evidence))
    throw Error('Azure current traffic checkpoint differs from collected evidence');
  const currentSource = await observeAzureTrafficSource(plan, boundedApi, deadline);
  if (canonicalSha256(checkpoint.sourceIdentity) !== canonicalSha256(currentSource.identity))
    throw Error('Azure current traffic source changed during collection');
  seal();
  const completedAt = new Date().toISOString();
  if (
    !Number.isFinite(Date.parse(startedAt)) ||
    !Number.isFinite(Date.parse(completedAt)) ||
    Date.parse(completedAt) < Date.parse(startedAt) ||
    Date.parse(completedAt) - Date.parse(startedAt) > 180000
  )
    throw Error('Azure current traffic collection interval is invalid');
  const receipt = {
    schemaVersion: 1,
    status: 'healthy' as const,
    scope: 'reviewed-vm-http-content-probe' as const,
    sampleId,
    planSha256: plan.planSha256,
    owner: structuredClone(store.owner),
    checkpointKey: key,
    checkpointSha256: canonicalSha256(checkpoint),
    sourceIdentitySha256: canonicalSha256(currentSource.identity),
    startedAt,
    completedAt,
    evidence,
  };
  const name = `${key}-current-sample.json`;
  await store.write(name, receipt);
  seal();
  if (
    canonicalSha256(await store.read(name)) !== canonicalSha256(receipt) ||
    canonicalSha256(await store.read(`${key}.json`)) !== receipt.checkpointSha256
  )
    throw Error('Azure current traffic sample changed during publication');
  seal();
  return receipt;
}
