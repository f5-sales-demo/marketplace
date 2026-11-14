/** Simulated source/cloud producers only; no installed or GCP acceptance. */
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGcpCloudSerialReader } from '../../src/gcp-cloud-serial-reader';
import { GoogleHttpRpcTraceParser } from '../../src/gcp-http-rpc-trace';
import { inspectOriginalGcpInsertBodies, joinOriginalGcpInsertSource } from '../../src/gcp-insert-evidence';
export const binding = {
  terraformVersion: '1.17.1',
  providerLockSha256: 'fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0',
};

export const zone = 'us-central1-a',
  project = 'example-project',
  node = 'example-node';

export const scope = {
  rpc: 'ApplyResourceChange' as const,
  resourceType: 'google_compute_instance',
  method: 'POST' as const,
  url: `https://compute.googleapis.com/compute/v1/projects/${project}/zones/${zone}/instances?alt=json`,
  requestReason: 'xcsh-1559-example',
  planSha256: 'a'.repeat(64),
};

export const identity = {
  tf_provider_addr: 'registry.terraform.io/hashicorp/google',
  tf_proto_version: '5.11',
  tf_rpc: scope.rpc,
  tf_resource_type: scope.resourceType,
  tf_req_id: '11111111-2222-3333-4444-555555555555',
};

export const requestFixture = () => ({
  name: node,
  canIpForward: true,
  deletionProtection: false,
  machineType: `projects/${project}/zones/${zone}/machineTypes/e2-standard-8`,
  labels: {
    'xcsh-deployment': 'example-deployment',
    'xcsh-engine': 'terraform',
    'xcsh-site': 'example-site',
    'xcsh-node': node,
  },
  metadata: {
    items: [
      { key: 'VmDnsSetting', value: 'ZonePreferred' },
      { key: 'user-data', value: 'example-private-bootstrap' },
    ],
  },
  networkInterfaces: [
    {
      network: `projects/${project}/global/networks/example-network`,
      subnetwork: `projects/${project}/regions/us-central1/subnetworks/example-subnet`,
    },
  ],
  disks: [{ boot: true, autoDelete: true, initializeParams: { sourceImage: 'example-reviewed-image' } }],
});

export const operationFixture = () => ({
  kind: 'compute#operation',
  id: '18446744073709551614',
  name: 'operation-example',
  operationType: 'insert',
  targetId: '18446744073709551613',
  status: 'RUNNING',
  zone: `https://www.googleapis.com/compute/v1/projects/${project}/zones/${zone}`,
  selfLink: `https://www.googleapis.com/compute/v1/projects/${project}/zones/${zone}/operations/operation-example`,
  targetLink: `https://www.googleapis.com/compute/v1/projects/${project}/zones/${zone}/instances/${node}`,
});

export function capture(
  request: unknown = requestFixture(),
  response: unknown = operationFixture(),
  versionBinding = binding,
  googleVersion = '8.10.0',
  planSha256 = scope.planSha256,
) {
  const row = (message: string, fields = {}) =>
    `${JSON.stringify({
      '@timestamp': '2026-11-10T10:00:00Z',
      '@level': 'debug',
      '@module': `provider.terraform-provider-google_v${googleVersion}_x5`,
      '@message': message,
      ...fields,
    })}\n`;
  const rpc = (message: string) => row(message, { '@module': 'sdk.proto', '@level': 'trace', ...identity });
  const end = row('-----------------------------------------------------');
  const parser = new GoogleHttpRpcTraceParser({ ...scope, planSha256 }, versionBinding);
  const [candidate] = parser.push(
    Buffer.from(
      rpc('Received request') +
        row('2026/11/10 10:00:00 [DEBUG] Google API Request Details:') +
        row('---[ REQUEST ]---------------------------------------') +
        row('POST /compute/v1/projects/example-project/zones/us-central1-a/instances?alt=json HTTP/1.1') +
        row('Host: compute.googleapis.com') +
        row('Content-Type: application/json') +
        row('X-Goog-Request-Reason: xcsh-1559-example') +
        row('') +
        row(JSON.stringify(request)) +
        end +
        row('2026/11/10 10:00:00 [DEBUG] Google API Response Details:') +
        row('---[ RESPONSE ]--------------------------------------') +
        row('HTTP/1.1 200 OK') +
        row('Content-Type: application/json') +
        row('') +
        row(JSON.stringify(response)) +
        end +
        rpc('Served request'),
    ),
  );
  parser.finish();
  return parser.consumeBodies(candidate);
}

export function sourceJoinFixture(
  versionBinding = binding,
  googleVersion = '8.10.0',
  request = requestFixture(),
  planSha256 = scope.planSha256,
) {
  const insert = inspectOriginalGcpInsertBodies(
    capture(request, operationFixture(), versionBinding, googleVersion, planSha256),
    versionBinding,
  );
  const providerPath = `/example/provider/terraform-provider-google_v${googleVersion}_x5`;
  const parent = { pid: 1234, group: 1234, start: '100', boot: '11111111-1111-1111-1111-111111111111' };
  const provider = {
    pid: 2345,
    parent: 1234,
    group: 1234,
    start: '200',
    boot: parent.boot,
    executable_sha256:
      googleVersion === '8.11.0'
        ? 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5'
        : 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9',
  };
  const resource = {
    name: node,
    project,
    zone,
    labels: request.labels,
    can_ip_forward: true,
    machine_type: 'e2-standard-8',
  };
  const configuration = JSON.stringify({
    provider: { google: [{ project, region: 'us-central1', request_reason: scope.requestReason }] },
    resource: { google_compute_instance: { node: resource } },
  });
  const plan = {
    schemaVersion: 1 as const,
    engine: 'terraform' as const,
    deploymentId: 'example-deployment',
    backendIdentity: 'local:example-deployment',
    configurationSha256: createHash('sha256').update(configuration).digest('hex'),
    providerLockSha256: versionBinding.providerLockSha256,
    planSha256,
    changes: [{ address: 'google_compute_instance.node', type: 'google_compute_instance', actions: ['create'] }],
    noChanges: false,
  };
  const hook = {
    address: 'google_compute_instance.node',
    resourceType: 'google_compute_instance',
    action: 'create' as const,
    actionIndex: 0,
    elapsedSeconds: null,
    idKey: null,
    idValue: null,
    rawLineSha256: 'b'.repeat(64),
    planSha256: plan.planSha256,
    applyRpcQualified: false as const,
    originalInsertQualified: false as const,
  };
  const rpc = {
    receivedEpochMs: Date.parse('2026-11-10T10:00:00Z'),
    servedEpochMs: Date.parse('2026-11-10T10:00:00Z'),
    providerPid: provider.pid,
    providerPathSha256: createHash('sha256').update(providerPath).digest('hex'),
    rpc: 'ApplyResourceChange',
    resourceType: 'google_compute_instance',
    rpcRequestId: insert.rpcRequestId,
    startingRecordSha256: 'c'.repeat(64),
    startedRecordSha256: 'd'.repeat(64),
    receivedRecordSha256: insert.receivedRecordSha256,
    servedRecordSha256: insert.servedRecordSha256,
    planSha256: plan.planSha256,
    providerProcessQualified: false as const,
    applyRpcQualified: false as const,
    originalInsertQualified: false as const,
  };
  const window = {
    schemaVersion: 3 as const,
    kind: 'original-provider-stderr-coherent-window' as const,
    executor: parent,
    reader: { ...parent, pid: 3456, group: 3456, start: '300' },
    executorAvailable: false,
    executorGroupClosed: true,
    applyPhaseQualified: false as const,
    signalsSent: false as const,
    cloudSubmissions: 0 as const,
    requestSha256: 'e'.repeat(64),
    evidencePath: '/example/private/window.json',
    evidenceSha256: 'f'.repeat(64),
    windowStartedMs: 1000,
    windowDeadlineMs: 46000,
    finishedMs: 2000,
    samplingWindowComplete: true as const,
    observations: [
      {
        candidate: provider,
        stderr: { providerFd: 2 as const, parentFd: 10, device: '14', inode: '1000', providerFlags: 1, parentFlags: 0 },
        firstObservedMs: 1100,
        lastObservedMs: 1900,
        presentAtLastSample: false,
      },
    ],
  };
  return {
    insert,
    providerPath,
    parent,
    configuration,
    plan,
    started: { ...hook, phase: 'apply_start' as const },
    completed: {
      ...hook,
      phase: 'apply_complete' as const,
      idKey: 'id',
      idValue: `projects/${project}/zones/${zone}/instances/${node}`,
      rawLineSha256: 'a'.repeat(64),
    },
    rpc,
    window,
    binding: versionBinding,
  };
}

export async function vmJoinFixture(
  change: Record<string, unknown> = {},
  audit?: (vm: Record<string, unknown>) => unknown[],
  versionBinding = binding,
  googleVersion = '8.10.0',
  request = requestFixture(),
  planSha256 = scope.planSha256,
) {
  const input = sourceJoinFixture(versionBinding, googleVersion, request, planSha256);
  const source = joinOriginalGcpInsertSource(
    googleVersion === '8.11.0'
      ? { ...input, window: { ...input.window, schemaVersion: 4, kind: 'original-provider-stderr-verified-window' } }
      : input,
  );
  if (source.targetId === null) throw new Error('Original numeric fixture target required');
  const initial = request;
  const created = new Date(Date.now() - 500).toISOString();
  const vm = {
    id: source.targetId,
    name: node,
    zone: operationFixture().zone,
    creationTimestamp: created,
    labels: initial.labels,
    metadata: { ...initial.metadata, fingerprint: 'example-original-fingerprint' },
    networkInterfaces: initial.networkInterfaces.map((nic, index) => ({
      ...nic,
      name: `nic${index}`,
      networkIP: '10.1.0.2',
    })),
    ...change,
  };
  const op = { ...operationFixture(), insertTime: new Date(Date.now() - 1000).toISOString(), status: 'DONE' };
  const replies: unknown[] = [{ error: { code: 404, errors: [{ reason: 'notFound' }] } }, op, vm, vm];
  const root = await mkdtemp(join(tmpdir(), 'gcp-vm-join-'));
  const fetcher = (async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    if (path === '/token')
      return Response.json({ access_token: 'example-access', token_type: 'Bearer', expires_in: 3599 });
    if (path === '/oauth2/v2/tokeninfo')
      return Response.json({
        email: 'principal@example.com',
        verified_email: true,
        audience: 'example-client',
        issued_to: 'example-client',
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        expires_in: 3599,
      });
    if (path === '/v1/projects/example-project') return Response.json({ projectId: project, lifecycleState: 'ACTIVE' });
    if (path === '/v2/entries:list' && audit) return Response.json({ entries: audit(vm) });
    const value = replies.shift();
    if (!value && path === `/compute/v1/projects/${project}/zones/${zone}/instances/${node}`) return Response.json(vm);
    if (!value) throw new Error('Unexpected scoped fixture read');
    if (value === op) {
      op.insertTime = new Date(Date.now()).toISOString();
      vm.creationTimestamp = op.insertTime;
    }
    return Response.json(value, { status: (value as { error?: { code: number } }).error?.code ?? 200 });
  }) as typeof fetch;
  const reader = await openGcpCloudSerialReader(
    {
      root,
      region: 'us-central1',
      authentication: {
        credentialBytes: Buffer.from(
          JSON.stringify({
            type: 'authorized_user',
            client_id: 'example-client',
            client_secret: 'example-secret',
            refresh_token: 'example-refresh',
            quota_project_id: project,
          }),
        ),
        project,
        accountSha256: createHash('sha256').update('principal@example.com').digest('hex'),
        audienceSha256: createHash('sha256').update('example-client').digest('hex'),
        assertOriginal: async () => {},
      },
    },
    undefined,
    fetcher,
  );
  const absent = await reader.instance(zone, node);
  const operation = await reader.insertOperation(zone, source.operationName, node);
  const instance = await reader.instance(zone, node);
  if (absent.present || !instance.present) throw new Error('Original fixture absence/instance required');
  return { source, reader, absent, operation, instance };
}

export async function auditJoinFixture(
  change?: (entries: Record<string, unknown>[]) => unknown[],
  versionBinding = binding,
  googleVersion = '8.10.0',
  request = requestFixture(),
  planSha256 = scope.planSha256,
) {
  const input = await vmJoinFixture(
    {},
    (vm) => {
      const entry = (insertId: string) => ({
        insertId,
        logName: `projects/${project}/logs/cloudaudit.googleapis.com%2Factivity`,
        timestamp: vm.creationTimestamp,
        resource: { type: 'gce_instance', labels: { project_id: project, zone, instance_id: vm.id } },
        protoPayload: {
          '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
          serviceName: 'compute.googleapis.com',
          methodName: 'v1.compute.instances.insert',
          resourceName: `projects/${project}/zones/${zone}/instances/${node}`,
          authenticationInfo: { principalEmail: 'principal@example.com' },
          status: {},
        },
      });
      const first = {
        ...entry('first-audit'),
        operation: { id: operationFixture().name, producer: 'compute.googleapis.com', first: true },
        protoPayload: {
          ...entry('first-audit').protoPayload,
          request: { '@type': 'example.insert', name: node, labels: request.labels, canIpForward: true },
          response: { ...operationFixture(), insertTime: vm.creationTimestamp },
          requestMetadata: { requestAttributes: { reason: scope.requestReason } },
        },
      };
      const last = {
        ...entry('last-audit'),
        operation: { id: operationFixture().name, producer: 'compute.googleapis.com', last: true },
        protoPayload: { ...entry('last-audit').protoPayload, request: { '@type': 'example.insert' } },
      };
      return change ? change([first, last]) : [first, last];
    },
    versionBinding,
    googleVersion,
    request,
    planSha256,
  );
  const audit = await input.reader.insertAudit(zone, node, {
    after: new Date(input.absent.startedAt - 1000).toISOString(),
    before: new Date(Date.now() + 1000).toISOString(),
  });
  return { ...input, audit };
}
