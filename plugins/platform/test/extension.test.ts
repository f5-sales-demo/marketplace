import { describe, expect, it } from 'bun:test';
import factory from '../src/index';

const Type = new Proxy({}, { get: () => (...args: unknown[]) => ({ args }) });

describe('Platform CE v2 extension', () => {
  it('registers only the three Secure Mesh Site v2 tools', async () => {
    const tools: string[] = [];
    await factory({ typebox: { Type }, registerTool(tool: { name: string }) { tools.push(tool.name); }, setLabel() {} } as any);
    expect(tools.sort()).toEqual(['f5xc_ce_v2_bootstrap', 'f5xc_ce_v2_site', 'f5xc_ce_v2_status']);
  });
});
