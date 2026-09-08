import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../platform/src/ce/runtime';
import { type CePlatformService, registerCePlatformService } from '../../platform/src/ce/service';
import factory from '../src/index';
import type { Deployment, PlanReceipt } from '../src/runner';
import { type CeTerraformService, createCeTerraformService, TERRAFORM_SERVICE_CHANNEL } from '../src/service';

const directories: string[] = [];
afterEach(async () => {
  for (const root of directories.splice(0)) await rm(root, { recursive: true, force: true });
});
const owner: CeOwner = {
  deploymentId: 'ce-tf',
  engine: 'terraform',
  provider: 'aws',
  account: '123456789012',
  region: 'us-east-1',
};
const deployment: Deployment = {
  schemaVersion: 1,
  deploymentId: owner.deploymentId,
  engine: 'terraform',
  scope: { cloud: 'aws', account: owner.account, region: owner.region },
  terraformVersion: '1.16.1',
  configuration: '{"terraform":{"required_version":"= 1.16.1"}}',
  providerLock: '# no external providers',
  backendIdentity: 'local:ce-tf',
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-service-'));
  directories.push(root);
  const platform = { storage: (identity: CeOwner) => CeDeploymentStore.open(root, identity) } as CePlatformService;
  return { root, platform, service: createCeTerraformService(async () => platform) };
}
test('Terraform refuses native ownership and mismatched resume configuration', async () => {
  const { platform, service } = await fixture();
  await platform.storage({ ...owner, engine: 'native' });
  await expect(service.open(owner, deployment, false)).rejects.toThrow('engine');
  const other = await fixture();
  await expect(other.service.open({ ...owner, account: '000000000000' }, deployment, false)).rejects.toThrow(
    'ownership differ',
  );
  await other.service.open(owner, deployment, false);
  await expect(
    other.service.open(owner, { ...deployment, providerLock: '# changed provider lock' }, true),
  ).rejects.toThrow('differs');
  await other.service.open(owner, deployment, true);
});
test('Terraform revalidates durable ownership before execution', async () => {
  const { platform, service } = await fixture();
  const session = await service.open(owner, deployment, false);
  const store = await platform.storage(owner);
  await writeFile(
    join(store.directory, 'owner.json'),
    JSON.stringify({ schemaVersion: 2, owner: { ...owner, engine: 'native' } }),
    { mode: 0o600 },
  );
  await expect(session.plan({})).rejects.toThrow();
  await expect(session.readConfiguration('0'.repeat(64))).rejects.toThrow();
  await expect(
    session.readPlannedResourceFields({} as PlanReceipt, { 'terraform_data.ce': ['id'] }, {}),
  ).rejects.toThrow();
});
test('installed Terraform extension registers an executable service through the supported bus', async () => {
  const { platform } = await fixture();
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  const bus = {
    on(channel: string, handler: (data: unknown) => void) {
      const list = handlers.get(channel) ?? new Set();
      list.add(handler);
      handlers.set(channel, list);
      return () => {
        list.delete(handler);
      };
    },
    emit(channel: string, data: unknown) {
      for (const handler of handlers.get(channel) ?? []) handler(data);
    },
  };
  registerCePlatformService(bus, platform);
  factory({ events: bus, setLabel: () => {} });
  const service = await new Promise<CeTerraformService>((resolve) =>
    bus.emit(TERRAFORM_SERVICE_CHANNEL, { version: 1, resolve }),
  );
  await service.open(owner, deployment, false);
  await service.open(owner, deployment, true);
});

test('current resume retains private stage configuration while enforcing provider and owner identity', async () => {
  const { service } = await fixture();
  const session = await service.open(owner, deployment, false);
  const { createHash } = await import('node:crypto');
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const next = JSON.stringify({
    terraform: { required_version: '= 1.16.1' },
    resource: { terraform_data: { ce: { input: 'private-bootstrap-fixture' } } },
  });
  await session.reviseConfiguration(hash(deployment.configuration), next);
  await expect(service.open(owner, deployment, true)).rejects.toThrow('differs');
  await service.open(owner, deployment, 'current');
  await expect(service.open(owner, { ...deployment, providerLock: '# foreign lock' }, 'current')).rejects.toThrow(
    'differs',
  );
  await expect(
    service.open(
      owner,
      {
        ...deployment,
        configuration: JSON.stringify({
          terraform: { required_version: '= 1.16.1' },
          provider: { aws: { region: 'foreign' } },
        }),
      },
      'current',
    ),
  ).rejects.toThrow('identity');
});

test('isolates lifecycle stage workspaces while retaining deployment and engine ownership', async () => {
  const { service } = await fixture();
  await service.open(owner, deployment, false);
  const staged = {
    ...deployment,
    stage: 'upgrade-site-one',
    backendIdentity: `local:${owner.deploymentId}:stage:upgrade-site-one`,
  };
  await service.open(owner, staged, false);
  await service.open(owner, staged, true);
  await service.open(owner, deployment, true);
  await expect(service.open(owner, { ...staged, stage: '../foreign' }, false)).rejects.toThrow();
  await expect(service.open(owner, { ...staged, backendIdentity: deployment.backendIdentity }, true)).rejects.toThrow();
});
