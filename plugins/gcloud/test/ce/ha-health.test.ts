import { expect, it } from 'bun:test';
import { GCP_CE_API_RELEASE, qualifiedGcpHaObservationMappings } from '../../src/ce/contract';
import { fingerprint } from '../../src/ce/discovery';
import { evaluateGcpHaHealth, GCP_HA_HEALTH_SEMANTICS } from '../../src/ce/health';

function fixture() {
  const expected = ['node-a', 'node-b', 'node-c'].map((nodeName, n) => ({ nodeName, instanceId: String(n + 1) }));
  const collection = {
    schemaVersion: 1 as const,
    siteName: 'site-a',
    siteIdentitySha256: `sha256:${'a'.repeat(64)}`,
    ownedNodes: expected,
    ownershipFingerprint: fingerprint(expected),
    contractFingerprint: 'contract-a',
    startedAt: '2026-10-19T18:00:00.000Z',
    finishedAt: '2026-10-19T18:00:01.000Z',
    componentStatus: {
      available: true as const,
      observedAt: '2026-10-19T18:00:00.100Z',
      receiptHash: `sha256:${'b'.repeat(64)}`,
      value: { status: expected.map((n) => ({ node: n.nodeName, name: 'service', status: 'Ready', message: '' })) },
    },
    serviceInventory: {
      available: true as const,
      observedAt: '2026-10-19T18:00:00.200Z',
      receiptHash: `sha256:${'c'.repeat(64)}`,
      value: { service: expected.map((n) => ({ node: n.nodeName, value: 'service', name: 'Display Name' })) },
    },
    globalHealth: {
      available: true as const,
      observedAt: '2026-10-19T18:00:00.300Z',
      receiptHash: `sha256:${'d'.repeat(64)}`,
      value: { hostname: 'node-a', state: 'PROVISIONED' },
    },
  };
  const contract = { ...GCP_HA_HEALTH_SEMANTICS, evidenceSha256: `sha256:${'e'.repeat(64)}` };
  return { expected, collection, contract };
}
function evaluate(f = fixture(), contract: unknown = f.contract) {
  for (const key of ['componentStatus', 'serviceInventory', 'globalHealth'] as const)
    f.collection[key].receiptHash = fingerprint(f.collection[key].value);
  return evaluateGcpHaHealth(f.collection, f.expected, 'contract-a', contract, Date.parse('2026-10-19T18:00:10.000Z'));
}
it('requires owning completeness semantics even with all returned components Ready', () => {
  const f = fixture();
  expect(evaluate(f, null).status).toBe('unknown');
  expect(evaluate(f, null).reasonCodes).toContain('health-contract-unqualified');
  expect(evaluate(f).status).toBe('healthy');
});
it('does not join display names, drop required services or deduplicate identities', () => {
  for (const change of ['display', 'missing', 'duplicate', 'foreign']) {
    const f = fixture();
    if (change === 'display') f.collection.serviceInventory.value.service[0].value = 'Display Name';
    if (change === 'missing') f.collection.componentStatus.value.status.pop();
    if (change === 'duplicate')
      f.collection.serviceInventory.value.service.push(f.collection.serviceInventory.value.service[0]);
    if (change === 'foreign') f.collection.componentStatus.value.status[0].node = 'replacement';
    expect(evaluate(f).status).toBe('unknown');
  }
});
it('rejects incomplete nodes, replaced IDs, stale evidence and changed contract bindings', () => {
  for (const change of ['missing-node', 'replaced', 'stale', 'future', 'contract', 'bad-time']) {
    const f = fixture();
    if (change === 'missing-node') f.collection.ownedNodes.pop();
    if (change === 'replaced') f.collection.ownedNodes[0].instanceId = '99';
    if (change === 'stale') f.collection.startedAt = '2026-10-19T17:00:00.000Z';
    if (change === 'future') f.collection.finishedAt = '2026-10-19T19:00:00.000Z';
    if (change === 'bad-time') f.collection.componentStatus.observedAt = 'broken';
    if (change === 'contract') f.collection.contractFingerprint = 'changed';
    expect(evaluate(f).status).toBe('unknown');
  }
});
it('reports unhealthy states separately and applies global health only to its exact hostname', () => {
  const f = fixture();
  f.collection.componentStatus.value.status[1].status = 'NotReady';
  expect(evaluate(f).status).toBe('degraded');
  expect(evaluate(f).nodes[1].status).toBe('degraded');
  expect(evaluate(f).nodes[2].status).toBe('healthy');
  f.collection.globalHealth.value.state = 'PROVISIONING';
  expect(evaluate(f).nodes[0].status).toBe('degraded');
  f.collection.globalHealth.value.hostname = 'node-a.other';
  expect(evaluate(f).status).toBe('unknown');
});
it('transport failures, partial lists and malformed responses cannot reuse successful reads', () => {
  const f = fixture();
  for (const key of ['componentStatus', 'serviceInventory', 'globalHealth'] as const) {
    const failed = {
      ...f.collection,
      [key]: { available: false, observedAt: f.collection.startedAt, errorClass: 'timeout' },
    };
    expect(
      evaluateGcpHaHealth(failed, f.expected, 'contract-a', f.contract, Date.parse('2026-10-19T18:00:10Z')).status,
    ).toBe('unknown');
  }
  expect(evaluateGcpHaHealth({}, f.expected, 'contract-a', f.contract).status).toBe('unknown');
  const partial = {
    ...f.collection,
    serviceInventory: {
      ...f.collection.serviceInventory,
      value: { ...f.collection.serviceInventory.value, next_page_token: 'more' },
    },
  };
  expect(
    evaluateGcpHaHealth(partial, f.expected, 'contract-a', f.contract, Date.parse('2026-10-19T18:00:10Z')).status,
  ).toBe('unknown');
});
it('never projects free text, credentials, arbitrary service identifiers or caller error text', () => {
  const f = fixture();
  f.collection.componentStatus.value.status[0].message = 'secret@example.com';
  f.collection.serviceInventory.value.service[0].value = 'PRIVATE-TOKEN';
  const text = JSON.stringify(evaluate(f));
  expect(text).not.toContain('secret@example.com');
  expect(text).not.toContain('PRIVATE-TOKEN');
  expect(text).not.toContain('Display Name');
});
it('rejects altered healthy semantics or evidence-free contract promotion', () => {
  const f = fixture();
  for (const contract of [
    { ...f.contract, healthyState: 'Running' },
    { ...f.contract, completeInventory: false },
    { ...f.contract, evidenceSha256: undefined },
    { ...f.contract, excludedServices: ['service'] },
  ])
    expect(evaluate(f, contract).status).toBe('unknown');
});

it('rejects a response whose receipt no longer matches the collected body', () => {
  const f = fixture();
  evaluate(f);
  f.collection.componentStatus.value.status[0].status = 'NotReady';
  const result = evaluateGcpHaHealth(
    f.collection,
    f.expected,
    'contract-a',
    f.contract,
    Date.parse('2026-10-19T18:00:10Z'),
  );
  expect(result.status).toBe('unknown');
  expect(result.reasonCodes).toContain('componentStatus-receipt-mismatch');
});

it('scoped HA mappings require the exact immutable schema asset identity', () => {
  const asset = {
    name: 'openapi.json',
    digest: 'sha256:3738c3267be63ec2c82716bdf197f7633b8845692ea7fe72e5a11bf2b8d10b77',
    browser_download_url: `https://github.com/${GCP_CE_API_RELEASE.repository}/releases/download/${GCP_CE_API_RELEASE.tag}/openapi.json`,
  };
  expect(qualifiedGcpHaObservationMappings([asset])?.serviceInventory).toContain('/list-service');
  for (const assets of [
    null,
    [],
    [asset, asset],
    [{ ...asset, digest: 'changed' }],
    [{ ...asset, browser_download_url: 'https://example.test/openapi.json' }],
  ])
    expect(qualifiedGcpHaObservationMappings(assets)).toBeUndefined();
});

it('malformed bindings and missing bodies remain unknown without projecting invalid timestamps', () => {
  const f = fixture();
  evaluate(f);
  const now = Date.parse('2026-10-19T18:00:10Z');
  for (const collection of [
    { ...f.collection, ownedNodes: undefined },
    { ...f.collection, componentStatus: { ...f.collection.componentStatus, value: undefined } },
    { ...f.collection, componentStatus: { ...f.collection.componentStatus, observedAt: 'private@example.com' } },
  ]) {
    const result = evaluateGcpHaHealth(collection, f.expected, 'contract-a', f.contract, now);
    expect(result.status).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('private@example.com');
  }
});

it('cannot qualify a shrinking Secure Mesh inventory or ignore identical voucher rows', () => {
  const f = fixture();
  const missing = ['coredns', 'kube-proxy', 'vector-agent', 'voucher'];
  for (const node of f.expected) {
    for (const service of missing)
      f.collection.serviceInventory.value.service.push({ node: node.nodeName, value: service, name: service });
    f.collection.serviceInventory.value.service.push({ node: node.nodeName, value: 'voucher', name: 'voucher' });
  }
  const expanded = evaluate(f);
  expect(expanded.status).toBe('unknown');
  expect(expanded.reasonCodes).toContain('service-inventory-duplicate-identity');
  expect(expanded.nodes.every((node) => node.requiredServices === 5 && node.coveredServices === 1)).toBe(true);
  f.collection.serviceInventory.value.service = f.collection.serviceInventory.value.service.filter(
    (row) => row.value === 'service',
  );
  const shrunk = evaluate(f, null);
  expect(shrunk.status).toBe('unknown');
  expect(shrunk.reasonCodes).toContain('health-contract-unqualified');
});
