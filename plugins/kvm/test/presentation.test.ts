import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';
import { KVM_SMSV2_CONTROLLER } from '../src/tools';

type PluginSection = ReturnType<typeof presentation.data>[number];
const tool = (action: string) => presentTool({ name: `kvm_smsv2_${action}`, label: `KVM ${action}` }, presentation);
const result = (action: string, data: unknown, extra = {}) => {
  const details = {
    schemaVersion: 'kvm.smsv2/v3',
    controllerVersion: '3.0.2',
    action,
    ok: true,
    result: data,
    ...extra,
  };
  return { details, content: [{ type: 'text', text: JSON.stringify(details) }] };
};
const view = (action: string, data: unknown, expanded = false) =>
  tool(action).presentation.result(result(action, data), { expanded, isPartial: false }, {});
const values = (v: ReturnType<typeof view>) =>
  Object.assign({}, ...(v.sections ?? []).filter((s) => s.kind === 'fields').map((s) => s.values));

test('readiness summarizes state, consequential checks and capacity units', () => {
  const v = view('readiness', {
    state: 'setup_required',
    checks: {
      coreReady: false,
      platform: true,
      capacity: { cpu: 0, memoryGiB: 0, diskFreeGiB: 0, ready: false },
      lan: { bridgeReady: false, gap: 'Review wired ownership.' },
    },
  });
  expect(v.summary).toBe('KVM host requires setup');
  expect(values(v)).toMatchObject({
    State: 'setup_required',
    'Core ready': false,
    'Bridge ready': false,
    'CPU count': 0,
    'Memory (GiB)': 0,
    'Free disk (GiB)': 0,
    'LAN guidance': 'Review wired ownership.',
  });
  expect(
    (v.sections ?? [])
      .filter(
        (s): s is Extract<PluginSection, { kind: 'fields' }> => s.kind === 'fields' && s.title === 'Host readiness',
      )
      .every((s) => s.previewFields === 'all'),
  ).toBe(true);
});
test('call declares exact controller argv including params and effective scope', () => {
  const args = { siteName: "synthetic ' site", applicationNamespace: '' };
  const v = tool('deploy').presentation.call(args, { expanded: false, isPartial: false });
  expect(v.sections?.find((s) => s.kind === 'code')?.argv).toEqual([
    KVM_SMSV2_CONTROLLER,
    '--json',
    'deploy',
    '--params',
    JSON.stringify(args),
  ]);
  const empty = tool('readiness').presentation.call({ ignored: true }, { expanded: false, isPartial: false });
  expect(empty.sections?.find((s) => s.kind === 'code')?.argv).toEqual([
    KVM_SMSV2_CONTROLLER,
    '--json',
    'readiness',
    '--params',
    '{}',
  ]);
});
test('status retains acceptance, identity, traffic counts and absent resources', () => {
  const v = view('status', {
    siteName: '',
    accepted: false,
    zeroChange: false,
    traffic: { samples: 0, successes: 0 },
    domains: [{ name: 'example', owned: false, state: 'absent' }],
  });
  expect(v.summary).toBe('KVM deployment requires review');
  expect(values(v)).toMatchObject({
    'Site name': '',
    Accepted: false,
    'Zero change': false,
    'Traffic samples': 0,
    'Successful samples': 0,
  });
  const table = v.sections?.find(
    (s): s is Extract<PluginSection, { kind: 'table' }> => s.kind === 'table' && s.title === 'Domains',
  );
  expect(table?.previewRows).toBe(12);
  expect(table?.rows).toEqual([{ name: 'example', owned: false, state: 'absent' }]);
  expect(table?.columns.map((c) => c.label)).toEqual(['Name', 'State', 'Owned']);
});
test('expanded evidence and literal guidance appear once; opaque results retain fallback', () => {
  const r = result('status', { accepted: false, unknown: null, empty: '', zeros: [0, false] });
  const v = tool('status').presentation.result(r, { expanded: true, isPartial: false }, {});
  expect(v.expandedEvidence).toBe('provided');
  expect(v.sections).toEqual([
    ...presentation.data(r.details, 'Complete safe evidence'),
    { kind: 'code', title: 'Complete operator guidance', text: r.content[0].text },
  ]);
  const malformed = {
    content: [{ type: 'text', text: 'opaque evidence' }],
    details: { schemaVersion: 'wrong', ok: true },
  };
  expect(
    tool('status').presentation.result(malformed, { expanded: false, isPartial: false }, {}).expandedEvidence,
  ).not.toBe('provided');
});
test('error and unknown acceptance preserve corrective text and do not imply success', () => {
  const details = {
    schemaVersion: 'kvm.smsv2/v3',
    controllerVersion: '3.0.2',
    action: 'status',
    ok: false,
    error: 'Inspect the ownership receipt before retry.',
  };
  const r = { content: [{ type: 'text', text: details.error }], details, isError: true };
  const v = tool('status').presentation.result(r, { expanded: false, isPartial: false }, {});
  expect(v.summary).toBe('KVM status failed; corrective action required');
  expect(values(v)).toMatchObject({ Error: details.error, OK: false });
  expect((v.sections ?? []).filter((s) => s.kind === 'code' && s.text === details.error)).toHaveLength(1);
  expect(view('status', {}).summary).toBe('KVM acceptance unknown');
});
test('all mutating fixture outcomes distinguish completion and keep safe evidence', () => {
  for (const action of ['deploy', 'reconcile']) {
    expect(view(action, { status: { siteName: 'example', accepted: true, zeroChange: true } }).summary).toBe(
      'KVM deployment accepted',
    );
    expect(view(action, { status: { accepted: false } }).summary).toBe('KVM deployment requires review');
  }
  const v = view('destroy', { remainingOwned: [], bridgeRestored: false, siteName: 'example' });
  expect(v.summary).toBe('KVM removal requires review');
  expect(values(v)).toMatchObject({ 'Remaining owned count': 0, 'Bridge restored': false });
  expect(view('destroy', { remainingOwned: [], bridgeRestored: true }).summary).toBe('KVM owned resources removed');
});

test('real controller domain maps expose every named VM with twelve-row preview', () => {
  const domains = Object.fromEntries(
    Array.from({ length: 13 }, (_, i) => [`synthetic-vm-${i}`, i === 0 ? '' : 'running']),
  );
  const v = view('status', { domains, accepted: false });
  expect(v.sections?.find((s) => s.kind === 'table')).toMatchObject({
    previewRows: 12,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'state', label: 'State' },
    ],
    rows: Object.entries(domains).map(([name, state]) => ({ name, state })),
  });
  expect(JSON.stringify(view('status', { domains }, true))).toContain('synthetic-vm-12');
});
test('service enabled failures remain visible beside active checks', () => {
  const v = view('readiness', {
    state: 'setup_required',
    checks: {
      services: { libvirt: { active: true, enabled: false } },
      terraform: { ready: false, requiredVersion: '1.14.3' },
    },
  });
  expect(v.sections?.find((s) => s.kind === 'table')).toMatchObject({
    rows: [
      { check: 'services.libvirt.active', ready: true },
      { check: 'services.libvirt.enabled', ready: false },
      { check: 'terraform.ready', ready: false },
      { check: 'terraform.requiredVersion', ready: '1.14.3' },
    ],
  });
});
test('partial or contradictory results never declare completed acceptance', () => {
  const r = result('status', { accepted: true });
  expect(tool('status').presentation.result(r, { expanded: false, isPartial: true }, {}).summary).toBe(
    'KVM status in progress; outcome pending',
  );
  expect(
    tool('status').presentation.result({ ...r, isError: true }, { expanded: false, isPartial: false }, {})
      .expandedEvidence,
  ).not.toBe('provided');
  expect(
    tool('status').presentation.result({ ...r, content: [{ type: 'image' }] }, { expanded: true, isPartial: false }, {})
      .expandedEvidence,
  ).not.toBe('provided');
});

test('declared Bash and Zsh commands reconstruct exact argv using a harmless executable', () => {
  const args = { siteName: "synthetic ' $value `literal`\nline", applicationNamespace: '' };
  const declared = tool('deploy')
    .presentation.call(args, { expanded: false, isPartial: false })
    .sections?.find((s) => s.kind === 'code');
  expect(declared?.kind).toBe('code');
  if (declared?.kind !== 'code' || !declared.argv) throw new Error('Missing declared argv');
  const harmless = presentation.command([
    'python3',
    '-c',
    'import json,sys; print(json.dumps(sys.argv[1:]))',
    ...declared.argv,
  ]);
  for (const shell of ['bash', 'zsh']) {
    const executed = Bun.spawnSync([shell, '-c', harmless.text], { stdout: 'pipe', stderr: 'pipe' });
    expect(executed.exitCode).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(executed.stdout))).toEqual(declared.argv);
  }
});

test('opaque text without details remains complete and uses automatic evidence fallback', () => {
  const text = '{"total":0,"enabled":false,"missing":null}';
  const v = tool('status').presentation.result(
    { content: [{ type: 'text', text }] },
    { expanded: false, isPartial: false },
    {},
  );
  expect(JSON.stringify(v)).toContain('total');
  expect(JSON.stringify(v)).toContain('false');
  expect(JSON.stringify(v)).toContain('null');
  expect(v.sections?.find((s) => s.kind === 'code')).toMatchObject({ text });
  expect(v.expandedEvidence).not.toBe('provided');
});
