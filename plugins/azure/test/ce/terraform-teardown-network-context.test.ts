import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileAzureCePlan } from '../../src/ce/planner';
import { compileAzureTerraformTeardown, runAzureTerraformTeardown } from '../../src/ce/terraform-teardown';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

for (const fault of ['service', 'site', 'teardown', 'loaders', 'verifier', 'session'] as const) {
  test(`network teardown rejects foreign ${fault} before any operation`, async () => {
    const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
    const binding = azureUpgradeBinding(plan);
    const input = compileAzureTerraformTeardown(
      plan,
      {
        schemaVersion: 1,
        owner: binding.owner,
        sourcePlanSha256: plan.planSha256,
        siteContractFingerprint: `sha256:${'a'.repeat(64)}`,
        ingressContractFingerprint: `sha256:${'b'.repeat(64)}`,
        sites: [{ binding, siteUid: 'site-uid', routing: [] }],
        listeners: [],
        origins: [],
      } as Parameters<typeof compileAzureTerraformTeardown>[1],
      [
        {
          siteName: plan.siteName,
          siteUid: 'site-uid',
          physicalSiteUid: 'physical-uid',
          tokens: binding.nodes.map((node, index) => ({ node, name: `ce-token-${index}` })),
        },
      ],
    );
    const directory = await mkdtemp(join(tmpdir(), 'azure-network-context-'));
    try {
      let operations = 0;
      const forbidden = async () => {
        operations++;
        throw Error('operation reached before context admission');
      };
      const service = { open: forbidden };
      const context = {
        terraform: service,
        destroyTeardown: input,
        site: { siteUid: 'site-uid', siteConfigurationSha256: 'a'.repeat(64) },
        loaders: { loadSource: forbidden, loadOutcome: forbidden },
        verifier: forbidden,
        publicSession: {
          getSessionId: () => 'test-session',
          getArtifactsDir: () => '/tmp/test-public',
          getArtifactPath: forbidden,
          saveArtifact: forbidden,
        },
      };
      if (fault === 'service') context.terraform = { open: forbidden };
      if (fault === 'site') context.site.siteUid = 'foreign-site';
      if (fault === 'teardown') context.destroyTeardown = { ...input, sourcePlanSha256: 'b'.repeat(64) };
      if (fault === 'loaders') Reflect.set(context.loaders, 'loadSource', undefined);
      if (fault === 'verifier') Reflect.set(context, 'verifier', undefined);
      if (fault === 'session') Reflect.set(context.publicSession, 'getArtifactPath', undefined);
      const runtime = { engine: 'terraform' },
        store = { directory, owner: binding.owner, read: forbidden, write: forbidden, verify: forbidden };
      await expect(
        Reflect.apply(runAzureTerraformTeardown, undefined, [
          plan,
          input,
          'a'.repeat(64),
          runtime,
          {},
          {},
          store,
          { exec: forbidden },
          {},
          undefined,
          service,
          context,
        ]),
      ).rejects.toThrow('Azure network teardown context differs');
      expect(operations).toBe(0);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
}
