import { expect, test } from 'bun:test';
import {
  collectOriginalEarlyGcpInsertIdentity,
  collectOriginalGcpInsertWitnesses,
  joinOriginalGcpInsertSource,
  readOriginalEarlyGcpInsertIdentity,
} from '../src/gcp-insert-evidence';
import {
  collectOriginalGcpObserverInsertIdentity,
  readOriginalGcpObserverInsertIdentity,
} from '../src/gcp-observer-insert-evidence';
import { withObserverInsert } from './fixtures/observer-insert.fixture';
import { withInsertWitnesses } from './fixtures/original-insert-witness.fixture';

test('current Google CE insertion joins the original plan, response and verified provider window', async () => {
  await withInsertWitnesses(
    async (input) => {
      const early = await collectOriginalEarlyGcpInsertIdentity({
        originalPlan: input.originalPlan,
        response: input.earlyResponse,
        binding: input.binding,
      });
      expect(early.nodeName).toBe('example-node');
      expect(early.targetId).toBe(input.insert.targetId);
      expect(await readOriginalEarlyGcpInsertIdentity(early)).toBe(early);
      const joined = await collectOriginalGcpInsertWitnesses(input);
      expect(joined.providerSha256).toBe('97cc25d78bb8fc4c4cccc0672af0cc776b1175e0f0a5cd6a67ba55f0380189f0');
      expect(joined.originalInsertQualified).toBe(false);
      expect(joined.applyRpcQualified).toBe(false);
      await expect(
        collectOriginalEarlyGcpInsertIdentity({
          originalPlan: { ...input.originalPlan },
          response: input.earlyResponse,
          binding: input.binding,
        }),
      ).rejects.toThrow('Original');
      expect(() =>
        joinOriginalGcpInsertSource({
          ...input,
          plan: input.originalPlan.receipt,
          parent: input.window.executor,
          window: { ...input.window, schemaVersion: 3, kind: 'original-provider-stderr-coherent-window' },
        }),
      ).toThrow('verified window');
    },
    'normal',
    '8.12.0',
  );
}, 60000);

test('current observer insertion keeps its exact profile, original baseline and pinned image', async () => {
  await withObserverInsert(
    async (input) => {
      const packet = await collectOriginalGcpObserverInsertIdentity(input);
      const view = await readOriginalGcpObserverInsertIdentity(packet);
      expect(view.imageId).toBe('4996011480491275419');
      expect(view.role).toBe('observer');
      expect(view.observerExecutionAuthorized).toBe(false);
      await expect(
        collectOriginalGcpObserverInsertIdentity({ ...input, response: { ...input.response } }),
      ).rejects.toThrow('Original');
      await expect(readOriginalGcpObserverInsertIdentity({ ...packet })).rejects.toThrow('Original');
    },
    undefined,
    undefined,
    undefined,
    true,
  );
}, 60000);
