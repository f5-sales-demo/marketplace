/** Original plan, callback, descriptor and cloud-reader issuers; HTTP/serial replies are offline fixtures. */
import { GCP_XCSH15176_TERRAFORM_ARTIFACTS } from '../../../gcloud/src/ce/terraform-public-artifacts';
import type { GcpCeIntent } from '../../../gcloud/src/ce/types';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { openInstalledGcpCloudSerialReader } from '../../src/gcp-cloud-serial-reader';
import { GoogleHttpRpcTraceParser, type OriginalGoogleHttpResponseObservation } from '../../src/gcp-http-rpc-trace';
import {
  collectOriginalEarlyGcpInsertIdentity,
  type OriginalEarlyGcpInsertIdentity,
} from '../../src/gcp-insert-evidence';
import {
  acknowledgeOriginalApplyGroupClosure,
  type OriginalApplyCallbackContext,
} from '../../src/installed-apply-controller';
import type { InstalledCaptureContext } from '../../src/installed-capture-context';
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
  beforeVmRead?: () => Promise<void>;
  mutateDuringSerial?: () => void;
}
export interface EarlyVmFixtureInput {
  identity: OriginalEarlyGcpInsertIdentity;
  baseline: OriginalApplyGcpInventory;
  callback: OriginalApplyCallbackContext;
  reader: Awaited<ReturnType<typeof openInstalledGcpCloudSerialReader>>;
  state: EarlyVmFixtureState;
  store: CeDeploymentStore;
}
const retainedBinding = {
  terraformVersion: '1.17.2',
  providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
};
export async function withEarlyVmFixture(
  run: (input: EarlyVmFixtureInput) => Promise<void>,
  finalRun?: (input: EarlyVmFixtureInput) => Promise<void>,
  expectedOutcome?: 'deadline',
  latest = false,
  options: {
    sourceCaptureInputs?: boolean;
    prepareIntent?: (intent: GcpCeIntent, store: CeDeploymentStore) => Promise<void>;
    prepare?: (context: InstalledCaptureContext, store: CeDeploymentStore, state: EarlyVmFixtureState) => Promise<void>;
  } = {},
) {
  const binding = latest
    ? {
        terraformVersion: '1.17.2',
        providerLockSha256: 'f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5',
      }
    : retainedBinding;
  let state: EarlyVmFixtureState | undefined;
  let parser: GoogleHttpRpcTraceParser | undefined;
  let beforeInput: EarlyVmFixtureInput | undefined;
  let fetcher: typeof fetch | undefined;
  const unavailableTargets = new Set<string>();
  let project = '',
    zone = '',
    node = '';
  try {
    await withApplyInventory(
      async ({ packet, before, store }) => {
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
        fetcher = (async (url: string | URL | Request) => {
          const parsed = new URL(String(url)),
            path = parsed.pathname;
          if (path === '/token')
            return Response.json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 3599 });
          if (path === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
          if (path === `/v1/projects/${project}`)
            return Response.json({ projectId: project, lifecycleState: 'ACTIVE' });
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
          if (path === `/compute/v1/projects/${project}/zones/${zone}/instances/${node}`) {
            await state.beforeVmRead?.();
            return state.vmUnavailable
              ? Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 })
              : Response.json(state.vm);
          }
          if (unavailableTargets.has(path))
            return Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 });
          throw new Error('Unexpected original fixture cloud request');
        }) as typeof fetch;
        const reader = await openInstalledGcpCloudSerialReader(before.original, undefined, fetcher);
        try {
          beforeInput = { identity, baseline: packet, callback: before, reader, state, store };
          await run(beforeInput);
        } finally {
          if (!finalRun) await reader.close();
        }
      },
      true,
      async ({ packet, final }) => {
        if (!parser) throw new Error('Original parser required');
        for (const channel of ['stdout', 'stderr'] as const)
          for (;;) {
            const chunk = await final.execution.output.read(channel);
            if (!chunk) break;
            if (channel === 'stderr') parser.pushOriginal(final.execution.output, chunk);
          }
        const complete = await final.execution.output.finish();
        parser.finishOriginal(final.execution.output, complete);
        await acknowledgeOriginalApplyGroupClosure(final, complete);
        if (finalRun) {
          if (!beforeInput || !fetcher || !final.reserve) throw new Error('Original final fixture sources required');
          const reader = await openInstalledGcpCloudSerialReader(final.original, undefined, fetcher, {
            admission: final.execution,
            reserve: final.reserve,
          });
          try {
            await finalRun({ ...beforeInput, baseline: packet, callback: final, reader });
          } finally {
            await reader.close();
          }
        }
      },
      async (context, store) => {
        const originalPlan = await context.readOriginalPlanSource?.();
        if (!originalPlan) throw new Error('Original plan fixture required');
        const saved = (await store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
        for (const row of originalPlan.resources.filter((row) => row.type === 'google_compute_instance')) {
          const name = row.fields.name,
            zone = row.fields.zone;
          if (name?.status === 'known' && zone?.status === 'known')
            unavailableTargets.add(
              `/compute/v1/projects/${context.owner.account}/zones/${zone.value}/instances/${name.value}`,
            );
        }
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
            canIpForward: request.canIpForward,
            machineType: request.machineType,
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
        await options.prepare?.(context, store, state);
        const lines = traceFixture(request, operation, latest ? '8.12.0' : '8.11.0')
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
      expectedOutcome,
      undefined,
      options.prepareIntent,
      latest ? GCP_XCSH15176_TERRAFORM_ARTIFACTS.providerLock : undefined,
      false,
      undefined,
      options.sourceCaptureInputs ?? false,
    );
  } finally {
    await beforeInput?.reader.close();
  }
}
