/** Refusals at the native boundary; packets cannot authorize a CE scan. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as command from '../src/gcp-ce-keyscan-command';
import pins from '../src/gcp-ce-keyscan-pins.json';
import * as native from '../src/signal-free-executor';

test('the shipped CE and ABI source bytes match the declared qualification pins', () => {
  for (const [file, expected] of [
    ['gcp_observer_ce_keyscan.py', pins.guestHelperSha256],
    ['gcp_observer_client_abi.py', pins.abiHelperSha256],
  ]) {
    const raw = readFileSync(join(import.meta.dir, '../scripts', file));
    expect(createHash('sha256').update(raw).digest('hex')).toBe(expected);
  }
});

test('CE keyscan requires the original qualified observer context and actual callback', async () => {
  await expect(
    command.openOriginalGcpCeKeyScanCommand(
      {
        schemaVersion: 1,
        kind: 'original-qualified-gcp-ce-observer-scan-context-reference',
        guestClientQualified: true,
        targetAddress: '192.0.2.1',
      },
      {} as never,
    ),
  ).rejects.toThrow('Original');
});

test('serialized commands cannot select inputs, deadlines, targets or native executors', async () => {
  const fake = { schemaVersion: 1, kind: 'original-gcp-ce-keyscan-command-reference' };
  await expect(command.readOriginalGcpCeKeyScanCommand(fake)).rejects.toThrow('Original');
  await expect(command.assertOriginalGcpCeKeyScanInputs(fake)).rejects.toThrow('Original');
  await expect(command.assertOriginalGcpCeKeyScanIdentity(fake)).rejects.toThrow('Original');
  await expect(command.checkoutOriginalGcpCeKeyScanCommand(fake)).rejects.toThrow('Original');
  expect(() => command.closeOriginalGcpCeKeyScanCommand(fake)).toThrow('Original');
  await expect(native.signalFreeGcpCeKeyScanExecutor({} as never, fake)).rejects.toThrow('Original');
});
