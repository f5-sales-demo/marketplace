import { decodeEvidenceObject } from './evidence-json';
import { readOriginalGoogleHttpRpcSource } from './gcp-http-rpc-trace';
import {
  collectOriginalGcpInsertWitnesses,
  inspectOriginalGcpInsertBodies,
  readOriginalGcpInsertWitnesses,
} from './gcp-insert-evidence';
import type { openInstalledApplyTraceStage } from './installed-apply-trace-stage';
import type { InstalledProviderWindow } from './installed-provider-reader';

type Transcript = Awaited<ReturnType<Awaited<ReturnType<typeof openInstalledApplyTraceStage>>['readTranscript']>>;
type Input = Pick<
  Transcript,
  'originalPlan' | 'binding' | 'configuration' | 'providerPath' | 'targets' | 'hooks' | 'rpcs' | 'bodies'
> & { readonly windows: readonly InstalledProviderWindow[] };

/** CE-only source composition. Each selected body, UI hook, RPC and window must
 * come from the same actual plan and descriptor issuers. Observer, audit, VM,
 * bootstrap and operational acceptance remain independent gates. */
export async function collectInstalledCeInsertWitnesses(input: Input) {
  const targets = Object.freeze(input.targets.map((target) => Object.freeze({ ...target })));
  const bodies = Object.freeze([...input.bodies]);
  const hooks = Object.freeze([...input.hooks]);
  const rpcs = Object.freeze([...input.rpcs]);
  const windows = Object.freeze([...input.windows]);
  if (
    !targets.length ||
    new Set(targets.map((target) => target.address)).size !== targets.length ||
    new Set(targets.map((target) => `${target.project}/${target.zone}/${target.name}`)).size !== targets.length
  )
    throw new Error('Unique original CE witness targets required');

  const originalBodies = [];
  // These assertions share one descriptor issuer and must remain sequential.
  for (const body of bodies) {
    await readOriginalGoogleHttpRpcSource(body);
    originalBodies.push({ body, request: decodeEvidenceObject(Buffer.from(body.requestBody)) });
  }
  const results = [];
  for (const target of targets) {
    const matching = originalBodies.filter(
      ({ body, request }) =>
        request.name === target.name &&
        body.rpc === 'ApplyResourceChange' &&
        body.resourceType === 'google_compute_instance' &&
        body.method === 'POST' &&
        body.url ===
          `https://compute.googleapis.com/compute/v1/projects/${target.project}/zones/${target.zone}/instances?alt=json`,
    );
    if (matching.length !== 1) throw new Error('Unique original CE insert body required');
    const body = matching[0].body;
    const insert = inspectOriginalGcpInsertBodies(body, input.binding);
    const starts = hooks.filter((hook) => hook.address === target.address && hook.phase === 'apply_start');
    const completions = hooks.filter((hook) => hook.address === target.address && hook.phase === 'apply_complete');
    const matchingRpcs = rpcs.filter(
      (rpc) =>
        rpc.rpcRequestId === insert.rpcRequestId &&
        rpc.rpc === 'ApplyResourceChange' &&
        rpc.resourceType === 'google_compute_instance',
    );
    if (starts.length !== 1 || completions.length !== 1 || matchingRpcs.length !== 1)
      throw new Error('Unique original CE UI and RPC sources required');
    const rpc = matchingRpcs[0];
    const candidate = await collectOriginalGcpInsertWitnesses({
      originalPlan: input.originalPlan,
      configuration: input.configuration,
      providerPath: input.providerPath,
      binding: input.binding,
      insert,
      started: starts[0],
      completed: completions[0],
      rpc,
      windows: windows.filter((window) => window.observations.some((row) => row.candidate.pid === rpc.providerPid)),
    });
    const witnesses = await readOriginalGcpInsertWitnesses(candidate);
    if (
      candidate.resourceAddress !== target.address ||
      candidate.project !== target.project ||
      candidate.zone !== target.zone ||
      candidate.nodeName !== target.name
    )
      throw new Error('Original CE target and witnessed insertion differ');
    results.push(Object.freeze({ target, candidate, witnesses }));
  }
  return Object.freeze(results);
}
