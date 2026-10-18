import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Invocation, TerraformRunner } from '../src/runner';

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true });
});
test('shared Terraform runner persists GCP scope and rejects project/engine drift on resume', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gcp-tf-'));
  dirs.push(root);
  const calls: Invocation[] = [];
  const exec = async (r: Invocation) => {
    calls.push(r);
    return { code: 0, stdout: r.args[0] === 'version' ? JSON.stringify({ terraform_version: '1.14.0' }) : '' };
  };
  const deployment = {
    schemaVersion: 1 as const,
    deploymentId: 'gcp-ce-test',
    engine: 'terraform' as const,
    scope: { cloud: 'gcp' as const, account: 'test-project', region: 'northamerica-northeast1' },
    terraformVersion: '1.14.0',
    configuration: '{"terraform":{"required_version":"= 1.14.0"}}',
    providerLock: '# locked fixture',
    backendIdentity: 'local:gcp-ce-test',
  };
  await new TerraformRunner(root, exec).prepare(deployment);
  expect(calls.every((r) => r.cwd.startsWith(root))).toBe(true);
  const resumed = new TerraformRunner(root, exec);
  await resumed.resume(deployment.deploymentId, deployment);
  await expect(
    new TerraformRunner(root, exec).resume(deployment.deploymentId, {
      ...deployment,
      scope: { ...deployment.scope, account: 'other-project' },
    }),
  ).rejects.toThrow();
});
