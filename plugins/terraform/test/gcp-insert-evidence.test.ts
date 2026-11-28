import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { joinOriginalGcpInsertAuditEvidence } from '../src/gcp-insert-audit-evidence';
import { inspectOriginalGcpInsertBodies, joinOriginalGcpInsertSource } from '../src/gcp-insert-evidence';
import { joinOriginalGcpVmEvidence } from '../src/gcp-vm-evidence';
import {
  auditJoinFixture,
  binding,
  capture,
  node,
  operationFixture,
  project,
  requestFixture,
  sourceJoinFixture,
  vmJoinFixture,
  zone,
} from './fixtures/gcp-insert.fixture';

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
