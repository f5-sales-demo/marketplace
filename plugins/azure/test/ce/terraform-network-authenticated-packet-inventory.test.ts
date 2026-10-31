import { expect } from 'bun:test';
import { chmod, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import {
  type AzureTerraformNetworkPacketInventoryContext,
  readAzureTerraformNetworkAuthenticatedPacketInventory,
  recheckAzureTerraformNetworkAuthenticatedPacketInventory,
} from '../../src/ce/terraform-network-authenticated-packet-inventory';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { test } from './owned-fixture-test';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';
import { completedReplacement } from './terraform-network-mixed-generation-fixture';

import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

for (const replacement of [false, true])
  test(`authenticated ${replacement ? 'replacement' : 'network'} packet inventory preserves semantic and native custody without parent admission`, async () => {
    {
      const replacementFixture = replacement ? await completedReplacement(false) : undefined;
      const birth = replacementFixture ? undefined : await terraformNetworkSourceFixture(false);
      let network: Awaited<ReturnType<typeof terraformNetworkMainRunnerFixture>> | undefined;
      if (birth) {
        const plan = compileAzureTerraformNetworkUpdatePlan(birth.plan, birth.original);
        const sources = new Map(birth.sources);
        sources.set(plan.planSha256, plan);
        network = await terraformNetworkMainRunnerFixture(false, {
          plan,
          sources,
          source: birth.source,
          inventory: await captureAzureNetworkUpdateInventory(plan, birth.api),
        });
      }
      const current = replacementFixture
        ? {
            request: replacementFixture.first,
            store: replacementFixture.f.store,
            context: {
              loaders: replacementFixture.loaders,
              site: replacementFixture.f.birth.site,
              verifier: replacementFixture.f.dependencies.qualifyHistorical,
              replacementVerifier: replacementFixture.f.dependencies.qualifyCompletedOperational,
            },
          }
        : network
          ? {
              request: network.plan,
              store: network.store,
              context: {
                loaders: network.loaders,
                site: network.site,
                verifier: network.dependencies.qualifyAcceptance,
              },
            }
          : undefined;
      if (!current) throw Error('actual owned packet fixture required');
      const { request, store } = current;
      const context: AzureTerraformNetworkPacketInventoryContext = current.context;
      const unqualified = 'unqualified-inventory-record.json';
      await store.write(unqualified, { schemaVersion: 1, owner: store.owner, status: 'retired' });
      const witness = await readAzureTerraformNetworkAuthenticatedPacketInventory(request, store, context);
      expect(witness.kind).toBe(replacement ? 'completed-replacement' : 'network-graph');
      expect(witness.packets.length).toBeGreaterThan(0);
      expect(witness.nativeRootSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(witness.packets.map((packet) => packet.name)).toContain(
        replacement
          ? `${request.planId}-terraform-quiesce-plan.json`
          : `${request.planId}-terraform-network-source.json`,
      );
      expect(witness.unconsumedRootPackets).toContain(unqualified);
      expect(witness.packets.map((packet) => packet.name)).not.toContain(unqualified);
      expect(witness.completeParentInventoryQualified).toBe(false);
      expect(witness.nativeChildRetirementQualified).toBe(false);
      expect(witness.parentRetirementQualified).toBe(false);
      expect(witness.currentOperationalAcceptanceQualified).toBe(false);
      expect(JSON.stringify(witness)).not.toContain('#cloud-config');
      expect(new Set(witness.packets.map((packet) => packet.name)).size).toBe(witness.packets.length);
      for (const packet of witness.packets) {
        expect(packet.packetSha256).toBe(canonicalSha256(await store.read(packet.name)));
        expect(packet.bytesSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(packet.identity).toMatch(/^\d+:\d+:/);
      }
      const commands = network ? [...network.commands] : undefined;
      const applies = replacementFixture?.f.state.applies;
      const recheck = (value: unknown = witness, signal?: AbortSignal) =>
        recheckAzureTerraformNetworkAuthenticatedPacketInventory(value, request, store, context, signal);
      await recheck();
      if (commands) expect(network?.commands).toEqual(commands);
      if (replacementFixture && applies !== undefined) expect(replacementFixture.f.state.applies).toEqual(applies);
      await expect(recheck(structuredClone(witness))).rejects.toThrow('owning authenticated');
      await expect(
        recheckAzureTerraformNetworkAuthenticatedPacketInventory(witness, request, store, { ...context }),
      ).rejects.toThrow('owning authenticated');
      const controller = new AbortController();
      controller.abort(Error('packet inventory aborted'));
      await expect(recheck(witness, controller.signal)).rejects.toThrow('packet inventory aborted');
      const firstPacket = witness.packets[0];
      if (!firstPacket) throw Error('complete authenticated packets required');
      const digest = firstPacket.packetSha256;
      firstPacket.packetSha256 = 'a'.repeat(64);
      await expect(recheck()).rejects.toThrow('owning authenticated');
      firstPacket.packetSha256 = digest;
      // Identical bytes with a different inode cannot reuse a previously minted witness.
      const path = join(store.directory, firstPacket.name);
      const backup = `${store.directory}-packet-custody-original`;
      const bytes = await readFile(path);
      await rename(path, backup);
      try {
        await writeFile(path, bytes, { mode: 0o600 });
        await expect(recheck()).rejects.toThrow('inode or namespace changed');
      } finally {
        await rm(path, { force: true });
        await rename(backup, path);
      }
      // Even an unconsumed record cannot change across the callback span.
      const other = join(store.directory, unqualified),
        otherBytes = await readFile(other);
      await writeFile(other, JSON.stringify({ status: 'foreign' }), { mode: 0o600 });
      await expect(recheck()).rejects.toThrow('bytes, inode or namespace changed');
      await writeFile(other, otherBytes, { mode: 0o600 });
      await store.write('late-unqualified-record.json', {});
      await expect(recheck()).rejects.toThrow('namespace changed');
      await store.remove('late-unqualified-record.json');
      await recheck();
      // A logical reader cannot fabricate absence of a native authenticated record.
      const originalRead = store.read;
      const target = firstPacket.name;
      store.read = async (name) => {
        if (name === target) throw Object.assign(Error('fabricated absence'), { code: 'ENOENT' });
        return originalRead.call(store, name);
      };
      await expect(readAzureTerraformNetworkAuthenticatedPacketInventory(request, store, context)).rejects.toThrow();
      store.read = originalRead;
      // Unavailable ownership is a real failure, never an empty authenticated inventory.
      const originalVerify = store.verify;
      store.verify = async () => {
        throw Error('owning packet service unavailable');
      };
      await expect(readAzureTerraformNetworkAuthenticatedPacketInventory(request, store, context)).rejects.toThrow(
        'owning packet service unavailable',
      );
      store.verify = originalVerify;
      // A malformed or publicly readable unrelated packet still blocks native custody.
      await writeFile(other, 'invalid-json', { mode: 0o600 });
      await expect(readAzureTerraformNetworkAuthenticatedPacketInventory(request, store, context)).rejects.toThrow(
        'malformed native packet',
      );
      await writeFile(other, otherBytes, { mode: 0o600 });
      await chmod(other, 0o644);
      await expect(readAzureTerraformNetworkAuthenticatedPacketInventory(request, store, context)).rejects.toThrow(
        'native packet custody differs',
      );
      await chmod(other, 0o600);
      // Abort wins over an owning callback which ignores its signal, including late release.
      const loadSource = context.loaders.loadSource;
      const started = Promise.withResolvers<void>(),
        release = Promise.withResolvers<void>(),
        returned = Promise.withResolvers<void>();
      context.loaders.loadSource = async (digest) => {
        const value = await loadSource(digest);
        started.resolve();
        await release.promise;
        returned.resolve();
        return value;
      };
      const cancellation = new AbortController();
      const running = readAzureTerraformNetworkAuthenticatedPacketInventory(
        request,
        store,
        context,
        cancellation.signal,
      );
      try {
        await started.promise;
        cancellation.abort(Error('ignored owning packet callback cancelled'));
        await expect(running).rejects.toThrow('ignored owning packet callback cancelled');
      } finally {
        release.resolve();
        await returned.promise;
        context.loaders.loadSource = loadSource;
      }
    }
  }, 180000);
