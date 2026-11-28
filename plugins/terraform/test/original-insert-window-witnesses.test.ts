/** Actual owning plan/output and window issuers; provider observations are offline fixtures. */
import { expect, test } from 'bun:test';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as inserts from '../src/gcp-insert-evidence';
import { withInsertWitnesses } from './fixtures/original-insert-witness.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const mode of ['overlap', 'reverse', 'gap', 'one-ms-gap', 'changed-fifo', 'copied', 'restoration'] as const)
  test(`current original insert witnesses retain conservative multiple-window coverage: ${mode}`, async () => {
    await withInsertWitnesses(
      async (input) => {
        const { window: _single, allWindows: originals, ...source } = input;
        const windows =
          mode === 'copied'
            ? [originals[0], { ...originals[1] }]
            : mode === 'reverse'
              ? [...originals].reverse()
              : [...originals];
        const multiple = { ...source, windows };
        if (['gap', 'one-ms-gap', 'changed-fifo', 'copied'].includes(mode)) {
          await expect(inserts.collectOriginalGcpInsertWitnesses(multiple)).rejects.toThrow();
        } else {
          const candidate = await inserts.collectOriginalGcpInsertWitnesses(multiple);
          const proof = await inserts.readOriginalGcpInsertWitnesses(candidate);
          expect(proof.schemaVersion).toBe(2);
          expect(proof.windowSha256s).toHaveLength(2);
          expect(proof.uiSourceCorroborated).toBe(true);
          expect(proof.httpSourceCorroborated).toBe(true);
          expect(proof.rpcWindowTimeCorroborated).toBe(true);
          expect(proof.rpcServedEpochMs - proof.rpcReceivedEpochMs).toBe(69000);
          expect(candidate.originalInsertQualified).toBe(false);
          windows.pop();
          expect((await inserts.readOriginalGcpInsertWitnesses(candidate)).schemaVersion).toBe(2);
          if (mode === 'restoration') {
            const path = originals[1].evidencePath;
            const bytes = await readFile(path);
            await rename(path, `${path}.original`);
            await writeFile(path, bytes, { mode: 0o400 });
            await expect(inserts.readOriginalGcpInsertWitnesses(candidate)).rejects.toThrow();
            await rename(`${path}.original`, path);
            await expect(inserts.readOriginalGcpInsertWitnesses(candidate)).rejects.toThrow('refused');
          }
        }
        await retainOwnedTestCapture(input.originalPlan.directory, `insert-windows-${mode}`, 'success');
        for (const [index, original] of originals.entries())
          await retainOwnedTestCapture(dirname(original.evidencePath), `insert-window-${mode}-${index}`, 'success');
      },
      'normal',
      '8.12.0',
      ['gap', 'one-ms-gap', 'changed-fifo'].includes(mode)
        ? (mode as 'gap' | 'one-ms-gap' | 'changed-fifo')
        : 'overlap',
    );
  }, 60000);

test('current insert witness window input refuses competing, empty and duplicated original sources', async () => {
  await withInsertWitnesses(
    async (input) => {
      const { window: _single, allWindows: windows, ...source } = input;
      await expect(
        inserts.collectOriginalGcpInsertWitnesses({
          ...source,
          window: windows[0],
          windows,
        } as never),
      ).rejects.toThrow('Exactly one');
      await expect(
        inserts.collectOriginalGcpInsertWitnesses({
          ...source,
          windows: [],
        }),
      ).rejects.toThrow('windows required');
      await expect(
        inserts.collectOriginalGcpInsertWitnesses({
          ...source,
          windows: [windows[0], windows[0]],
        }),
      ).rejects.toThrow('distinct');
    },
    'normal',
    '8.12.0',
    'overlap',
  );
}, 60000);
