/** Native gated output and owning plan/context; explicit symbolic provider labels only. */
import { expect, test } from 'bun:test';
import {
  GCP_XCSH15176_TERRAFORM_ARTIFACTS,
  GCP_XCSH15178_TERRAFORM_ARTIFACTS,
  GCP_XCSH15179_TERRAFORM_ARTIFACTS,
} from '../../gcloud/src/ce/terraform-public-artifacts';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { readOriginalGcpPreapplyBootstrapJwt } from '../src/gcp-preapply-bootstrap';
import {
  assertOriginalApplyGcpInventoryCallback,
  readOriginalApplyGcpInventory,
} from '../src/installed-initial-inventory';
import {
  closePreparedCreationScope,
  inspectPreparedCreationScope,
  prepareOriginalCreationScope,
} from '../src/prepared-creation-scope';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { openOriginalBootstrapFixture } from './fixtures/original-bootstrap-source.fixture';

test('original inventory and bootstrap creation scope share one actual context and owning plan', async () => {
  await withApplyInventory(
    async ({ before, packet }) => {
      const source = await prepareOriginalCreationScope(before.original);
      try {
        const view = await inspectPreparedCreationScope(source);
        expect(view.resources).toHaveLength(4);
        await assertOriginalApplyGcpInventoryCallback(packet, before);
        expect(view.planSha256).toBe((await readOriginalApplyGcpInventory(packet)).planSha256);
        expect(await prepareOriginalCreationScope(before.original)).toBe(source);
      } finally {
        closePreparedCreationScope(source);
      }
    },
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    GCP_XCSH15176_TERRAFORM_ARTIFACTS.providerLock,
    true,
    undefined,
    true,
  );
}, 60000);

for (const profile of [
  { artifact: GCP_XCSH15176_TERRAFORM_ARTIFACTS, version: '15.17.6', schemaVersion: 5 },
  { artifact: GCP_XCSH15178_TERRAFORM_ARTIFACTS, version: '15.17.8', schemaVersion: 6 },
  { artifact: GCP_XCSH15179_TERRAFORM_ARTIFACTS, version: '15.17.9', schemaVersion: 7 },
] as const) {
  test(`original ${profile.version} bootstrap and SDK receipts compose with the native inventory actor`, async () => {
    await withApplyInventory(
      async ({ before, store }) => {
        const saved = (await store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
        const site = saved.intent.sites[0],
          node = site.nodes[0];
        const jwt = [
          Buffer.from('{}').toString('base64url'),
          Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
          Buffer.from('synthetic-signature').toString('base64url'),
        ].join('.');
        const original = await openOriginalBootstrapFixture(
          before.original,
          before.execution,
          store,
          site.name,
          node.name,
          jwt,
        );
        try {
          expect(original.targets).toBe(4);
          expect(original.value.schemaVersion).toBe(profile.schemaVersion);
          expect(original.value.xcshProviderVersion).toBe(profile.version);
          expect(await readOriginalGcpPreapplyBootstrapJwt(original.value)).toBe(jwt);
          expect(original.value.bootstrap.nodeName).toBe(node.name);
          expect(original.value.bootstrapOwnershipQualified).toBe(false);
        } finally {
          await original.close();
        }
      },
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      profile.artifact.providerLock,
      true,
      undefined,
      true,
    );
  }, 60000);
}
