import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGcpCloudSerialReader } from '../src/gcp-cloud-serial-reader';
import { GoogleHttpRpcTraceParser } from '../src/gcp-http-rpc-trace';
import { joinOriginalGcpInsertAuditEvidence } from '../src/gcp-insert-audit-evidence';
import { inspectOriginalGcpInsertBodies, joinOriginalGcpInsertSource } from '../src/gcp-insert-evidence';
import { joinOriginalGcpVmEvidence } from '../src/gcp-vm-evidence';

const binding = {
  terraformVersion: '1.17.1',
  providerLockSha256: 'fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0',
};
const zone = 'us-central1-a',
  project = 'example-project',
  node = 'example-node';
const scope = {
  rpc: 'ApplyResourceChange' as const,
  resourceType: 'google_compute_instance',
  method: 'POST' as const,
  url: `https://compute.googleapis.com/compute/v1/projects/${project}/zones/${zone}/instances?alt=json`,
  requestReason: 'xcsh-1559-example',
  planSha256: 'a'.repeat(64),
};
const identity = {
  tf_provider_addr: 'registry.terraform.io/hashicorp/google',
  tf_proto_version: '5.11',
  tf_rpc: scope.rpc,
  tf_resource_type: scope.resourceType,
  tf_req_id: '11111111-2222-3333-4444-555555555555',
};
const requestFixture = () => ({
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
const operationFixture = () => ({
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
function capture(
  request: unknown = requestFixture(),
  response: unknown = operationFixture(),
  versionBinding = binding,
  googleVersion = '8.10.0',
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
  const parser = new GoogleHttpRpcTraceParser(scope, versionBinding);
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

test('latest original insert bodies project exact scoped uint64 identities and hashes without bootstrap disclosure', () => {
  const bodies = capture();
  const candidate = inspectOriginalGcpInsertBodies(bodies, binding);
  expect(candidate.schemaVersion).toBe(1);
  expect(candidate.kind).toBe('original-compute-instance-insert-http-candidate');
  expect(candidate.project).toBe(project);
  expect(candidate.zone).toBe(zone);
  expect(candidate.nodeName).toBe(node);
  expect(candidate.operationId).toBe('18446744073709551614');
  expect(candidate.targetId).toBe('18446744073709551613');
  expect(candidate.requestBodySha256).toBe(bodies.requestBodySha256);
  expect(candidate.bootstrapSha256).toBe(createHash('sha256').update('example-private-bootstrap').digest('hex'));
  expect(candidate.serviceAccountsRequested).toBe(false);
  expect(candidate.originalInsertQualified).toBe(false);
  expect(JSON.stringify(candidate)).not.toContain('example-private-bootstrap');
  expect(Object.isFrozen(candidate)).toBe(true);
});

test('copied HTTP bodies cannot acquire original parser provenance', () => {
  const bodies = capture();
  expect(() => inspectOriginalGcpInsertBodies({ ...bodies }, binding)).toThrow('original');
});

test('pending operation without numeric target remains incomplete for original VM incarnation', () => {
  const operation = { ...operationFixture(), targetId: undefined, status: 'PENDING' };
  const candidate = inspectOriginalGcpInsertBodies(capture(requestFixture(), operation), binding);
  expect(candidate.targetId).toBeNull();
  expect(candidate.originalInsertQualified).toBe(false);
});

test('wrong-engine labels, missing bootstrap, duplicate metadata and service accounts refuse', () => {
  for (const request of [
    { ...requestFixture(), labels: { ...requestFixture().labels, 'xcsh-engine': 'native' } },
    { ...requestFixture(), labels: { ...requestFixture().labels, 'xcsh-node': 'example-foreign-node' } },
    { ...requestFixture(), metadata: { items: [{ key: 'VmDnsSetting', value: 'ZonePreferred' }] } },
    {
      ...requestFixture(),
      metadata: {
        items: [
          { key: 'user-data', value: 'one' },
          { key: 'user-data', value: 'two' },
        ],
      },
    },
    { ...requestFixture(), serviceAccounts: [{ email: 'default' }] },
    { ...requestFixture(), canIpForward: false },
  ])
    expect(() => inspectOriginalGcpInsertBodies(capture(request), binding)).toThrow();
});

test('foreign operation, malformed numeric incarnation and failed operations refuse', () => {
  for (const operation of [
    { ...operationFixture(), operationType: 'delete' },
    { ...operationFixture(), targetLink: operationFixture().targetLink.replace(node, 'example-foreign-node') },
    { ...operationFixture(), targetId: '18446744073709551616' },
    { ...operationFixture(), id: 9007199254740992 },
    { ...operationFixture(), zone: operationFixture().zone.replace(project, 'example-foreign-project') },
    { ...operationFixture(), error: { errors: [{ code: 'EXAMPLE_ERROR' }] } },
    { ...operationFixture(), selfLink: `${operationFixture().selfLink}?foreign=1` },
  ])
    expect(() => inspectOriginalGcpInsertBodies(capture(requestFixture(), operation), binding)).toThrow();
});

test('unverified newer runtime mappings cannot inherit the latest admitted insert profile', () => {
  expect(() => inspectOriginalGcpInsertBodies(capture(), { ...binding, terraformVersion: '1.18.0' })).toThrow();
});

test('missing ownership fields and incomplete machine/interface names cannot pass coercible scope checks', () => {
  for (const request of [
    { ...requestFixture(), labels: { 'xcsh-engine': 'terraform', 'xcsh-node': node } },
    { ...requestFixture(), labels: { ...requestFixture().labels, 'xcsh-site': undefined } },
    { ...requestFixture(), machineType: `projects/${project}/zones/${zone}/machineTypes/` },
    {
      ...requestFixture(),
      networkInterfaces: [
        { ...requestFixture().networkInterfaces[0], network: `projects/${project}/global/networks/` },
      ],
    },
    {
      ...requestFixture(),
      networkInterfaces: [
        {
          ...requestFixture().networkInterfaces[0],
          subnetwork: `projects/${project}/regions/us-central1/subnetworks/example-subnet/foreign`,
        },
      ],
    },
  ])
    expect(() => inspectOriginalGcpInsertBodies(capture(request), binding)).toThrow();
});

function sourceJoinFixture(versionBinding = binding, googleVersion = '8.10.0') {
  const insert = inspectOriginalGcpInsertBodies(
    capture(requestFixture(), operationFixture(), versionBinding, googleVersion),
    versionBinding,
  );
  const providerPath = `/example/provider/terraform-provider-google_v${googleVersion}_x5`;
  const parent = { pid: 1234, group: 1234, start: '100', boot: '11111111-2222-3333-4444-555555555555' };
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
    labels: requestFixture().labels,
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
    planSha256: scope.planSha256,
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

test('reviewed resource, insert body, exact lifecycle RPC and original FIFO window form an unqualified source join', () => {
  const input = sourceJoinFixture();
  const joined = joinOriginalGcpInsertSource(input);
  expect(joined.resourceAddress).toBe('google_compute_instance.node');
  expect(joined.providerPid).toBe(input.rpc.providerPid);
  expect(joined.providerStart).toBe('200');
  expect(joined.providerBoot).toBe(input.parent.boot);
  expect(joined.operationId).toBe(input.insert.operationId);
  expect(joined.sourceCorroborated).toBe(true);
  expect(joined.originalInsertQualified).toBe(false);
  expect(Object.isFrozen(joined)).toBe(true);
});

test('source join refuses wrong engines, stale plans, foreign resource completions and RPC substitutions', () => {
  const input = sourceJoinFixture();
  for (const changed of [
    { ...input, plan: { ...input.plan, engine: 'native' } },
    { ...input, plan: { ...input.plan, planSha256: 'b'.repeat(64) } },
    { ...input, configuration: `${input.configuration} ` },
    {
      ...input,
      completed: {
        ...input.completed,
        idValue: 'projects/example-project/zones/us-central1-a/instances/example-foreign-node',
      },
    },
    { ...input, rpc: { ...input.rpc, rpcRequestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } },
    { ...input, rpc: { ...input.rpc, receivedRecordSha256: 'b'.repeat(64) } },
    {
      ...input,
      window: { ...input.window, observations: [input.window.observations[0], input.window.observations[0]] },
    },
    { ...input, parent: { ...input.parent, start: '101' } },
    { ...input, insert: { ...input.insert } },
  ])
    expect(() => joinOriginalGcpInsertSource(changed as never)).toThrow();
});

test('source correlation rejects malformed numeric and time evidence instead of coercing it', () => {
  const input = sourceJoinFixture();
  for (const changed of [
    {
      ...input,
      window: {
        ...input.window,
        observations: [
          { ...input.window.observations[0], stderr: { ...input.window.observations[0].stderr, parentFlags: null } },
        ],
      },
    },
    {
      ...input,
      window: { ...input.window, observations: [{ ...input.window.observations[0], firstObservedMs: Number.NaN }] },
    },
    { ...input, window: { ...input.window, finishedMs: Number.NaN } },
  ])
    expect(() => joinOriginalGcpInsertSource(changed as never)).toThrow();
});

async function vmJoinFixture(
  change: Record<string, unknown> = {},
  audit?: (vm: Record<string, unknown>) => unknown[],
  versionBinding = binding,
  googleVersion = '8.10.0',
) {
  const input = sourceJoinFixture(versionBinding, googleVersion);
  const source = joinOriginalGcpInsertSource(
    googleVersion === '8.11.0'
      ? { ...input, window: { ...input.window, schemaVersion: 4, kind: 'original-provider-stderr-verified-window' } }
      : input,
  );
  if (source.targetId === null) throw new Error('Original numeric fixture target required');
  const initial = requestFixture();
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

test('independent operation and VM evidence bind one original numeric incarnation, metadata and interfaces', async () => {
  const input = await vmJoinFixture();
  const joined = await joinOriginalGcpVmEvidence(input);
  expect(joined.instanceId).toBe(input.instance.value.id);
  expect(joined.instanceId === input.source.targetId).toBe(true);
  expect(joined.operationId).toBe(input.source.operationId);
  expect(joined.bootstrapSha256).toBe(input.source.bootstrapSha256);
  expect(joined.interfaces[0].name).toBe('nic0');
  expect(joined.interfaces[0].address).toBe('10.1.0.2');
  expect(joined.cloudEvidenceCorroborated).toBe(true);
  expect(joined.originalInsertQualified).toBe(false);
  expect(JSON.stringify(joined)).not.toContain('example-private-bootstrap');
});

test('numeric replacement, bootstrap mismatch, service accounts and foreign NICs refuse VM correlation', async () => {
  for (const change of [
    { id: '18446744073709551612' },
    {
      metadata: {
        items: [
          { key: 'VmDnsSetting', value: 'ZonePreferred' },
          { key: 'user-data', value: 'foreign-bootstrap' },
        ],
      },
    },
    { serviceAccounts: [{ email: 'default' }] },
    {
      networkInterfaces: [
        {
          name: 'nic0',
          networkIP: '10.1.0.2',
          network: 'projects/example-project/global/networks/foreign-network',
          subnetwork: requestFixture().networkInterfaces[0].subnetwork,
        },
      ],
    },
  ]) {
    const input = await vmJoinFixture(change);
    await expect(joinOriginalGcpVmEvidence(input)).rejects.toThrow();
  }
});

test('copied or foreign reader evidence cannot substitute an original operation or VM', async () => {
  const input = await vmJoinFixture();
  await expect(joinOriginalGcpVmEvidence({ ...input, instance: { ...input.instance } })).rejects.toThrow();
  const foreign = await vmJoinFixture();
  await expect(joinOriginalGcpVmEvidence({ ...input, operation: foreign.operation })).rejects.toThrow();
});

async function auditJoinFixture(
  change?: (entries: Record<string, unknown>[]) => unknown[],
  versionBinding = binding,
  googleVersion = '8.10.0',
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
          request: { '@type': 'example.insert', name: node, labels: requestFixture().labels, canIpForward: true },
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
  );
  const audit = await input.reader.insertAudit(zone, node, {
    after: new Date(input.absent.startedAt - 1000).toISOString(),
    before: new Date(Date.now() + 1000).toISOString(),
  });
  return { ...input, audit };
}

test('original audit first/last entries join operation name, numeric incarnation and principal without omitted bootstrap fields', async () => {
  const input = await auditJoinFixture();
  const candidate = await joinOriginalGcpInsertAuditEvidence(input);
  expect(candidate.auditCorroborated).toBe(true);
  expect(candidate.instanceId === input.source.targetId).toBe(true);
  expect(candidate.operationName).toBe(input.source.operationName);
  expect(candidate.auditQuerySha256).toBe(input.audit.querySha256);
  expect(candidate.requestReasonSha256).toBe(input.source.requestReasonSha256);
  expect(candidate.originalInsertQualified).toBe(false);
  expect(candidate.applyRpcQualified).toBe(false);
  expect(JSON.stringify(candidate)).not.toContain('principal@example.com');
  expect(JSON.stringify(candidate)).not.toContain('example-private-bootstrap');
});

test('omitted audit reason remains a concrete refusal rather than inferred request attribution', async () => {
  const input = await auditJoinFixture(([first, last]) => {
    const payload = first.protoPayload as Record<string, unknown>;
    return [{ ...first, protoPayload: { ...payload, requestMetadata: { requestAttributes: {} } } }, last];
  });
  await expect(joinOriginalGcpInsertAuditEvidence(input)).rejects.toThrow('request reason');
});

test('numeric audit operation id, foreign principal, replaced VM and failed terminal status refuse', async () => {
  const changes = [
    (entries: Record<string, unknown>[]) =>
      entries.map((entry) => ({ ...entry, operation: { ...(entry.operation as object), id: operationFixture().id } })),
    (entries: Record<string, unknown>[]) =>
      entries.map((entry) => ({
        ...entry,
        protoPayload: {
          ...(entry.protoPayload as object),
          authenticationInfo: { principalEmail: 'foreign@example.com' },
        },
      })),
    (entries: Record<string, unknown>[]) =>
      entries.map((entry) => ({
        ...entry,
        resource: { type: 'gce_instance', labels: { project_id: project, zone, instance_id: '18446744073709551612' } },
      })),
    ([first, last]: Record<string, unknown>[]) => [
      first,
      { ...last, protoPayload: { ...(last.protoPayload as object), status: { code: 7 } } },
    ],
    ([first, last]: Record<string, unknown>[]) => [
      first,
      { ...last, operation: { ...(last.operation as object), last: false } },
    ],
  ];
  for (const change of changes) {
    const input = await auditJoinFixture(change);
    await expect(joinOriginalGcpInsertAuditEvidence(input)).rejects.toThrow();
  }
});

test('copied audit batch or audit from a different reader cannot corroborate an original insert', async () => {
  const input = await auditJoinFixture();
  await expect(joinOriginalGcpInsertAuditEvidence({ ...input, audit: { ...input.audit } })).rejects.toThrow('original');
  const other = await auditJoinFixture();
  await expect(joinOriginalGcpInsertAuditEvidence({ ...input, audit: other.audit })).rejects.toThrow('original');
});

test('audit response cannot substitute another target path or zone behind matching numeric ids', async () => {
  for (const changed of [
    { targetLink: operationFixture().targetLink.replace(node, 'foreign-node') },
    { zone: operationFixture().zone.replace(zone, 'us-central1-b') },
    { selfLink: `${operationFixture().selfLink}?foreign=1` },
  ]) {
    const input = await auditJoinFixture(([first, last]) => {
      const payload = first.protoPayload as Record<string, unknown>;
      return [
        { ...first, protoPayload: { ...payload, response: { ...(payload.response as object), ...changed } } },
        last,
      ];
    });
    await expect(joinOriginalGcpInsertAuditEvidence(input)).rejects.toThrow();
  }
});

test('absent first audit metadata reports the missing request reason while sparse final metadata remains supported', async () => {
  const missing = await auditJoinFixture(([first, last]) => {
    const payload = first.protoPayload as Record<string, unknown>;
    return [{ ...first, protoPayload: { ...payload, requestMetadata: undefined } }, last];
  });
  await expect(joinOriginalGcpInsertAuditEvidence(missing)).rejects.toThrow('request reason');
  const sparse = await auditJoinFixture(([first, last]) => [
    first,
    {
      ...last,
      protoPayload: {
        ...(last.protoPayload as object),
        requestMetadata: { callerSuppliedUserAgent: 'example-terraform' },
      },
    },
  ]);
  expect((await joinOriginalGcpInsertAuditEvidence(sparse)).auditCorroborated).toBe(true);
});

const google811 = {
  terraformVersion: '1.17.1',
  providerLockSha256: 'c3c6fb09abfd85ce60f31e91fb3ef14b5d30d2ae67680c499c7f4003fcbcaf14',
};

test('authenticated Google 8.11 map-based insert projection preserves original bodies and grants no execution', () => {
  const request = {
    ...requestFixture(),
    params: {},
    serviceAccounts: [],
    disks: [{ boot: true, autoDelete: false, source: `projects/${project}/zones/${zone}/disks/${node}` }],
  };
  const bodies = capture(request, operationFixture(), google811, '8.11.0');
  const candidate = inspectOriginalGcpInsertBodies(bodies, google811);
  expect(candidate.nodeName).toBe(node);
  expect(candidate.requestBodySha256).toBe(bodies.requestBodySha256);
  expect(candidate.originalInsertQualified).toBe(false);
  expect(candidate.applyRpcQualified).toBe(false);
  expect(() => inspectOriginalGcpInsertBodies({ ...bodies }, google811)).toThrow('original');
});

test('Google 8.11 source correspondence requires its exact provider executable and completed version4 window', () => {
  const original = sourceJoinFixture(google811, '8.11.0');
  const window = {
    ...original.window,
    schemaVersion: 4 as const,
    kind: 'original-provider-stderr-verified-window' as const,
  };
  const joined = joinOriginalGcpInsertSource({ ...original, window });
  expect(joined.sourceCorroborated).toBe(true);
  expect(joined.originalInsertQualified).toBe(false);
  expect(() => joinOriginalGcpInsertSource(original)).toThrow('window');
  const wrong = {
    ...window,
    observations: [
      {
        ...window.observations[0],
        candidate: {
          ...window.observations[0].candidate,
          executable_sha256: 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9',
        },
      },
    ],
  };
  expect(() => joinOriginalGcpInsertSource({ ...original, window: wrong })).toThrow();
});

test('Google 8.11 rejects missing bootstrap, accounts, wrong-engine labels and provider family substitution', () => {
  for (const request of [
    { ...requestFixture(), serviceAccounts: [{ email: 'default' }] },
    { ...requestFixture(), metadata: { items: [] } },
    { ...requestFixture(), labels: { ...requestFixture().labels, 'xcsh-engine': 'native' } },
  ])
    expect(() =>
      inspectOriginalGcpInsertBodies(capture(request, operationFixture(), google811, '8.11.0'), google811),
    ).toThrow();
  expect(() => inspectOriginalGcpInsertBodies(capture(), google811)).toThrow();
});

test('Google 8.11 VM and audit joins require original numeric identity, bootstrap, NICs and reason', async () => {
  const input = await auditJoinFixture(undefined, google811, '8.11.0');
  expect((await joinOriginalGcpVmEvidence(input)).cloudEvidenceCorroborated).toBe(true);
  expect((await joinOriginalGcpInsertAuditEvidence(input)).auditCorroborated).toBe(true);
  await expect(joinOriginalGcpVmEvidence({ ...input, instance: { ...input.instance } })).rejects.toThrow();
  const changed = await vmJoinFixture({ id: '18446744073709551612' }, undefined, google811, '8.11.0');
  await expect(joinOriginalGcpVmEvidence(changed)).rejects.toThrow();
  const noReason = await auditJoinFixture(
    ([first, last]) => [
      { ...first, protoPayload: { ...(first.protoPayload as object), requestMetadata: { requestAttributes: {} } } },
      last,
    ],
    google811,
    '8.11.0',
  );
  await expect(joinOriginalGcpInsertAuditEvidence(noReason)).rejects.toThrow('request reason');
});
