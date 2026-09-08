import { expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import type { PluginInterface } from '../../src/az/types';
import { createAzureCeDiagnoseTool } from '../../src/tools/azure-ce-diagnose';
import { createAzureCeStatusTool } from '../../src/tools/azure-ce-status';

it('rejects caller health assertions before reading plans or making cloud calls', async () => {
  const pi = { typebox: { Type } } as unknown as PluginInterface;
  for (const tool of [createAzureCeStatusTool(pi), createAzureCeDiagnoseTool(pi)]) {
    const result = await tool.execute(
      'test',
      {
        planId: 'missing',
        planSha256: 'missing',
        mode: 'passive',
        f5Evidence: { siteState: 'healthy', bgpEstablished: true },
      },
      undefined,
      undefined,
      {} as never,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Caller-supplied F5 health evidence is unsupported');
    expect(JSON.stringify(tool.parameters)).not.toContain('f5Evidence');
  }
});
