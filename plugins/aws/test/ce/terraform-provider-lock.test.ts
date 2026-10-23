import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AWS_CE_PROVIDER_LOCK_SHA256, AWS_CE_TERRAFORM_PROVIDER_VERSION } from '../../src/ce/execution-contract';

test('AWS immutable provider lock covers extracted packages for both supported OS and CPU pairs', async () => {
  const lock = await readFile(new URL('../../terraform/provider-lock.hcl', import.meta.url), 'utf8');
  expect(createHash('sha256').update(lock).digest('hex')).toBe(AWS_CE_PROVIDER_LOCK_SHA256);
  expect(lock).toContain(`version     = "${AWS_CE_TERRAFORM_PROVIDER_VERSION}"`);
  const packages = [...lock.matchAll(/"(h1:[A-Za-z0-9+/=]+)"/g)].map((match) => match[1]);
  expect(new Set(packages).size).toBe(4);
});
