import { afterEach, expect, test, vi } from 'bun:test';
import { Type } from '../plugins/aws/node_modules/@sinclair/typebox';
import aws from '../plugins/aws/src/index';
import azure from '../plugins/azure/src/index';
import kvm from '../plugins/kvm/src/index';

afterEach(() => vi.restoreAllMocks());

test.each([
  'Calculate 19 times 23',
  'Inspect KVM libvirt Secure Mesh, Azure Customer Edge and AWS CE source',
  'Research AWS Customer Edge and Azure Secure Mesh then review a file',
  'Do not deploy KVM SMSv2 or Azure Customer Edge',
  'Quoted data: "AWS CE, Azure Secure Mesh, KVM customer edge"',
  'Now independently research TypeScript',
])('provider context preserves parent work: %s', async (prompt) => {
  vi.spyOn(Bun, 'spawnSync').mockImplementation(() => ({ exitCode: 0 }) as never);
  for (const factory of [aws, azure, kvm]) {
    const handlers = new Map<string, (...args: any[]) => any>();
    const api = {
      typebox: { Type }, setLabel() {}, registerTool() {}, settings: { get() {} },
      integrations: { register() { return { get: async () => ({ state: 'ready', value: {
        Account: 'synthetic', Arn: 'synthetic', id: 'synthetic', name: 'synthetic',
      } }) }; } },
      on(name: string, handler: (...args: any[]) => any) { handlers.set(name, handler); },
      logger: { debug() {} },
    };
    await factory(api as never);
    const result = await handlers.get('before_agent_start')?.({ prompt }, { cwd: '/tmp' });
    expect(result?.systemPrompt).toBeUndefined();
    expect(result?.message?.content ?? '').not.toMatch(/Use only|ROUTE:|Do not use|Never use|before recommendations/i);
    if (result?.message) expect(result.message.customType).toMatch(/_hint$/);
  }
});
