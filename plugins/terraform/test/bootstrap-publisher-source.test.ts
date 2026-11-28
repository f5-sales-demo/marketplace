/** Real local filesystem publication; no cloud, token or provider-consumption acceptance. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertOriginalReaderGroupClosure,
  assertOriginalReaderGroupInputs,
  persistOriginalReaderGroupSet,
} from '../src/original-reader-group-closure';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
for (const fault of ['none', 'pre-spawn', 'pre-admission', 'final-guard', 'collision'] as const)
  test(`original bootstrap publisher retains native closure and single-use claim: ${fault}`, async () => {
    const module = await import('../src/bootstrap-grant-publication');
    await withApplyInventory(
      async ({ before, store }) => {
        const context = before.original;
        const plan = await context.readOriginalPlanSource?.();
        if (!plan) throw new Error('Original plan source required');
        const directory = join(context.executionDirectory, '.xcsh-original-bootstrap', plan.receipt.planSha256);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const stat = await lstat(directory, { bigint: true });
        const original = await module.ownOriginalBootstrapPublisherDirectory(context, {
          directory,
          identity: { dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode },
        });
        expect(await module.collectOriginalBootstrapPublisherSource(original)).toEqual({
          name: 'bootstrap-publisher',
          attemptCount: 0,
          invocationCount: 0,
          unspawned: [],
          witnesses: [],
        });
        await expect(module.collectOriginalBootstrapPublisherSource({ ...original })).rejects.toThrow('source-issued');
        const nonce = 'a'.repeat(32),
          tokenHash = 'b'.repeat(64);
        const claim = {
          schemaVersion: 1,
          kind: 'original-gcp-bootstrap-grant-claim',
          owner: context.owner,
          planSha256: plan.receipt.planSha256,
          executor: before.execution.identity,
          nodeName: 'example-node',
          tokenName: 'example-token',
          nonce,
          jwtSha256: tokenHash,
          tokenCreationSha256: 'c'.repeat(64),
          originalStartMs: context.budget.start,
          originalDeadlineMs: context.budget.deadline,
        };
        await writeFile(join(directory, `claim-${nonce}.json`), JSON.stringify(claim), { mode: 0o400, flag: 'wx' });
        const raw = Buffer.from(
          JSON.stringify({
            payload: { nonce, scope_sha256: plan.receipt.planSha256, content_sha256: tokenHash },
            signature: 'SOURCE_ONLY_SIGNATURE',
          }),
        );
        const grantPath = join(directory, `grant-${nonce}.json`);
        if (fault === 'collision')
          await writeFile(grantPath, 'SOURCE_ONLY_EXISTING_GRANT', { mode: 0o400, flag: 'wx' });
        let calls = 0;
        const guard = async () => {
          calls++;
          if (fault === 'pre-spawn' && calls === 3) throw new Error('Intentional before-spawn input refusal');
          if (
            fault === 'pre-admission' &&
            (await readFile(join(directory, `publisher-${nonce}-admission-entered.json`)).then(
              () => true,
              () => false,
            ))
          )
            throw new Error('Intentional native admission refusal');
          if (
            fault === 'final-guard' &&
            (await readFile(grantPath).then(
              () => true,
              () => false,
            ))
          )
            throw new Error('Intentional final input refusal');
        };
        try {
          if (fault === 'none')
            expect(await module.publishSignedBootstrapGrant(context, original, nonce, raw, guard, {})).toEqual({
              name: `grant-${nonce}.json`,
              sha256: hash(raw),
            });
          else
            await expect(
              module.publishSignedBootstrapGrant(context, original, nonce, raw, guard, {}),
            ).rejects.toThrow();
          await expect(
            module.publishSignedBootstrapGrant(context, original, nonce, raw, async () => {}, {}),
          ).rejects.toThrow('claimed');
          if (fault === 'pre-spawn') {
            const row = await module.collectOriginalBootstrapPublisherSource(original);
            expect(row.attemptCount).toBe(0);
            expect(row.invocationCount).toBe(1);
            expect(row.witnesses).toHaveLength(0);
            expect(row.unspawned).toHaveLength(1);
            const inputs = await persistOriginalReaderGroupSet({
              store,
              owner: context.owner,
              requiredSources: ['bootstrap-publisher'],
              sources: [row],
            });
            await assertOriginalReaderGroupInputs({
              inputs,
              owner: context.owner,
              requiredSources: ['bootstrap-publisher'],
            });
            const { readOwnedInstalledInput } = await import('../src/installed-runtime');
            const { collectOriginalSignalFreeUnspawnedExecutions } = await import('../src/signal-free-executor');
            await expect(
              collectOriginalSignalFreeUnspawnedExecutions(async () => ({ code: 0, stdout: '', stderr: '' })),
            ).rejects.toThrow('source-issued');
            const evidence = row.unspawned?.[0];
            if (!evidence) throw new Error('Original native no-spawn evidence required');
            const originalBytes = await readFile(evidence.evidence.path);
            const nativeEvidence = JSON.parse(originalBytes.toString());
            const forged = async (label: string, change: Record<string, unknown>) => {
              const { dirname } = await import('node:path');
              const root = join(dirname(dirname(evidence.evidence.path)), label);
              await mkdir(root, { mode: 0o700 });
              const path = join(root, 'source.private.json');
              await writeFile(path, JSON.stringify({ ...nativeEvidence, ...change }), { mode: 0o400, flag: 'wx' });
              return {
                ...row,
                unspawned: [{ request: evidence.request, evidence: (await readOwnedInstalledInput(path)).binding }],
              };
            };
            const wrongGate = await forged('wrong-gate', { gateSha256: 'f'.repeat(64) });
            await expect(
              persistOriginalReaderGroupSet({
                store,
                owner: context.owner,
                requiredSources: ['bootstrap-publisher'],
                sources: [wrongGate],
              }),
            ).rejects.toThrow();
            const expired = await forged('expired-invocation', { invocationStartedMs: context.budget.deadline });
            await expect(
              persistOriginalReaderGroupSet({
                store,
                owner: context.owner,
                requiredSources: ['bootstrap-publisher'],
                sources: [expired],
              }),
            ).rejects.toThrow();
            await expect(
              persistOriginalReaderGroupSet({
                store,
                owner: context.owner,
                requiredSources: ['publisher-a', 'publisher-b'],
                sources: [
                  { ...row, name: 'publisher-a' },
                  { ...row, name: 'publisher-b' },
                ],
              }),
            ).rejects.toThrow();
            await expect(
              persistOriginalReaderGroupSet({
                store,
                owner: context.owner,
                requiredSources: ['bootstrap-publisher'],
                sources: [{ ...row, invocationCount: 2 }],
              }),
            ).rejects.toThrow('coverage');
            await rename(evidence.evidence.path, `${evidence.evidence.path}.original`);
            await writeFile(evidence.evidence.path, originalBytes, { mode: 0o400, flag: 'wx' });
            await expect(
              persistOriginalReaderGroupSet({
                store,
                owner: context.owner,
                requiredSources: ['bootstrap-publisher'],
                sources: [row],
              }),
            ).rejects.toThrow();
            return;
          }
          const flags = join(directory, '.terraform-executor-lock/capture-unresolved.json');
          const flagBefore = await readFile(flags).catch((error) => {
            if (error.code === 'ENOENT') return undefined;
            throw error;
          });
          const row = await module.collectOriginalBootstrapPublisherSource(original);
          expect(row.attemptCount).toBe(1);
          expect(row.witnesses).toHaveLength(1);
          const witness = row.witnesses[0];
          expect(witness.physicalGroupAbsent).toBe(true);
          expect(witness.executionAccepted).toBe(false);
          expect(witness.origin?.kind).toBe('original-bootstrap-publisher-origin');
          if (witness.origin?.kind !== 'original-bootstrap-publisher-origin')
            throw new Error('Original publisher origin required');
          expect(witness.origin.owner).toEqual(context.owner);
          expect(witness.origin.nonce).toBe(nonce);
          expect(witness.origin.admissionRecorded).toBe(fault !== 'pre-admission');
          await assertOriginalReaderGroupClosure(witness);
          const inputs = await persistOriginalReaderGroupSet({
            store,
            owner: context.owner,
            requiredSources: ['bootstrap-publisher'],
            sources: [row],
          });
          await assertOriginalReaderGroupInputs({
            inputs,
            owner: context.owner,
            requiredSources: ['bootstrap-publisher'],
          });
          if (flagBefore) expect(await readFile(flags)).toEqual(flagBefore);
          if (fault === 'collision') expect(await readFile(grantPath, 'utf8')).toBe('SOURCE_ONLY_EXISTING_GRANT');
          const path = witness.origin.request.path,
            bytes = await readFile(path);
          await rename(path, `${path}.original`);
          await writeFile(path, bytes, { mode: 0o400, flag: 'wx' });
          await expect(module.collectOriginalBootstrapPublisherSource(original)).rejects.toThrow();
        } finally {
          const retained = await retainOwnedTestCapture(
            directory,
            `publisher-${fault}`,
            fault === 'none' ? 'success' : 'failure',
          );
          console.info(JSON.stringify({ kind: 'private-native-capture-retained', ...retained }));
        }
      },
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      true,
    );
  }, 120_000);
