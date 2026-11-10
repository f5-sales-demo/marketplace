import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { GoogleHttpRpcTraceParser } from '../src/gcp-http-rpc-trace';
import { inspectOriginalGcpInsertBodies, joinOriginalGcpInsertSource } from '../src/gcp-insert-evidence';

const binding = {
  terraformVersion: '1.17.1',
  providerLockSha256: '2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
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
function capture(request: unknown = requestFixture(), response: unknown = operationFixture()) {
  const row = (message: string, fields = {}) =>
    `${JSON.stringify({
      '@timestamp': '2026-11-10T10:00:00Z',
      '@level': 'debug',
      '@module': 'provider.terraform-provider-google_v8.10.0_x5',
      '@message': message,
      ...fields,
    })}\n`;
  const rpc = (message: string) => row(message, { '@module': 'sdk.proto', '@level': 'trace', ...identity });
  const end = row('-----------------------------------------------------');
  const parser = new GoogleHttpRpcTraceParser(scope, binding);
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

function sourceJoinFixture() {
  const insert = inspectOriginalGcpInsertBodies(capture(), binding);
  const providerPath = '/example/provider/terraform-provider-google_v8.10.0_x5';
  const parent = { pid: 1234, group: 1234, start: '100', boot: '11111111-2222-3333-4444-555555555555' };
  const provider = {
    pid: 2345,
    parent: 1234,
    group: 1234,
    start: '200',
    boot: parent.boot,
    executable_sha256: 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9',
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
    providerLockSha256: binding.providerLockSha256,
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
    binding,
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
