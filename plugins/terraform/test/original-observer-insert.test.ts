import { expect, test } from 'bun:test';
import * as observer from '../src/gcp-observer-insert-evidence';
import { withObserverInsert } from './fixtures/observer-insert.fixture';

test('original observer insertion joins exact plan/baseline/request/image without CE bootstrap inheritance', async () => {
  await withObserverInsert(async (input) => {
    const packet = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const view = await observer.readOriginalGcpObserverInsertIdentity(packet);
    expect(view.kind).toBe('original-gcp-observer-insert-identity');
    expect(view.role).toBe('observer');
    expect(view.imageId).toBe('4996011480491275419');
    expect(view.targetId).toBe(input.operation.targetId as string);
    expect(view.observerExecutionAuthorized).toBe(false);
    expect(JSON.stringify(view)).not.toContain('ubuntu:');
    await expect(observer.readOriginalGcpObserverInsertIdentity({ ...packet })).rejects.toThrow('Original');
  });
}, 60000);

test('unissued observer insertion inputs cannot use copied callback/baseline/response/image sources', async () => {
  await withObserverInsert(async (input) => {
    for (const key of ['callback', 'baseline', 'response', 'image'] as const)
      await expect(
        observer.collectOriginalGcpObserverInsertIdentity({ ...input, [key]: { ...input[key] } }),
      ).rejects.toThrow(/[Oo]riginal/);
  });
}, 60000);

test('a copied lookalike image reader cannot supply observer image provenance', async () => {
  await withObserverInsert(async (input) => {
    const raw = await input.imageReader.readEvidence(input.image);
    const imageReader = { ...input.imageReader, read: async () => input.image, readEvidence: async () => raw };
    await expect(observer.collectOriginalGcpObserverInsertIdentity({ ...input, imageReader })).rejects.toThrow();
  });
}, 60000);

for (const change of [
  { canIpForward: true },
  { serviceAccounts: [{ email: 'default' }] },
  { labels: { 'xcsh-engine': 'terraform', 'xcsh-role': 'ce' } },
  { metadata: { items: [{ key: 'user-data', value: 'example-ce-bootstrap' }] } },
  {
    disks: [
      {
        boot: true,
        autoDelete: true,
        source: 'projects/example-project/zones/northamerica-northeast1-a/disks/example-foreign',
      },
    ],
  },
])
  test(`observer request refuses incompatible role or resource ownership: ${Object.keys(change)[0]}`, async () => {
    await withObserverInsert(
      async (input) => {
        await expect(observer.collectOriginalGcpObserverInsertIdentity(input)).rejects.toThrow();
      },
      (request) => Object.assign(request, change),
    );
  }, 60000);

test('documented provider attribution label and explicit false disk deletion preserve observer identity', async () => {
  await withObserverInsert(
    async (input) => {
      const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
      expect((await observer.readOriginalGcpObserverInsertIdentity(identity)).role).toBe('observer');
    },
    (request) => {
      (request.labels as Record<string, unknown>)['goog-terraform-provisioned'] = 'true';
      (request.disks as Record<string, unknown>[])[0].autoDelete = false;
    },
  );
}, 60000);

test('observer insertion remains bound to the actual final callback and rejects a copied callback', async () => {
  let identity: observer.OriginalGcpObserverInsertIdentity | undefined;
  await withObserverInsert(
    async (input) => {
      identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    },
    undefined,
    async (final) => {
      expect((await observer.readOriginalGcpObserverInsertIdentity(identity, final)).role).toBe('observer');
      await expect(observer.readOriginalGcpObserverInsertIdentity(identity, { ...final })).rejects.toThrow();
      await expect(observer.readOriginalGcpObserverInsertIdentity(identity, final)).rejects.toThrow('retired');
    },
  );
}, 60000);
