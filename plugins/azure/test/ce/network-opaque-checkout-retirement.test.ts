import { expect, test } from 'bun:test';
import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import {
  type BootstrapCheckoutBinding,
  retireBootstrapToken,
  storeBootstrapToken,
} from '../../../platform/src/ce/token-store';
import { canonicalSha256, sha256Hex } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import type { AzureTerraformNetworkEmptyMainBindingContext } from '../../src/ce/terraform-network-empty-main-binding';
import {
  readAzureTerraformNetworkFrozenCheckouts,
  retireAzureTerraformNetworkOpaqueCheckouts,
} from '../../src/ce/terraform-network-opaque-checkout-retirement';
import type { readAzureTerraformNetworkParentInventory } from '../../src/ce/terraform-network-parent-inventory';
import { recheckAzureTerraformNetworkRetiredBootstrapPackets } from '../../src/ce/terraform-network-sensitive-packet-retirement';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

type Inventory = Awaited<ReturnType<typeof readAzureTerraformNetworkParentInventory>>;
for (const fault of [
  'none',
  'foreign-owner',
  'foreign-site',
  'foreign-node',
  'foreign-token',
  'wrong-schema',
  'wrong-action',
  'wrong-digest',
  'missing-issued',
  'duplicate',
  'native-replaced',
  'raw-changed',
  'logical-changed',
  'relative-root',
  'cancelled',
  'no-native-custody',
  'changed-during-read',
  'ignored-cancellation',
  'foreign-directory',
  'directory-replaced-during-read',
] as const) {
  test(`frozen opaque checkout native selection ${fault}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'azure-opaque-checkout-'));
    try {
      const selectedIntent = structuredClone(intent);
      selectedIntent.engine = 'terraform';
      const plan = compileAzureCePlan(selectedIntent, structuredClone(observation)),
        binding = azureUpgradeBinding(plan);
      const store = await CeDeploymentStore.open(root, binding.owner);
      let checkout: BootstrapCheckoutBinding | undefined;
      const token = { name: 'issued-token', node: binding.nodes[0], siteName: plan.siteName };
      await storeBootstrapToken({
        sessionId: 'owned-session',
        root: join(root, 'opaque'),
        token: 'owned.jwt.secret',
        expiresInSeconds: 900,
        onPrepared: async (value) => {
          checkout = value;
        },
      });
      if (!checkout) throw Error('actual checkout issuance required');
      const name = `bootstrap-checkout-${checkout.reference.split('/').at(-1)}.json`;
      const value = {
        schemaVersion: 1,
        owner: binding.owner,
        binding,
        siteUid: 'site-uid',
        contractFingerprint: `sha256:${'c'.repeat(64)}`,
        node: token.node,
        tokenName: token.name,
        checkout,
      };
      await store.write(name, value);
      const raw = await readFile(join(store.directory, name)),
        stat = await lstat(join(store.directory, name));
      const file = {
        path: name,
        identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,
        sha256: sha256Hex(raw.toString()),
        packetSha256: canonicalSha256(value),
      };
      const decision = {
        ...file,
        action: 'preserve' as const,
        schema: 'ce-bootstrap-checkout-v1',
        semanticProvenanceSha256: canonicalSha256({ value, token }),
      };
      const issued = {
        path: `${token.name}.json`,
        identity: 'historical',
        sha256: 'a'.repeat(64),
        packetSha256: 'b'.repeat(64),
        action: 'delete' as const,
        schema: 'ce-bootstrap-token-v1',
        semanticProvenanceSha256: 'd'.repeat(64),
        payloadSha256ByField: { jwt: checkout.digest },
      };
      const parentStat = await lstat(store.directory);
      const inventory = {
        owner: binding.owner,
        originalPlanSha256: plan.planSha256,
        teardownPlanSha256: 'e'.repeat(64),
        directories: [
          {
            path: '',
            identity: `${parentStat.dev}:${parentStat.ino}:${parentStat.birthtimeMs}`,
            names: [name, 'owner.json'],
          },
        ],
        files: [file],
        parentArtifactDecisions: [decision, issued],
      } as unknown as Inventory;
      const context = {
        site: { siteUid: value.siteUid },
        destroyTeardown: {
          planSha256: inventory.teardownPlanSha256,
          drain: { siteContractFingerprint: value.contractFingerprint },
          retirement: [{ siteName: plan.siteName, tokens: [{ name: token.name, node: token.node }] }],
        },
      } as unknown as AzureTerraformNetworkEmptyMainBindingContext;
      if (fault === 'foreign-owner') inventory.owner = { ...binding.owner, deploymentId: 'foreign' };
      if (fault === 'foreign-site') context.site.siteUid = 'foreign';
      const selectedToken = context.destroyTeardown.retirement[0]?.tokens[0];
      if (!selectedToken) throw Error('Exact fixture token required');
      if (fault === 'foreign-node') selectedToken.node = 'foreign';
      if (fault === 'foreign-token') selectedToken.name = 'foreign';
      if (fault === 'wrong-schema') decision.schema = 'foreign';
      if (fault === 'wrong-action') decision.action = 'delete' as typeof decision.action;
      if (fault === 'wrong-digest') issued.payloadSha256ByField.jwt = 'f'.repeat(64);
      if (fault === 'missing-issued') inventory.parentArtifactDecisions = [decision];
      if (fault === 'duplicate') inventory.parentArtifactDecisions.push(decision);
      if (fault === 'native-replaced') {
        await rename(join(store.directory, name), join(root, 'old-checkout.json'));
        await writeFile(join(store.directory, name), raw, { mode: 0o600 });
      }
      if (fault === 'raw-changed')
        await writeFile(join(store.directory, name), JSON.stringify(value, null, 2), { mode: 0o600 });
      if (fault === 'logical-changed') store.read = async () => ({ ...value, node: 'foreign' });
      if (fault === 'changed-during-read')
        store.read = async () => {
          await rename(join(store.directory, name), join(root, 'changed-during-read.json'));
          await writeFile(join(store.directory, name), raw, { mode: 0o600 });
          return value;
        };
      if (fault === 'ignored-cancellation') store.read = async () => new Promise<never>(() => {});
      if (fault === 'foreign-directory') {
        const directory = inventory.directories[0];
        if (!directory) throw Error('fixture parent required');
        directory.identity = 'foreign';
      }
      if (fault === 'directory-replaced-during-read')
        store.read = async () => {
          const path = store.directory,
            saved = join(root, 'previous-parent-directory');
          await rename(path, saved);
          await mkdir(path, { mode: 0o700 });
          for (const name of await readdir(saved)) await rename(join(saved, name), join(path, name));
          return value;
        };

      if (fault === 'relative-root') {
        value.checkout.root = 'relative';
        await store.write(name, value);
        const updated = await readFile(join(store.directory, name)),
          st = await lstat(join(store.directory, name));
        Object.assign(file, {
          identity: `${st.dev}:${st.ino}:${st.birthtimeMs}`,
          sha256: sha256Hex(updated.toString()),
          packetSha256: canonicalSha256(value),
        });
        Object.assign(decision, file, { semanticProvenanceSha256: canonicalSha256({ value, token }) });
      }
      const signal =
        fault === 'cancelled'
          ? AbortSignal.abort(Error('cancelled'))
          : fault === 'ignored-cancellation'
            ? AbortSignal.timeout(25)
            : undefined;
      const read = () =>
        readAzureTerraformNetworkFrozenCheckouts(plan, store, context, inventory, 'a'.repeat(64), signal);
      if (fault === 'none') {
        const first = await read(),
          second = await read();
        expect(second).toEqual(first);
        expect(first).toHaveLength(1);
        const item = first[0];
        if (!item) throw Error('Exact selected checkout required');
        const receipt = await retireBootstrapToken(item.binding, item.evidenceSha256);
        const directory = join(item.binding.root, ...item.binding.reference.slice('f5xc-ce://'.length).split('/'));
        const metadata = await readFile(join(directory, 'metadata.json'));
        expect(await retireBootstrapToken(item.binding, item.evidenceSha256)).toEqual(receipt);
        expect(await readFile(join(directory, 'metadata.json'))).toEqual(metadata);
        await expect(lstat(join(directory, 'token'))).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(retireBootstrapToken(item.binding, 'f'.repeat(64))).rejects.toThrow();
      } else if (fault === 'no-native-custody') {
        await expect(
          retireAzureTerraformNetworkOpaqueCheckouts(plan, store, context, {}, {} as never, {} as never, {} as never),
        ).rejects.toThrow();
        expect(
          await readFile(
            join(checkout.root, ...checkout.reference.slice('f5xc-ce://'.length).split('/'), 'token'),
            'utf8',
          ),
        ).toBe('owned.jwt.secret');
      } else await expect(read()).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true });
    }
  });
}

test('serialized completed bootstrap observation never authorizes native recheck', async () => {
  const fake = {
    status: 'retired-bootstrap-packets-observed',
    completeParentFileCustodyQualified: true,
    bootstrapPacketRetirementQualified: true,
  };
  for (const value of [undefined, fake, structuredClone(fake)])
    await expect(
      recheckAzureTerraformNetworkRetiredBootstrapPackets(
        value,
        {} as never,
        {} as never,
        {} as never,
        {},
        {} as never,
        {} as never,
        {} as never,
      ),
    ).rejects.toThrow('genuine owning completed bootstrap observation required');
  const signal = AbortSignal.abort(Error('cancelled before recheck'));
  await expect(
    recheckAzureTerraformNetworkRetiredBootstrapPackets(
      fake,
      {} as never,
      {} as never,
      {} as never,
      {},
      {} as never,
      {} as never,
      {} as never,
      signal,
    ),
  ).rejects.toThrow('cancelled before recheck');
});
