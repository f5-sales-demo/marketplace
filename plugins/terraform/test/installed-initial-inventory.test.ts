import { expect, test } from 'bun:test';
import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { originalGcpBootstrapSource } from '../../platform/src/ce/gcp-bootstrap-evidence';
import type { GcpBootstrapObservationSourceBinding } from '../../platform/src/ce/gcp-bootstrap-observation';
import { openOriginalGcpBootstrapObservation } from '../../platform/src/ce/gcp-bootstrap-observation';
import { openInstalledInitialInventory } from '../src/installed-initial-inventory';
import { prepareOriginalGcpInventoryScope } from '../src/original-gcp-inventory-scope';
import { authInfo, fixture } from './original-gcp-inventory-fixture';

function transport(cloudReply?: (url: URL) => Response | Promise<Response>) {
  const reads: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    const selected = new URL(String(url));
    if (selected.pathname === '/token')
      return Response.json({ access_token: 'synthetic-access', token_type: 'Bearer', expires_in: 3599 });
    if (selected.pathname === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
    if (selected.pathname === '/v1/projects/example-project')
      return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
    reads.push(selected.pathname);
    return cloudReply
      ? cloudReply(selected)
      : Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 });
  }) as typeof fetch;
  return { fetcher, reads };
}

for (const ha of [false, true])
  test(`initial ${ha ? 'HA observer' : 'single-node'} inventory requires every original plan target and retains issuer evidence`, async () => {
    await fixture(
      async (context, store) => {
        const scope = await prepareOriginalGcpInventoryScope(context, store);
        const cloud = transport();
        let platformReads = 0;
        // Explicit offline transport fixture using the actual Platform issuer.
        const platform = {
          gcpBootstrapSource: () => originalGcpBootstrapSource,
          gcpBootstrapObservation: async (
            _owner: unknown,
            _name: string,
            binding: GcpBootstrapObservationSourceBinding,
          ) =>
            openOriginalGcpBootstrapObservation(
              {
                ...binding,
                store,
                credential: context.environment.XCSH_API_TOKEN,
                origin: context.environment.XCSH_API_URL,
              },
              {
                fetcher: async () => {
                  platformReads++;
                  return Response.json({ error: 'synthetic missing resource' }, { status: 404 });
                },
              },
            ),
        };
        const collector = await openInstalledInitialInventory(
          { context, scope, store, platform },
          { fetcher: cloud.fetcher },
        );
        expect(
          await openInstalledInitialInventory({ context, scope, store, platform }, { fetcher: cloud.fetcher }),
        ).toBe(collector);
        const snapshot = await collector.capture();
        const summary = await collector.inspect(snapshot);
        expect(summary.resources).toHaveLength(ha ? 21 : 8);
        expect(summary.cloudCount).toBe(ha ? 17 : 6);
        expect(summary.platformCount).toBe(ha ? 4 : 2);
        expect(summary.creationOwnershipQualified).toBe(false);
        expect(summary.executionAuthorized).toBe(false);
        expect(cloud.reads).toHaveLength(ha ? 17 : 6);
        expect(platformReads).toBe(ha ? 4 : 2);
        expect(JSON.stringify(snapshot)).not.toMatch(/synthetic|token|credential/);
        await collector.assertSnapshot(snapshot);
        await expect(collector.assertSnapshot({ ...snapshot })).rejects.toThrow('Original');
        await expect(collector.capture()).rejects.toThrow('claimed');
        const closure = collector.close();
        expect(collector.close()).toBe(closure);
        await closure;
        await expect(collector.assertSnapshot(snapshot)).rejects.toThrow('retired');
        expect(
          (await readdir(store.directory)).some(
            (name) => name.includes('initial-inventory') && name.includes('complete'),
          ),
        ).toBe(true);
      },
      '',
      ha,
    );
  }, 60000); // Original issuer integration retains up to 21 resources and their ownership receipts.

test('a present cloud resource retains partial inventory and permanently refuses another initial scan', async () => {
  await fixture(
    async (context, store) => {
      const scope = await prepareOriginalGcpInventoryScope(context, store);
      const cloud = transport((url) => {
        if (!url.pathname.includes('/disks/'))
          return Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 });
        const parts = url.pathname.split('/');
        return Response.json({
          kind: 'compute#disk',
          id: '4996011480491275425',
          name: parts.at(-1),
          selfLink: `https://www.googleapis.com${url.pathname}`,
          zone: `https://www.googleapis.com/compute/v1/projects/example-project/zones/${parts[parts.indexOf('zones') + 1]}`,
          creationTimestamp: '2026-11-09T00:00:00Z',
        });
      });
      const platform = {
        gcpBootstrapSource: () => originalGcpBootstrapSource,
        gcpBootstrapObservation: async (
          _owner: unknown,
          _name: string,
          binding: GcpBootstrapObservationSourceBinding,
        ) =>
          openOriginalGcpBootstrapObservation(
            {
              ...binding,
              store,
              credential: context.environment.XCSH_API_TOKEN,
              origin: context.environment.XCSH_API_URL,
            },
            { fetcher: async () => Response.json({}, { status: 404 }) },
          ),
      };
      const collector = await openInstalledInitialInventory(
        { context, scope, store, platform },
        { fetcher: cloud.fetcher },
      );
      await expect(collector.capture()).rejects.toThrow('already exists');
      const count = cloud.reads.length;
      await expect(collector.capture()).rejects.toThrow('claimed');
      expect(cloud.reads).toHaveLength(count);
      const files = await readdir(store.directory);
      const failed = files.find((name) => name.includes('initial-inventory') && name.includes('failed'));
      if (!failed) throw new Error('Original failed initial inventory receipt required');
      expect(
        JSON.parse(await readFile(join(store.directory, failed), 'utf8')).resources.some(
          (row: { present: boolean }) => row.present,
        ),
      ).toBe(true);
      await collector.close();
    },
    '',
    false,
  );
});

test('initial evidence cannot survive credential rotation or restored bytes', async () => {
  await fixture(
    async (context, store) => {
      const scope = await prepareOriginalGcpInventoryScope(context, store);
      const cloud = transport();
      const platform = {
        gcpBootstrapSource: () => originalGcpBootstrapSource,
        gcpBootstrapObservation: async (
          _owner: unknown,
          _name: string,
          binding: GcpBootstrapObservationSourceBinding,
        ) =>
          openOriginalGcpBootstrapObservation(
            {
              ...binding,
              store,
              credential: context.environment.XCSH_API_TOKEN,
              origin: context.environment.XCSH_API_URL,
            },
            { fetcher: async () => Response.json({}, { status: 404 }) },
          ),
      };
      const collector = await openInstalledInitialInventory(
        { context, scope, store, platform },
        { fetcher: cloud.fetcher },
      );
      const snapshot = await collector.capture();
      const path = context.inputs.adc.path,
        original = await readFile(path);
      await chmod(path, 0o600);
      await writeFile(path, 'replaced credential');
      await expect(collector.assertSnapshot(snapshot)).rejects.toThrow();
      expect(
        (await readdir(store.directory)).some((name) => name.includes('initial-inventory') && name.includes('failed')),
      ).toBe(true);
      await writeFile(path, original);
      await chmod(path, 0o400);
      await expect(collector.assertSnapshot(snapshot)).rejects.toThrow('retired');
      await collector.close();
    },
    '',
    false,
  );
});

test('closing a pending initial capture retains partial bytes and its failed record before returning', async () => {
  await fixture(
    async (context, store) => {
      const scope = await prepareOriginalGcpInventoryScope(context, store);
      const consumed = Promise.withResolvers<void>();
      let pulls = 0,
        cancelled = false;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (++pulls === 1) {
              controller.enqueue(Buffer.from('partial-initial-owned'));
              return;
            }
            consumed.resolve();
            return new Promise<void>(() => {});
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      const cloud = transport(() => new Response(stream));
      const platform = {
        gcpBootstrapSource: () => originalGcpBootstrapSource,
        gcpBootstrapObservation: async (
          _owner: unknown,
          _name: string,
          binding: GcpBootstrapObservationSourceBinding,
        ) =>
          openOriginalGcpBootstrapObservation(
            {
              ...binding,
              store,
              credential: context.environment.XCSH_API_TOKEN,
              origin: context.environment.XCSH_API_URL,
            },
            { fetcher: async () => Response.json({}, { status: 404 }) },
          ),
      };
      const collector = await openInstalledInitialInventory(
        { context, scope, store, platform },
        { fetcher: cloud.fetcher },
      );
      const pending = collector.capture();
      pending.catch(() => {});
      await consumed.promise;
      const closed = collector.close();
      await expect(pending).rejects.toThrow();
      await closed;
      expect(cancelled).toBe(true);
      const files = await readdir(context.executionDirectory, { recursive: true });
      const body = files.find((name) => name.endsWith('.body.private.bin'));
      if (!body) throw new Error('Original partial initial inventory bytes required');
      expect(await readFile(join(context.executionDirectory, body), 'utf8')).toBe('partial-initial-owned');
      expect(
        (await readdir(store.directory)).some((name) => name.includes('initial-inventory') && name.includes('failed')),
      ).toBe(true);
      expect(
        (await readdir(store.directory)).some(
          (name) => name.includes('initial-inventory') && name.includes('complete'),
        ),
      ).toBe(false);
    },
    '',
    false,
  );
});

test('a changed completed inventory receipt cannot be restored into original evidence', async () => {
  await fixture(
    async (context, store) => {
      const scope = await prepareOriginalGcpInventoryScope(context, store);
      const cloud = transport();
      const platform = {
        gcpBootstrapSource: () => originalGcpBootstrapSource,
        gcpBootstrapObservation: async (
          _owner: unknown,
          _name: string,
          binding: GcpBootstrapObservationSourceBinding,
        ) =>
          openOriginalGcpBootstrapObservation(
            {
              ...binding,
              store,
              credential: context.environment.XCSH_API_TOKEN,
              origin: context.environment.XCSH_API_URL,
            },
            { fetcher: async () => Response.json({}, { status: 404 }) },
          ),
      };
      const collector = await openInstalledInitialInventory(
        { context, scope, store, platform },
        { fetcher: cloud.fetcher },
      );
      const snapshot = await collector.capture();
      const name = (await readdir(store.directory)).find(
        (name) => name.includes('initial-inventory') && name.includes('complete'),
      );
      if (!name) throw new Error('Original complete inventory receipt required');
      const path = join(store.directory, name),
        bytes = await readFile(path);
      await writeFile(path, 'changed receipt');
      await expect(collector.assertSnapshot(snapshot)).rejects.toThrow();
      await writeFile(path, bytes);
      await expect(collector.assertSnapshot(snapshot)).rejects.toThrow('retired');
      expect(await openInstalledInitialInventory({ context, scope, store, platform }, { fetcher: cloud.fetcher })).toBe(
        collector,
      );
      await expect(collector.capture()).rejects.toThrow('claimed');
      await collector.close();
    },
    '',
    false,
  );
});
