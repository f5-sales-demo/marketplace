import { expect, it } from 'bun:test';
import * as typebox from '@sinclair/typebox';
import type { PluginInterface } from '../../src/gcloud/types';
import { createGcpCeTools } from '../../src/tools/gcp-ce';

for (const [stderr, reason, errorType] of [
  ['You do not currently have an active account selected.', 'gcloud_authentication_required', 'auth_required'],
  ['Token has been expired or revoked.', 'gcloud_session_expired', 'session_expired'],
  ['PERMISSION_DENIED: caller does not have permission.', 'gcloud_permission_denied', 'permission_denied'],
  ['NOT_FOUND: resource does not exist.', 'gcloud_resource_not_found', 'not_found'],
]) {
  it(`CE project identity preserves ${errorType} without exposing provider diagnostics`, async () => {
    const privateMarker = 'opaque-provider-diagnostic';
    const calls: string[][] = [];
    const tools = createGcpCeTools({ typebox } as unknown as PluginInterface, () => ({
      exec: async (_command, args) => {
        calls.push(args);
        return { stdout: '', stderr: `${stderr} ${privateMarker}`, exitCode: 1 };
      },
    }));
    const tool = tools.find((entry) => entry.name === 'gcp_project_identity');
    if (!tool) throw new Error('Missing project identity tool');
    const result = await tool.execute('id', { project: 'example-project' }, undefined, null, { cwd: '/tmp' });
    expect(calls).toHaveLength(1);
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ reason, errorType, mutationAttempted: false });
    expect(JSON.stringify(result)).not.toContain(privateMarker);
    expect(JSON.stringify(result)).not.toContain(stderr);
    if (errorType === 'auth_required' || errorType === 'session_expired')
      expect(result.details.required).toEqual(['xcsh plugin setup gcloud']);
  });
}

it('CE project identity does not infer authentication from an untyped error message', async () => {
  const tools = createGcpCeTools({ typebox } as unknown as PluginInterface, () => ({
    exec: async () => {
      throw new Error('gcloud auth login opaque-provider-diagnostic');
    },
  }));
  const tool = tools.find((entry) => entry.name === 'gcp_project_identity');
  if (!tool) throw new Error('Missing project identity tool');
  const result = await tool.execute('id', { project: 'example-project' }, undefined, null, { cwd: '/tmp' });
  expect(result.details.reason).toBe('validation_or_read_failed');
  expect(result.details.errorType).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('opaque-provider-diagnostic');
});
