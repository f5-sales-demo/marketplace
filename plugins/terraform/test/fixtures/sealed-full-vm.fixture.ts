/** Actual baseline/callback/cloud-reader issuers; completed HTTP/UI/provider records below are explicitly simulated. */
import { createHash } from 'node:crypto';
import { GoogleHttpRpcTraceParser } from '../../src/gcp-http-rpc-trace';
import { inspectOriginalGcpInsertBodies, joinOriginalGcpInsertSource } from '../../src/gcp-insert-evidence';
import type { OriginalGcpVmJoinInput } from '../../src/gcp-vm-evidence';
import type { EarlyVmFixtureInput } from './early-gcp-vm.fixture';
import { scope, sourceJoinFixture, traceFixture } from './gcp-insert.fixture';

const binding = {
  terraformVersion: '1.17.2',
  providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
};
export async function fullVmFixture(input: EarlyVmFixtureInput) {
  const { identity, callback, reader } = input;
  const template = sourceJoinFixture(binding, '8.11.0');
  const parser = new GoogleHttpRpcTraceParser(
    {
      ...scope,
      planSha256: identity.planSha256,
      url: `https://compute.googleapis.com/compute/v1/projects/${identity.project}/zones/${identity.zone}/instances?alt=json`,
    },
    binding,
  );
  const [response] = parser.push(
    Buffer.from(
      traceFixture(
        input.state.request as unknown as Parameters<typeof traceFixture>[0],
        input.state.operation as unknown as Parameters<typeof traceFixture>[1],
        '8.11.0',
      ).replaceAll('us-central1-a', identity.zone),
    ),
  );
  parser.finish();
  const insert = inspectOriginalGcpInsertBodies(parser.consumeBodies(response), binding);
  const configuration = JSON.stringify({
    provider: {
      google: [
        { project: identity.project, region: callback.original.owner.region, request_reason: scope.requestReason },
      ],
    },
    resource: {
      google_compute_instance: {
        [identity.address.split('.')[1]]: {
          name: identity.nodeName,
          project: identity.project,
          zone: identity.zone,
          labels: input.state.request.labels,
          can_ip_forward: true,
          machine_type: 'e2-standard-8',
        },
      },
    },
  });
  const parent = callback.execution.identity;
  const observation = template.window.observations[0];
  const started = { ...template.started, address: identity.address, planSha256: identity.planSha256 };
  const source = joinOriginalGcpInsertSource({
    ...template,
    insert,
    configuration,
    parent,
    plan: {
      ...template.plan,
      deploymentId: callback.original.owner.deploymentId,
      planSha256: identity.planSha256,
      configurationSha256: createHash('sha256').update(configuration).digest('hex'),
      changes: [{ address: identity.address, type: 'google_compute_instance', actions: ['create'] }],
    },
    started,
    completed: {
      ...template.completed,
      address: identity.address,
      planSha256: identity.planSha256,
      idValue: `projects/${identity.project}/zones/${identity.zone}/instances/${identity.nodeName}`,
    },
    rpc: {
      ...template.rpc,
      planSha256: identity.planSha256,
      receivedRecordSha256: insert.receivedRecordSha256,
      servedRecordSha256: insert.servedRecordSha256,
    },
    window: {
      ...template.window,
      schemaVersion: 4,
      kind: 'original-provider-stderr-verified-window',
      executor: parent,
      observations: [
        {
          ...observation,
          candidate: { ...observation.candidate, parent: parent.pid, group: parent.group, boot: parent.boot },
        },
      ],
    },
  });
  const operation = await reader.insertOperation(identity.zone, identity.operationName, identity.nodeName);
  const instance = await reader.instance(identity.zone, identity.nodeName);
  if (!instance.present) throw new Error('Original fixture VM required');
  return {
    source,
    reader,
    operation,
    instance,
    baseline: input.baseline,
    callback,
  } as unknown as OriginalGcpVmJoinInput;
}
