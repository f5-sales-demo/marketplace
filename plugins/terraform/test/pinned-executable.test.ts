import { expect, test } from 'bun:test';
import type { BigIntStats } from 'node:fs';
import { assertPinnedExecutableMetadata } from '../src/pinned-executable';

type Metadata = Pick<BigIntStats, 'uid' | 'mode' | 'nlink' | 'isFile'>;
const fixture = (change: Partial<Metadata> = {}): Metadata => ({
  uid: 1000n,
  mode: 0o100755n,
  nlink: 1n,
  isFile: () => true,
  ...change,
});

for (const uid of [0n, 1000n])
  test(`pinned metadata accepts ordinary readonly executable ownership for caller or system: uid=${uid}`, () => {
    expect(() => assertPinnedExecutableMetadata(fixture({ uid }), 1000)).not.toThrow();
  });

for (const [name, change] of [
  ['foreign-owner', { uid: 1002n }],
  ['non-file', { isFile: () => false }],
  ['multiple-links', { nlink: 2n }],
  ['group-writable', { mode: 0o100775n }],
  ['other-writable', { mode: 0o100757n }],
  ['non-executable', { mode: 0o100644n }],
  ['setuid', { mode: 0o104755n }],
  ['setgid', { mode: 0o102755n }],
  ['both-identity-flags', { mode: 0o106755n }],
] as Array<[string, Partial<Metadata>]>)
  test(`pinned metadata refuses an unsafe executable before any native invocation: ${name}`, () => {
    expect(() => assertPinnedExecutableMetadata(fixture(change), 1000)).toThrow();
  });

for (const uid of [-1, Number.NaN, 1.5])
  test(`pinned metadata requires a valid native caller UID: ${uid}`, () => {
    expect(() => assertPinnedExecutableMetadata(fixture(), uid)).toThrow();
  });
