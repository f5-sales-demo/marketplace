/** Original plan, callback, descriptor and cloud-reader issuers; HTTP/serial replies are offline fixtures. */
import type { GcpCeIntent } from '../../../gcloud/src/ce/types';
import { openInstalledGcpCloudSerialReader } from '../../src/gcp-cloud-serial-reader';
import { GoogleHttpRpcTraceParser, type OriginalGoogleHttpResponseObservation } from '../../src/gcp-http-rpc-trace';
import {
  collectOriginalEarlyGcpInsertIdentity,
  type OriginalEarlyGcpInsertIdentity,
} from '../../src/gcp-insert-evidence';
import type { OriginalApplyCallbackContext } from '../../src/installed-apply-controller';
import type { OriginalApplyGcpInventory } from '../../src/installed-initial-inventory';
import { authInfo } from '../original-gcp-inventory-fixture';
import { operationFixture, requestFixture, scope, traceFixture } from './gcp-insert.fixture';
import { withApplyInventory } from './original-apply-inventory.fixture';

type Json = Record<string, unknown>;
export interface EarlyVmFixtureState {
  request: Json;
  operation: Json;
  vm: Json;
  serialReads: number;
  vmUnavailable?: boolean;
  mutateDuringSerial?: () => void;
}
export interface EarlyVmFixtureInput {
  identity: OriginalEarlyGcpInsertIdentity;
  baseline: OriginalApplyGcpInventory;
  callback: OriginalApplyCallbackContext;
  reader: Awaited<ReturnType<typeof openInstalledGcpCloudSerialReader>>;
  state: EarlyVmFixtureState;
}
const binding = {
  terraformVersion: '1.17.2',
  providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
};
export async function withEarlyVmFixture(run: (input: EarlyVmFixtureInput) => Promise<void>) {
  let state: EarlyVmFixtureState | undefined;
  let parser: GoogleHttpRpcTraceParser | undefined;
  let project = '',
    zone = '',
    node = '';
  await withApplyInventory(
    async ({ packet, before }) => {
      if (!state) throw new Error('Original trace fixture required');
      const originalPlan = await before.original.readOriginalPlanSource?.();
      if (!originalPlan) throw new Error('Original plan fixture required');
      parser = new GoogleHttpRpcTraceParser(
        {
          ...scope,
          planSha256: originalPlan.receipt.planSha256,
          url: `https://compute.googleapis.com/compute/v1/projects/${project}/zones/${zone}/instances?alt=json`,
        },
        binding,
      );
      let response: OriginalGoogleHttpResponseObservation | undefined;
      const deadline = Date.now() + 15000;
      while (!response) {
        if (Date.now() >= deadline) throw new Error('Original early trace fixture startup expired');
        const chunk = await before.execution.output.read('stderr');
        if (!chunk) throw new Error('Original early trace missing');
        parser.pushOriginal(before.execution.output, chunk);
        response = parser.takeOriginalResponses()[0];
      }
      const identity = await collectOriginalEarlyGcpInsertIdentity({ originalPlan, response, binding });
      const fetcher = (async (url: string | URL | Request) => {
        const parsed = new URL(String(url)),
          path = parsed.pathname;
        if (path === '/token')
          return Response.json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 3599 });
        if (path === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
        if (path === `/v1/projects/${project}`) return Response.json({ projectId: project, lifecycleState: 'ACTIVE' });
        if (!state) throw new Error('Original fixture state missing');
        if (path === `/compute/v1/projects/${project}/zones/${zone}/operations/${state.operation.name}`)
          return Response.json(state.operation);
        if (path === `/compute/v1/projects/${project}/zones/${zone}/instances/${node}/serialPort`) {
          state.serialReads++;
          state.mutateDuringSerial?.();
          const start = parsed.searchParams.get('start') ?? '0';
          const contents = 'original-node-serial\n';
          return Response.json({
            start,
            next: (BigInt(start) + BigInt(Buffer.byteLength(contents))).toString(),
            contents,
          });
        }
        if (path === `/compute/v1/projects/${project}/zones/${zone}/instances/${node}`)
          return state.vmUnavailable
            ? Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 })
            : Response.json(state.vm);
        throw new Error('Unexpected original fixture cloud request');
      }) as typeof fetch;
      const reader = await openInstalledGcpCloudSerialReader(before.original, undefined, fetcher);
      try {
        await run({ identity, baseline: packet, callback: before, reader, state });
      } finally {
        await reader.close();
      }
    },
    true,
    async ({ final }) => {
      if (!parser) throw new Error('Original parser required');
      for (const channel of ['stdout', 'stderr'] as const)
        for (;;) {
          const chunk = await final.execution.output.read(channel);
          if (!chunk) break;
          if (channel === 'stderr') parser.pushOriginal(final.execution.output, chunk);
        }
      const complete = await final.execution.output.finish();
      parser.finishOriginal(final.execution.output, complete);
    },
    async (context, store) => {
      const originalPlan = await context.readOriginalPlanSource?.();
      if (!originalPlan) throw new Error('Original plan fixture required');
      const saved = (await store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
      const resource = originalPlan.resources.find((row) => row.type === 'google_compute_instance');
      const value = (key: string) => {
        const field = resource?.fields[key];
        if (field?.status !== 'known' || typeof field.value !== 'string')
          throw new Error('Original known VM fixture field required');
        return field.value;
      };
      project = value('project');
      zone = value('zone');
      node = value('name');
      const region = context.owner.region;
      const names = (type: string) =>
        originalPlan.resources
          .filter((row) => row.type === type)
          .map((row) => {
            const field = row.fields.name;
            if (field?.status !== 'known' || typeof field.value !== 'string')
              throw new Error('Original network fixture field required');
            return field.value;
          });
      const networks = names('google_compute_network'),
        subnets = names('google_compute_subnetwork');
      const request = {
        ...requestFixture(),
        name: node,
        machineType: `projects/${project}/zones/${zone}/machineTypes/e2-standard-8`,
        labels: {
          'xcsh-deployment': context.owner.deploymentId,
          'xcsh-engine': 'terraform',
          'xcsh-site': saved.intent.sites[0].name,
          'xcsh-node': node,
        },
        networkInterfaces: networks.slice(0, 2).map((name, index) => ({
          network: `projects/${project}/global/networks/${name}`,
          subnetwork: `projects/${project}/regions/${region}/subnetworks/${subnets[index]}`,
        })),
      };
      if (request.networkInterfaces.length !== 2) throw new Error('Original dual interface fixture required');
      const timestamp = new Date().toISOString();
      const base = `https://www.googleapis.com/compute/v1/projects/${project}/zones/${zone}`;
      const operation = {
        ...operationFixture(),
        zone: base,
        selfLink: `${base}/operations/operation-example`,
        targetLink: `${base}/instances/${node}`,
        insertTime: timestamp,
      };
      state = {
        request,
        operation,
        serialReads: 0,
        vm: {
          id: operation.targetId,
          name: node,
          zone: base,
          creationTimestamp: timestamp,
          labels: request.labels,
          metadata: { ...request.metadata, fingerprint: 'original-fingerprint' },
          serviceAccounts: [],
          networkInterfaces: request.networkInterfaces.map((nic, index) => ({
            ...nic,
            name: `nic${index}`,
            networkIP: `10.${index + 1}.0.2`,
          })),
        },
      };
      const lines = traceFixture(request, operation, '8.11.0')
        .replaceAll('us-central1-a', zone)
        .trimEnd()
        .split('\n')
        .map((raw) => {
          const row = JSON.parse(raw);
          row['@timestamp'] = timestamp;
          return JSON.stringify(row);
        });
      const last = lines.pop();
      if (!last) throw new Error('Original served fixture line required');
      return { prefix: `${lines.join('\n')}\n`, tail: `${last}\n` };
    },
  );
}
