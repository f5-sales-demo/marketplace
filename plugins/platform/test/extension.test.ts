import { describe, expect, it } from 'bun:test';
import factory from '../src/index';
import type { PlatformToolApi } from '../src/types';

const Type = new Proxy(
  {},
  {
    get:
      () =>
      (...args: unknown[]) => ({ args }),
  },
);

describe('Platform CE v2 extension', () => {
  it('registers only the four Secure Mesh Site v2 tools', async () => {
    const tools: string[] = [];
    const pi: PlatformToolApi & { registerTool(tool: { name: string }): void; setLabel(label: string): void } = {
      typebox: { Type },
      registerTool(tool: { name: string }) {
        tools.push(tool.name);
      },
      setLabel() {},
    };
    await factory(pi);
    expect(tools.sort()).toEqual([
      'f5xc_ce_v2_bootstrap',
      'f5xc_ce_v2_capabilities',
      'f5xc_ce_v2_site',
      'f5xc_ce_v2_status',
    ]);
  });
});
