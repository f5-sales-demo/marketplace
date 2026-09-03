import { describe, expect, it } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { createAzureCeInventoryTool } from '../../src/tools/azure-ce-inventory';

const SUBSCRIPTION_ID = [8, 4, 4, 4, 12].map((length) => '1'.repeat(length)).join('-');
const NOW = new Date('2026-09-03T07:30:00.000Z');

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
    Array: (items: unknown) => ({ type: 'array', items }),
  },
};

function api(mode: 'success' | 'setup_failure' | 'authentication_failure' = 'success'): AzExecApi {
  return {
    async exec(_command, args) {
      if (args[0] === 'extension') {
        if (mode === 'setup_failure')
          return {
            stdout: 'partial-inventory sentinel-secret',
            stderr: 'endpoint https://private.example.test at 192.0.2.60',
            exitCode: 1,
          };
        if (mode === 'authentication_failure')
          return { stdout: '', stderr: 'Please run az login sentinel-secret', exitCode: 1 };
        return { stdout: '{}', stderr: '', exitCode: 0 };
      }
      if (args.includes('--help'))
        return {
          stdout: '--graph-query --subscriptions --first --skip --skip-token --allow-partial-scopes',
          stderr: '',
          exitCode: 0,
        };
      if (args[0] === 'graph') return { stdout: '{"data":[]}', stderr: '', exitCode: 0 };
      return { stdout: '{}', stderr: '', exitCode: 0 };
    },
  };
}

function session(saveArtifact: (content: string, toolType: string) => Promise<string | undefined>) {
  return { cwd: '/tmp', sessionManager: { saveArtifact } };
}

describe('createAzureCeInventoryTool', () => {
  it('returns typed collector failures without sensitive or partial fields', async () => {
    const tool = createAzureCeInventoryTool(
      { typebox: mockTypebox },
      () => api('setup_failure'),
      () => NOW,
    );
    const result = await tool.execute(
      'id',
      { subscriptionId: SUBSCRIPTION_ID, caller: { objectId: SUBSCRIPTION_ID }, platformSites: [] },
      undefined,
      undefined,
      session(async () => 'must-not-save'),
    );
    expect(result).toMatchObject({
      isError: true,
      details: {
        tool: 'azure_ce_inventory',
        outcome: 'execution_failure',
        failureStage: 'setup',
        errorType: 'unsupported_extension',
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/sentinel|secret|partial-inventory|private\.example|192\.0\.2\./i);
    expect(result.details).not.toHaveProperty('inventory');
    expect(result.details).not.toHaveProperty('digestSha256');
    expect(result.details).not.toHaveProperty('artifactId');
  });

  it('separately classifies artifact persistence rejection without leaking the envelope', async () => {
    const tool = createAzureCeInventoryTool(
      { typebox: mockTypebox },
      () => api(),
      () => NOW,
    );
    const result = await tool.execute(
      'id',
      { subscriptionId: SUBSCRIPTION_ID, caller: { objectId: SUBSCRIPTION_ID }, platformSites: [] },
      undefined,
      undefined,
      session(async () => {
        throw new Error('sentinel-secret persistence endpoint 192.0.2.70 partial-inventory');
      }),
    );
    expect(result).toMatchObject({
      isError: true,
      details: {
        outcome: 'execution_failure',
        failureStage: 'artifact_persistence',
        errorType: 'persistence_error',
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/sentinel|secret|partial-inventory|192\.0\.2\./i);
    expect(result.details).not.toHaveProperty('inventory');
    expect(result.details).not.toHaveProperty('digestSha256');
    expect(result.details).not.toHaveProperty('artifactId');
  });

  it('maps safe Azure authentication categories to authentication failure', async () => {
    const tool = createAzureCeInventoryTool(
      { typebox: mockTypebox },
      () => api('authentication_failure'),
      () => NOW,
    );
    const result = await tool.execute(
      'id',
      { subscriptionId: SUBSCRIPTION_ID, caller: { objectId: SUBSCRIPTION_ID }, platformSites: [] },
      undefined,
      undefined,
      session(async () => 'must-not-save'),
    );
    expect(result).toMatchObject({
      isError: true,
      details: { outcome: 'authentication_failure', failureStage: 'setup', errorType: 'auth_required' },
    });
    expect(JSON.stringify(result)).not.toContain('sentinel-secret');
  });

  it('preserves success when artifact persistence resolves undefined', async () => {
    let saved = '';
    const tool = createAzureCeInventoryTool(
      { typebox: mockTypebox },
      () => api(),
      () => NOW,
    );
    const result = await tool.execute(
      'id',
      { subscriptionId: SUBSCRIPTION_ID, platformSites: [] },
      undefined,
      undefined,
      session(async (content) => {
        saved = content;
        return undefined;
      }),
    );
    expect(result.details.outcome).toBe('success');
    expect(result.content[0].text).toContain('session memory only');
    expect(saved).toContain('"kind":"azure-ce-inventory"');
    expect(result.details.inventory.platformEvidence).toBe('available');
  });

  it('returns stable invalid-input metadata for blank object IDs without executing or saving', async () => {
    let executed = false;
    let saved = false;
    const tool = createAzureCeInventoryTool(
      { typebox: mockTypebox },
      () => ({
        async exec() {
          executed = true;
          return { stdout: '{}', stderr: '', exitCode: 0 };
        },
      }),
      () => NOW,
    );
    const result = await tool.execute(
      'id',
      { subscriptionId: SUBSCRIPTION_ID, caller: { objectId: '' }, platformSites: [] },
      undefined,
      undefined,
      session(async () => {
        saved = true;
        return 'artifact';
      }),
    );
    expect(result).toMatchObject({
      isError: true,
      details: { outcome: 'invalid_input', failureStage: 'input_validation', errorType: 'invalid_input' },
    });
    expect(executed).toBe(false);
    expect(saved).toBe(false);
  });

  it('preserves omitted platform evidence through the wrapper', async () => {
    const tool = createAzureCeInventoryTool(
      { typebox: mockTypebox },
      () => api(),
      () => NOW,
    );
    const result = await tool.execute(
      'id',
      { subscriptionId: SUBSCRIPTION_ID },
      undefined,
      undefined,
      session(async () => undefined),
    );
    expect(result.details.outcome).toBe('success');
    expect(result.details.inventory.platformEvidence).toBe('unavailable');
  });
});
