import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { execGcloudJson } from '../src/gcloud/exec';
import { presentTool } from '../src/presentation';

const options = { expanded: false, isPartial: false };
const result = (details: unknown, text = 'SYNTHETIC_CLI_MARKER') => ({ content: [{ type: 'text', text }], details });
test('project previews declare twelve rows, exact JSON argv and one expanded evidence copy', () => {
  const projectIds = [
    'example-project-0',
    'example-project-1',
    'example-project-2',
    'example-project-3',
    'example-project-4',
    'example-project-5',
    'example-project-6',
    'example-project-7',
    'example-project-8',
    'example-project-9',
    'example-project-10',
    'example-project-11',
    'example-project-12',
  ];
  const rows = Array.from({ length: 13 }, (_, i) => ({
    projectId: projectIds[i],
    name: '',
    projectNumber: String(i),
    lifecycleState: 'ACTIVE',
  }));
  const tool = presentTool({ name: 'gcloud_projects_list' }, presentation);
  const args = { filter: 'name="Example $literal"', limit: 13 };
  const view = tool.presentation.result(result({ projects: rows }), options, args);
  expect(view.sections.find((s) => s.kind === 'table')).toMatchObject({ previewRows: 12, rows });
  expect(view.sections.find((s) => s.kind === 'code')?.argv).toEqual([
    'gcloud',
    'projects',
    'list',
    '--filter=name="Example $literal"',
    '--limit=13',
    '--format=json',
  ]);
  const expanded = tool.presentation.result(result({ projects: rows }), { ...options, expanded: true }, args);
  expect(expanded.expandedEvidence).toBe('provided');
  expect(JSON.stringify(expanded).match(/example-project-12/g)).toHaveLength(1);
});
test('config identity keeps every field, empty strings, zero and false', () => {
  const values = { project: '', account: '', region: 'unknown', zone: '', zero: 0, enabled: false };
  const view = presentTool({ name: 'gcloud_config_list' }, presentation).presentation.result(
    result({ config: values }),
    options,
    {},
  );
  expect(view.sections.find((s) => s.kind === 'fields' && s.title === 'Configuration identity')).toMatchObject({
    values,
    previewFields: 'all',
  });
});
test('malformed and opaque results keep automatic evidence and literal guidance', () => {
  for (const name of ['gcloud_projects_list', 'gcp_ce_plan', 'gcp_ce_inventory', 'gcloud_exec']) {
    const view = presentTool({ name }, presentation).presentation.result(
      result(
        { projects: [null], plan: { wrong: true }, fullOutput: 'opaque' },
        'Run exactly: xcsh plugin setup gcloud',
      ),
      options,
      {},
    );
    expect(view.expandedEvidence).not.toBe('provided');
    expect(JSON.stringify(view)).toContain('Run exactly: xcsh plugin setup gcloud');
  }
});
test('JSON helper preserves projected JSON and rejects non-JSON formats before execution', async () => {
  const calls: string[][] = [];
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return { stdout: '[]', stderr: '', exitCode: 0 };
    },
  };
  const args = ['compute', 'instances', 'list', '--format=json(id,name,zone,status,labels)'];
  await execGcloudJson(api, args);
  expect(calls[0]).toEqual(args);
  await expect(execGcloudJson(api, ['projects', 'list', '--format=csv'])).rejects.toThrow('JSON');
  expect(calls).toHaveLength(1);
});
test('discovery summarizes counts and units; unavailable plans retain false and prerequisites', () => {
  const discovery = {
    schemaVersion: 1,
    project: 'synthetic',
    region: 'us-central1',
    billingEnabled: false,
    images: [],
    machineTypes: [{ name: 'synthetic', zone: 'us-central1-a', guestCpus: 0, memoryMb: 0 }],
    enabledApis: [],
    quotas: [{ metric: 'CPUS', limit: 0, usage: 0 }],
    checks: { iam: 'unknown' },
    receipts: [],
  };
  const view = presentTool({ name: 'gcp_compute_discover' }, presentation).presentation.result(
    result({ discovery }),
    options,
    {},
  );
  expect(view.sections.find((s) => s.title === 'Compute readiness')).toMatchObject({
    previewFields: 'all',
    values: { 'Billing enabled': false, Images: 0, 'Machine types': 1, IAM: 'unknown' },
  });
  expect(view.sections.find((s) => s.title === 'Machine types')?.columns).toContainEqual({
    key: 'memoryMb',
    label: 'Memory (MB)',
  });
  const plan = {
    schemaVersion: 1,
    planHash: 'synthetic-hash',
    executable: false,
    approval: 'not-requested',
    unavailable: ['synthetic prerequisite'],
    actions: [],
    intent: { diskGiB: 0 },
    engine: 'native',
  };
  const planned = presentTool({ name: 'gcp_ce_plan' }, presentation).presentation.result(
    result({ availability: 'unavailable', plan }),
    options,
    {},
  );
  expect(planned.sections.find((s) => s.title === 'Customer Edge readiness plan')).toMatchObject({
    values: { Executable: false, 'Disk (GiB)': 0, Prerequisites: ['synthetic prerequisite'] },
  });
});
test('typed previews equal executed argv including help whitespace and literal filters', async () => {
  const { Type } = await import('@sinclair/typebox');
  const { createGcloudProjectsListTool } = await import('../src/tools/gcloud-projects-list');
  const { createGcloudComputeInstancesListTool } = await import('../src/tools/gcloud-compute-instances-list');
  const { createGcloudStorageBucketsListTool } = await import('../src/tools/gcloud-storage-buckets-list');
  const { createGcloudHelpTool } = await import('../src/tools/gcloud-help');
  const calls: string[][] = [];
  const api = () => ({
    exec: async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: '[]', stderr: '', exitCode: 0 };
    },
  });
  const cases = [
    [createGcloudProjectsListTool({ typebox: { Type } }, api), { filter: 'name="$literal"', limit: 1 }],
    [createGcloudComputeInstancesListTool({ typebox: { Type } }, api), { zone: 'us-central1-a', limit: 2 }],
    [createGcloudStorageBucketsListTool({ typebox: { Type } }, api), { filter: 'location=US' }],
    [createGcloudHelpTool({ typebox: { Type } }, api), { command_path: ' compute  instances ' }],
  ] as const;
  for (const [tool, input] of cases) {
    await tool.execute('synthetic', input as never, undefined, undefined, { cwd: '/synthetic' });
    const executed = calls.at(-1);
    if (!executed) throw new Error('Expected typed command execution');
    expect(
      presentTool(tool, presentation)
        .presentation.call(input, options)
        .sections.find((s) => s.kind === 'code')?.argv,
    ).toEqual(['gcloud', ...executed]);
  }
});
for (const shell of ['bash', 'zsh']) {
  (Bun.which(shell) ? test : test.skip)(`literal argv reconstructs in ${shell}`, async () => {
    const { execFileSync } = await import('node:child_process');
    const args = ['', "quote'", '$literal', '`literal`', '|', ';', '☁', 'line\nbreak'];
    const command = presentation.command(['synthetic_harmless', ...args]).text;
    const bytes = execFileSync(shell, ['-c', `synthetic_harmless() { printf '%s\\0' "$@"; }; ${command}`]);
    expect(bytes.toString().split('\0').slice(0, -1)).toEqual(args);
  });
}
test('generic execution retains classified authentication corrective guidance', async () => {
  const { Type } = await import('@sinclair/typebox');
  const { createGcloudExecTool } = await import('../src/tools/gcloud-exec');
  const tool = createGcloudExecTool({ typebox: { Type } }, () => ({
    exec: async () => ({ stdout: '', stderr: 'invalid_grant: synthetic expired session', exitCode: 1 }),
  }));
  const outcome = await tool.execute('synthetic', { args: ['projects', 'list'] }, undefined, undefined, {
    cwd: '/synthetic',
  });
  expect(outcome.isError).toBe(true);
  expect(outcome.details.errorType).toBe('session_expired');
  expect(outcome.content[0].text).toContain('Run: xcsh plugin setup gcloud');
});
