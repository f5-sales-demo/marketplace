import { expect, test } from 'bun:test';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import { type AwsCeToolContext, saveAwsPlan } from '../../src/ce/artifacts';
import { awsTerraformService, executeAwsCeTerraformApply } from '../../src/ce/terraform-apply';
import type { AwsCeObservation } from '../../src/ce/types';
import { admissionFixture } from './terraform-admission-fixture';

test('public Terraform apply persists approval and resumes without asking again', async () => {
  const f = admissionFixture();
  let confirms = 0;
  let preflights = 0;
  let prepared = false;
  const artifacts: string[] = [];
  const ctx: AwsCeToolContext = {
    cwd: '/tmp',
    hasUI: true,
    ui: {
      async confirm() {
        confirms++;
        return true;
      },
    },
    sessionManager: {
      getSessionId: () => 'tf-apply-fixture',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async (value) => {
        artifacts.push(value);
        return String(artifacts.length);
      },
    },
  };
  const baseline = {} as AwsCeObservation;
  await saveAwsPlan(ctx.sessionManager, f.plan, baseline);
  const platform = { storage: async () => f.storage, runtime: async () => f.runtime } as unknown as CePlatformService;
  const terraform: CeTerraformService = {
    async open(_owner, _deployment, resume) {
      if (!resume && prepared) throw Object.assign(new Error('existing'), { code: 'EEXIST' });
      prepared = true;
      return f.session;
    },
  };
  const input = { planId: f.plan.planId, planSha256: f.plan.planSha256 };
  const preflight = async () => {
    preflights++;
    return baseline;
  };
  expect(
    (await executeAwsCeTerraformApply(input, ctx, f.api, platform, terraform, fetch, undefined, preflight)).status,
  ).toBe('pending-registration');
  expect(confirms).toBe(1);
  expect(preflights).toBe(4);
  f.healthy();
  expect(
    (await executeAwsCeTerraformApply(input, ctx, f.api, platform, terraform, fetch, undefined, preflight)).status,
  ).toBe('registered');
  expect(confirms).toBe(1);
  expect(
    artifacts.filter((value) => value.includes('routing')).every((value) => !value.includes('/etc/vpm/user_data')),
  ).toBe(true);
  await f.storage.write('terraform-authorization.json', {
    schemaVersion: 1,
    engine: 'native',
    planSha256: f.plan.planSha256,
    mutations: true,
  });
  await expect(
    executeAwsCeTerraformApply(input, ctx, f.api, platform, terraform, fetch, undefined, preflight),
  ).rejects.toThrow('authorization checkpoint');
  await expect(
    executeAwsCeTerraformApply({ ...input, f5Evidence: true } as typeof input, ctx, f.api, platform, terraform),
  ).rejects.toThrow('only the persisted');
});

test('Terraform service dispatch uses the supported bus and propagates cancellation', async () => {
  const service = {} as CeTerraformService;
  expect(
    await awsTerraformService({
      events: {
        emit(channel: string, request: { version: number; resolve(value: CeTerraformService): void }) {
          expect(channel).toBe('xcsh:ce-terraform:v1:service');
          expect(request.version).toBe(1);
          request.resolve(service);
        },
      },
    }),
  ).toBe(service);
  await expect(awsTerraformService({}, AbortSignal.abort())).rejects.toThrow('cancelled');
  await expect(
    awsTerraformService({
      events: {
        emit() {
          throw new Error('bus failed');
        },
      },
    }),
  ).rejects.toThrow('unavailable');
});
