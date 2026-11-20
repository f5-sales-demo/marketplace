/** Actual original plan/callback/output/inventory/image issuers; all HTTP replies are explicit offline observations. */
import { join } from 'node:path';
import { translateGcpTerraformObserverSiteCompute } from '../../../gcloud/src/ce/observer-plan';
import { gcpTerraformObserverIdentity } from '../../../gcloud/src/ce/observer-scope';
import { createGcpTerraformRequestReason } from '../../../gcloud/src/ce/request-reason';
import { GCP_XCSH15176_OBSERVER_ARTIFACTS } from '../../../gcloud/src/ce/terraform-public-artifacts';
import type { GcpCeIntent } from '../../../gcloud/src/ce/types';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { openInstalledGcpCloudSerialReader } from '../../src/gcp-cloud-serial-reader';
import { GoogleHttpRpcTraceParser, type OriginalGoogleHttpResponseObservation } from '../../src/gcp-http-rpc-trace';
import { type OriginalGcpObserverImageEvidence, openGcpObserverImageReader } from '../../src/gcp-observer-image';
import { GCP_OBSERVER_IMAGE_PIN } from '../../src/gcp-observer-image-pin';
import {
  acknowledgeOriginalApplyGroupClosure,
  type OriginalApplyCallbackContext,
} from '../../src/installed-apply-controller';
import type { OriginalApplyGcpInventory } from '../../src/installed-initial-inventory';
import { readOwnedInstalledInput } from '../../src/installed-runtime';
import { authInfo } from '../original-gcp-inventory-fixture';
import { operationFixture, scope, traceFixture } from './gcp-insert.fixture';
import { withApplyInventory } from './original-apply-inventory.fixture';

type Json = Record<string, unknown>;
const legacyVersions = { terraform: '1.17.2', google: '8.11.0', xcsh: '15.17.3' };
export interface ObserverInsertFixtureInput {
  callback: OriginalApplyCallbackContext;
  baseline: OriginalApplyGcpInventory;
  response: OriginalGoogleHttpResponseObservation;
  binding: { terraformVersion: string; providerLockSha256: string };
  imageReader: Awaited<ReturnType<typeof openGcpObserverImageReader>>;
  image: OriginalGcpObserverImageEvidence;
  request: Json;
  operation: Json;
  cloudReader: Awaited<ReturnType<typeof openInstalledGcpCloudSerialReader>>;
  vm: Json;
  disk: Json;
  serialHook: { run?: () => void; contents?: string };
  cloudHook: { run?: (path: string) => void | Promise<void> };
}
export async function withObserverInsert(
  run: (value: ObserverInsertFixtureInput) => Promise<void>,
  mutateRequest?: (request: Json, operation: Json) => void,
  finalRun?: (callback: OriginalApplyCallbackContext) => Promise<void>,
  prepareIntent?: (intent: GcpCeIntent, store: CeDeploymentStore) => Promise<void>,
  latest = false,
) {
  const versions = latest ? { terraform: '1.17.2', google: '8.12.0', xcsh: '15.17.6' } : legacyVersions;
  let intent: GcpCeIntent | undefined;
  let reason = '',
    request: Json | undefined,
    operation: Json | undefined;
  let parser: GoogleHttpRpcTraceParser | undefined;
  const binding = {
    terraformVersion: '1.17.2',
    providerLockSha256: latest
      ? 'f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5'
      : 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
  };
  await withApplyInventory(
    async ({ packet, before }) => {
      if (!intent || !request || !operation) throw new Error('Original observer fixture configuration required');
      const observer = gcpTerraformObserverIdentity(intent);
      const original = await before.original.readOriginalPlanSource?.();
      if (!original) throw new Error('Original observer plan required');
      parser = new GoogleHttpRpcTraceParser(
        {
          ...scope,
          planSha256: original.receipt.planSha256,
          requestReason: reason,
          instanceName: observer.name,
          url: `https://compute.googleapis.com/compute/v1/projects/${intent.project}/zones/${observer.zone}/instances?alt=json`,
        },
        binding,
      );
      let response: OriginalGoogleHttpResponseObservation | undefined;
      while (!response) {
        const chunk = await before.execution.output.read('stderr');
        if (!chunk) throw new Error('Original observer trace missing');
        parser.pushOriginal(before.execution.output, chunk);
        response = parser.takeOriginalResponses()[0];
      }
      const adc = await readOwnedInstalledInput(before.original.inputs.adc.path);
      const imageReader = await openGcpObserverImageReader(
        {
          root: join(before.original.executionDirectory, 'observer-image-fixture'),
          authentication: {
            credentialBytes: adc.bytes,
            project: intent.project,
            accountSha256: before.original.authentication.accountSha256,
            audienceSha256: before.original.authentication.audienceSha256,
            assertOriginal: before.original.assertInputs,
          },
        },
        undefined,
        (async (url: string | URL | Request) => {
          const path = new URL(String(url)).pathname;
          if (path === '/token')
            return Response.json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 3599 });
          if (path === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
          if (path === `/v1/projects/${intent?.project}`)
            return Response.json({ projectId: intent?.project, lifecycleState: 'ACTIVE' });
          return Response.json({
            ...GCP_OBSERVER_IMAGE_PIN,
            kind: 'compute#image',
            creationTimestamp: '2026-10-21T00:00:00Z',
          });
        }) as typeof fetch,
      );
      const image = await imageReader.read();
      const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
      const vm: Json = {
        id: operation.targetId,
        name: observer.name,
        zone: `${prefix}/zones/${observer.zone}`,
        creationTimestamp: operation.insertTime,
        canIpForward: false,
        deletionProtection: false,
        machineType: request.machineType,
        labels: request.labels,
        metadata: { ...(request.metadata as object), fingerprint: 'original-fingerprint' },
        tags: request.tags,
        serviceAccounts: [],
        networkInterfaces: [
          {
            ...(request.networkInterfaces as Json[])[0],
            name: 'nic0',
            networkIP: '10.2.0.7',
            accessConfigs: [
              { name: 'External NAT', type: 'ONE_TO_ONE_NAT', networkTier: 'PREMIUM', natIP: '192.0.2.7' },
            ],
          },
        ],
        disks: [{ boot: true, autoDelete: false, source: `${prefix}/zones/${observer.zone}/disks/${observer.name}` }],
      };
      const disk: Json = {
        kind: 'compute#disk',
        id: '18446744073709551611',
        name: observer.name,
        zone: `${prefix}/zones/${observer.zone}`,
        selfLink: `${prefix}/zones/${observer.zone}/disks/${observer.name}`,
        creationTimestamp: operation.insertTime,
        sizeGb: '20',
        type: `${prefix}/zones/${observer.zone}/diskTypes/pd-balanced`,
        sourceImage: GCP_OBSERVER_IMAGE_PIN.selfLink,
        sourceImageId: GCP_OBSERVER_IMAGE_PIN.id,
        labels: request.labels,
        users: [`${prefix}/zones/${observer.zone}/instances/${observer.name}`],
      };
      const serialHook: { run?: () => void; contents?: string } = {};
      const cloudHook: { run?: (path: string) => void | Promise<void> } = {};
      const cloudReader = await openInstalledGcpCloudSerialReader(before.original, undefined, (async (
        url: string | URL | Request,
      ) => {
        const parsed = new URL(String(url)),
          path = parsed.pathname;
        await cloudHook.run?.(path);
        if (path === '/token')
          return Response.json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 3599 });
        if (path === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
        if (path === `/v1/projects/${intent?.project}`)
          return Response.json({ projectId: intent?.project, lifecycleState: 'ACTIVE' });
        if (path.endsWith(`/operations/${operation?.name}`)) return Response.json(operation);
        if (path.endsWith(`/disks/${observer.name}`)) return Response.json(disk);
        if (path.endsWith(`/instances/${observer.name}/serialPort`)) {
          serialHook.run?.();
          const start = parsed.searchParams.get('start') ?? '0',
            contents = serialHook.contents ?? 'original-observer-serial\n';
          return Response.json({
            start,
            next: (BigInt(start) + BigInt(Buffer.byteLength(contents))).toString(),
            contents,
          });
        }
        if (path.endsWith(`/instances/${observer.name}`)) return Response.json(vm);
        throw new Error('Unexpected original observer cloud fixture request');
      }) as typeof fetch);
      try {
        await run({
          callback: before,
          baseline: packet,
          response,
          binding,
          imageReader,
          image,
          request,
          operation,
          cloudReader,
          vm,
          disk,
          serialHook,
          cloudHook,
        });
      } finally {
        await cloudReader.close();
      }
    },
    true,
    async ({ final }) => {
      if (!parser) throw new Error('Original observer parser required');
      for (const channel of ['stdout', 'stderr'] as const)
        for (;;) {
          const chunk = await final.execution.output.read(channel);
          if (!chunk) break;
          if (channel === 'stderr') parser.pushOriginal(final.execution.output, chunk);
        }
      const complete = await final.execution.output.finish();
      parser.finishOriginal(final.execution.output, complete);
      await acknowledgeOriginalApplyGroupClosure(final, complete);
      await finalRun?.(final);
    },
    async (_context) => {
      if (!intent) throw new Error('Original observer intent required');
      const observer = gcpTerraformObserverIdentity(intent);
      const base = `https://www.googleapis.com/compute/v1/projects/${intent.project}/zones/${observer.zone}`;
      request = {
        name: observer.name,
        canIpForward: false,
        deletionProtection: false,
        machineType: `projects/${intent.project}/zones/${observer.zone}/machineTypes/e2-micro`,
        labels: { 'xcsh-deployment': intent.deploymentName, 'xcsh-engine': 'terraform', 'xcsh-role': 'observer' },
        tags: { items: [observer.name] },
        metadata: {
          items: [
            { key: 'ssh-keys', value: `ubuntu:${intent.observer?.publicKey}` },
            { key: 'block-project-ssh-keys', value: 'TRUE' },
            { key: 'enable-oslogin', value: 'FALSE' },
          ],
        },
        disks: [{ boot: true, source: `projects/${intent.project}/zones/${observer.zone}/disks/${observer.name}` }],
        networkInterfaces: [
          {
            network: `projects/${intent.project}/global/networks/${observer.network}`,
            subnetwork: `projects/${intent.project}/regions/${intent.region}/subnetworks/${observer.subnet}`,
            accessConfigs: [{ name: 'External NAT', type: 'ONE_TO_ONE_NAT', networkTier: 'PREMIUM' }],
          },
        ],
      };
      const timestamp = new Date().toISOString();
      operation = {
        ...operationFixture(),
        targetLink: `${base}/instances/${observer.name}`,
        zone: base,
        selfLink: `${base}/operations/operation-example`,
        insertTime: timestamp,
      };
      mutateRequest?.(request, operation);
      const lines = traceFixture(
        request as unknown as Parameters<typeof traceFixture>[0],
        operation as unknown as Parameters<typeof traceFixture>[1],
        versions.google,
      )
        .replaceAll('us-central1-a', observer.zone)
        .replaceAll('xcsh-1559-example', reason)
        .trimEnd()
        .split('\n')
        .map((raw) => {
          const row = JSON.parse(raw);
          row['@timestamp'] = timestamp;
          return JSON.stringify(row);
        });
      const tail = lines.pop();
      if (!tail) throw new Error('Original observer trace tail required');
      return { prefix: `${lines.join('\n')}\n`, tail: `${tail}\n` };
    },
    undefined,
    (value) => {
      intent = value;
      if (!value.observer) throw new Error('Original observer scope required');
      const correlation = createGcpTerraformRequestReason(value);
      reason = correlation.reason;
      return JSON.stringify(
        translateGcpTerraformObserverSiteCompute(value, versions, value.observer, correlation).configuration,
      );
    },
    prepareIntent,
    latest ? GCP_XCSH15176_OBSERVER_ARTIFACTS.providerLock : undefined,
  );
}
