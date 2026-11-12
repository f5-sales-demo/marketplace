import { expect, test } from 'bun:test';
import * as typebox from '@sinclair/typebox';
import { TERRAFORM_SERVICE_CHANNEL } from '../../../terraform/src/service';
import type { PluginInterface } from '../../src/gcloud/types';
import { createGcpCeTools } from '../../src/tools/gcp-ce';

const key = (byte: number) =>
  `ssh-ed25519 ${Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, byte)]).toString('base64')}`;
const publicAccess = { schemaVersion: 1 as const, cePublicKey: key(1), observerPublicKey: key(2) };
const parameters = {
  project: 'example-project',
  region: 'northamerica-northeast1',
  deploymentName: 'example-campaign',
  engine: 'terraform' as const,
  platformContext: 'example-context',
  sshSourceCidr: '192.0.2.4/32',
};
function fixture(available = true) {
  let preparations = 0,
    cloudCalls = 0;
  const pi = {
    typebox,
    events: {
      emit(channel: string, value: { resolve: (service: unknown) => void }) {
        expect(channel).toBe(TERRAFORM_SERVICE_CHANNEL);
        value.resolve({
          open: async () => {
            throw new Error('no session');
          },
          ...(available
            ? {
                prepareGcpCaptureAccess: async (owner: unknown, request: unknown) => {
                  preparations++;
                  expect(owner).toEqual({
                    provider: 'gcp',
                    engine: 'terraform',
                    account: parameters.project,
                    region: parameters.region,
                    deploymentId: parameters.deploymentName,
                  });
                  expect(request).toEqual({
                    platformContext: parameters.platformContext,
                    sshSourceCidr: parameters.sshSourceCidr,
                  });
                  return publicAccess;
                },
              }
            : {}),
        });
      },
    },
  } as unknown as PluginInterface;
  const tools = createGcpCeTools(pi, () => ({
    exec: async () => {
      cloudCalls++;
      throw new Error('no cloud calls');
    },
  }));
  const tool = tools.find((value) => value.name === 'gcp_ce_access_prepare');
  expect(tool).toBeDefined();
  if (!tool) throw new Error('missing access preparation tool');
  return { tool, preparations: () => preparations, cloudCalls: () => cloudCalls };
}
test('installed access preparation returns public keys before planning without cloud submission', async () => {
  const f = fixture();
  const result = await f.tool.execute('id', parameters, undefined, undefined, { cwd: '/tmp' });
  expect(result.isError).toBeUndefined();
  expect(result.details).toMatchObject({
    availability: 'campaign-access-prepared',
    cloudSubmission: false,
    initialAccess: { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: publicAccess.cePublicKey },
    observer: {
      schemaVersion: 1,
      profile: 'original-ha-observer',
      publicKey: publicAccess.observerPublicKey,
      sshSourceCidr: parameters.sshSourceCidr,
    },
  });
  expect(f.preparations()).toBe(1);
  expect(f.cloudCalls()).toBe(0);
});
test('wrong engine, missing scope, approval and absent installed capability refuse without private fallback', async () => {
  const f = fixture();
  for (const changed of [
    { ...parameters, engine: 'native' as const },
    { ...parameters, region: undefined },
    { ...parameters, platformContext: undefined },
    { ...parameters, approvedPlanHash: 'a'.repeat(64) },
  ]) {
    const result = await f.tool.execute('id', changed, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  }
  expect(f.preparations()).toBe(0);
  expect(f.cloudCalls()).toBe(0);
  const absent = fixture(false);
  const result = await absent.tool.execute('id', parameters, undefined, undefined, { cwd: '/tmp' });
  expect(result.isError).toBe(true);
  expect(result.details.reason).toBe('terraform_setup_required');
});
