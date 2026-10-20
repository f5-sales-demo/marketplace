import { expect, spyOn, test } from 'bun:test';
import { visibleWidth } from '@f5-sales-demo/pi-tui';
import { presentation } from '@f5-sales-demo/xcsh';
import { Type } from '@sinclair/typebox';
import { presentTool as aws } from '../../plugins/aws/src/presentation';
import { createAwsStsWhoamiTool } from '../../plugins/aws/src/tools/aws-sts-whoami';
import { presentTool as azure } from '../../plugins/azure/src/presentation';
import { createAzAccountShowTool } from '../../plugins/azure/src/tools/az-account-show';
import { presentTool as gcloud } from '../../plugins/gcloud/src/presentation';
import { createGcloudProjectsListTool } from '../../plugins/gcloud/src/tools/gcloud-projects-list';
import { presentTool as github } from '../../plugins/github/src/presentation';
import { GhSearchIssuesTool } from '../../plugins/github/src/tools/gh';
import * as git from '../../plugins/github/src/utils/git';
import { presentTool as gitlab } from '../../plugins/gitlab/src/presentation';
import { createGlabIssueListTool } from '../../plugins/gitlab/src/tools/glab-issue-list';
import { presentTool as kvm } from '../../plugins/kvm/src/presentation';
import { createKvmSmsv2Tools } from '../../plugins/kvm/src/tools';
import { presentTool as platform } from '../../plugins/platform/src/presentation';
import { createF5xcCeV2CapabilitiesTool } from '../../plugins/platform/src/tools/f5xc-ce-v2-capabilities';
import xorgFactory from '../../plugins/xorg/extensions/integration';
import zoomFactory from '../../plugins/zoom/extensions/integration';
import { ToolExecutionComponent } from './node_modules/@f5-sales-demo/xcsh/src/modes/components/tool-execution';
import { initTheme, setTheme } from './node_modules/@f5-sales-demo/xcsh/src/modes/theme/theme';

const pi = { typebox: { Type }, presentation };
const ctx = { cwd: '/synthetic-suite' };
const output = (data: unknown) => ({ stdout: JSON.stringify(data), stderr: '', exitCode: 0, code: 0, killed: false });
// Table wrapping continues a value vertically within the same column.
// Check complete ordered text, never combine words from adjacent columns.
function renderedContains(lines: string[], marker: string): boolean {
  const plain = lines.map((line) => Bun.stripANSI(line));
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
  if (normalize(plain.join(' ')).includes(normalize(marker))) return true;
  let columns: string[][] = [];
  const values: string[] = [];
  const flush = () => {
    for (const column of columns) if (column) values.push(normalize(column.join(' ')));
    columns = [];
  };
  for (const line of plain) {
    if (/[┌├└+][─-]/.test(line)) {
      flush();
      continue;
    }
    const cells = line.split('│');
    if (cells.length < 3) {
      flush();
      continue;
    }
    for (let i = 1; i < cells.length - 1; i++) {
      columns[i] ??= [];
      columns[i].push(cells[i].trim());
    }
  }
  flush();
  return values.some((value) => value.includes(normalize(marker)));
}
test('rendered markers retain complete ordered words within wrapped table columns', () => {
  const lines = ['│ 1 │ Synthetic │ OPEN │', '│   │ issue     │      │'];
  expect(renderedContains(lines, 'Synthetic issue')).toBe(true);
  expect(renderedContains(lines, 'Synthetic missing issue')).toBe(false);
  expect(renderedContains(lines, 'issue Synthetic')).toBe(false);
  expect(renderedContains(['│ Synthetic │ issue │'], 'Synthetic issue')).toBe(false);
  expect(renderedContains(['│ Synthetic │', '├───────────┤', '│ issue │'], 'Synthetic issue')).toBe(false);
});
async function verify(tool: any, args: unknown, marker: string) {
  const result = await tool.execute('synthetic-suite', args, undefined, undefined, ctx);
  expect(result.isError).not.toBe(true);
  const original = structuredClone(result);
  const c = new ToolExecutionComponent(tool.name, args, {}, tool, { requestRender() {} } as never);
  c.updateResult(result);
  for (const name of ['xcsh-dark', 'xcsh-light']) {
    await setTheme(name);
    for (const width of [40, 76, 120, 153]) {
      c.setExpanded(true);
      const lines = c.render(width);
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
      expect(renderedContains(lines, marker)).toBe(true);
      c.setExpanded(false);
      expect(c.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
    }
  }
  expect(result).toEqual(original);
  return result;
}
test('AWS identity execution keeps selected profile and actual identity evidence', async () => {
  await initTheme();
  const raw = { Account: '000000000000', UserId: 'synthetic-user', Arn: 'arn:aws:iam::000000000000:user/synthetic' };
  const tool = aws(
    createAwsStsWhoamiTool(pi, () => ({
      exec: async (_cmd, args) => {
        expect(args).toContain('synthetic-profile');
        return output(raw);
      },
    })),
    presentation,
  );
  await verify(tool, { profile: 'synthetic-profile' }, 'synthetic-user');
});
test('Azure subscription execution retains tenant and subscription context', async () => {
  const raw = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Synthetic subscription',
    state: 'Enabled',
    tenantId: 'example-tenant',
    isDefault: false,
  };
  const tool = azure(
    createAzAccountShowTool(pi, () => ({ exec: async () => output(raw) })),
    presentation,
  );
  await verify(tool, {}, 'Synthetic subscription');
});
test('Gcloud project execution labels returned records and preserves zero project numbers', async () => {
  const raw = [
    { projectId: 'example-project', projectNumber: '0', name: 'Synthetic project', lifecycleState: 'ACTIVE' },
  ];
  const tool = gcloud(
    createGcloudProjectsListTool(pi, () => ({ exec: async () => output(raw) })),
    presentation,
  );
  await verify(tool, { limit: 1 }, 'example-project');
});
test('GitHub search executes the real tool and retains structured scoped items', async () => {
  const rows = [
    {
      number: 1,
      title: 'Synthetic issue',
      state: 'OPEN',
      url: 'https://github.com/example/synthetic/issues/1',
      repository: { nameWithOwner: 'example/synthetic' },
      author: { login: 'synthetic' },
      labels: [],
      updatedAt: '2026-10-14',
    },
  ];
  const mock = spyOn(git.github, 'json').mockResolvedValue(rows);
  try {
    const tool = github(new GhSearchIssuesTool({ cwd: ctx.cwd } as never), presentation);
    const result = await verify(tool, { query: 'synthetic', repo: 'example/synthetic', limit: 1 }, 'Synthetic issue');
    expect(result.details.items).toEqual(rows);
    expect(result.details.repo).toBe('example/synthetic');
  } finally {
    mock.mockRestore();
  }
});
test('GitLab issue execution preserves returned issue scope with controlled CLI', async () => {
  const rows = [
    {
      id: 1,
      iid: 1,
      title: 'Synthetic GitLab issue',
      description: '',
      state: 'opened',
      labels: [],
      assignees: [],
      author: { username: 'synthetic' },
      milestone: null,
      created_at: '2026-10-14',
      updated_at: '2026-10-14',
      web_url: 'https://gitlab.com/example/synthetic/-/issues/1',
      references: { full: 'example/synthetic#1' },
      issue_type: 'issue',
    },
  ];
  const tool = gitlab(
    createGlabIssueListTool(pi, (cwd) => ({ cwd, exec: async () => output(rows) })),
    presentation,
  );
  await verify(tool, { project: 'example/synthetic', limit: 1 }, 'Synthetic GitLab issue');
});
test('KVM executes the advertised status tool against an injected controller', async () => {
  const tools = createKvmSmsv2Tools(pi as never, (action) => ({
    schemaVersion: 'kvm.smsv2/v3',
    controllerVersion: 'synthetic',
    action,
    ok: true,
    result: { state: 'ready', siteName: 'synthetic-site', instances: [{ name: 'synthetic-vm', enabled: false }] },
  }));
  const tool = tools.find((t) => t.name.endsWith('_status'))!;
  expect(tool).toBeDefined();
  await verify(kvm(tool, presentation), {}, 'synthetic-site');
});
test('platform capabilities execute without provisioning and expose independent support evidence', async () => {
  const capabilities = {
    smsv2ContractVersion: 'synthetic-contract',
    supportedProviders: ['aws', 'kvm'],
    awsSmsv2TgwConnect: { supported: false },
    kvmImageResolution: { id: 'synthetic-image', endpoint: 'https://example.com/image' },
  };
  const tool = platform(
    createF5xcCeV2CapabilitiesTool(pi, () => ({ capabilities: async () => capabilities }) as never),
    presentation,
  );
  await verify(tool, {}, 'synthetic-image');
});
for (const [name, factory, args, result] of [
  [
    'xorg',
    xorgFactory,
    { session: 'synthetic', command: 'window', action: 'list', params: {} },
    {
      schemaVersion: 'xorgctl/v1',
      ok: true,
      result: { windows: [{ id: 'synthetic-window', title: 'Synthetic window' }] },
    },
  ],
  ['zoom', zoomFactory, { action: 'status' }, { state: 'unavailable', reason: 'synthetic-desktop-unavailable' }],
] as const) {
  test(`${name} real factory uses controlled host output without a desktop mutation`, async () => {
    const tools: any[] = [];
    const mock = spyOn(Bun, 'spawnSync').mockReturnValue({
      exitCode: 0,
      stdout: new TextEncoder().encode(JSON.stringify(result)),
      stderr: new Uint8Array(),
    } as never);
    const which = spyOn(Bun, 'which').mockReturnValue('/synthetic/xorgctl');
    try {
      await factory({
        ...pi,
        setLabel() {},
        integrations: { register() {} },
        registerTool: (tool: any) => tools.push(tool),
        registerCommand() {},
      } as never);
      expect(tools).toHaveLength(1);
      await verify(tools[0], args, name === 'xorg' ? 'synthetic-window' : 'synthetic-desktop');
    } finally {
      mock.mockRestore();
      which.mockRestore();
    }
  });
}

import { resolve } from 'node:path';
import asmFactory from '../../plugins/asm-migration/src/index';

test('ASM validates actual synthetic policy input and retains local contract evidence', async () => {
  const tools: any[] = [];
  await asmFactory({
    presentation,
    typebox: { Type },
    setLabel() {},
    integrations: { register() {} },
    registerTool(tool: unknown) {
      tools.push(tool);
    },
  });
  const tool = tools.find((value) => value.name === 'asm_migration_validate');
  const result = await tool.execute(
    'synthetic-asm',
    { inputPath: 'test/fixtures/minimal-policy.xml', inputType: 'asm-policy' },
    undefined,
    undefined,
    { cwd: resolve(import.meta.dir, '../../plugins/asm-migration') },
  );
  expect(result.details.valid).toBe(true);
  const c = new ToolExecutionComponent(tool.name, { inputType: 'asm-policy' }, {}, tool, {
    requestRender() {},
  } as never);
  c.updateResult(result);
  c.setExpanded(true);
  for (const name of ['xcsh-dark', 'xcsh-light']) {
    await setTheme(name);
    for (const width of [40, 76, 120, 153]) {
      const lines = c.render(width);
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
      expect(lines.join('\n')).toContain('blocking');
    }
  }
});

import { CustomMessageComponent } from './node_modules/@f5-sales-demo/xcsh/src/modes/components/custom-message';

test('Zoom command failure remains a readable themed warning with diagnostics', async () => {
  const messages: any[] = [];
  const commands: Record<string, any> = {};
  const mock = spyOn(Bun, 'spawnSync').mockReturnValue({
    exitCode: 23,
    stdout: new Uint8Array(),
    stderr: new TextEncoder().encode('synthetic-desktop-unavailable'),
  } as never);
  const which = spyOn(Bun, 'which').mockReturnValue('/synthetic/xorgctl');
  try {
    zoomFactory({
      ...pi,
      integrations: { register() {} },
      registerTool() {},
      registerCommand(name: string, command: any) {
        commands[name] = command;
      },
      sendMessage(message: any) {
        messages.push(message);
      },
    } as never);
    await commands.zoom.handler('status', {
      ui: {
        notify() {
          throw new Error('Expected shared presentation');
        },
      },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].presentation.warnings.join(' ')).toContain('failed');
    expect(messages[0].presentation.summary).toContain('failed');
    await initTheme();
    for (const name of ['xcsh-dark', 'xcsh-light']) {
      await setTheme(name);
      const c = new CustomMessageComponent(messages[0]);
      c.setExpanded(true);
      for (const width of [40, 76, 120, 153]) {
        const lines = c.render(width);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        expect(lines.join('\n')).toContain('synthetic-desktop');
        expect(lines.join('\n')).toContain('23');
      }
    }
  } finally {
    mock.mockRestore();
    which.mockRestore();
  }
});
