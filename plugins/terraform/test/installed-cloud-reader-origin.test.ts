import { expect, test } from 'bun:test';
import { readFile, rename, writeFile } from 'node:fs/promises';
import * as readers from '../src/gcp-cloud-serial-reader';
import { authInfo, fixture } from './original-gcp-inventory-fixture';

const fetcher = (async (url: string | URL | Request) => {
  const path = new URL(String(url)).pathname;
  if (path === '/token') return Response.json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 3599 });
  if (path === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
  if (path === '/v1/projects/example-project')
    return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
  return Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 });
}) as typeof fetch;

test('installed cloud reader proves its exact original context without accepting copied interfaces', async () => {
  expect(typeof readers.assertOriginalInstalledGcpCloudReader).toBe('function');
  await fixture(async (context) => {
    const reader = await readers.openInstalledGcpCloudSerialReader(context, undefined, fetcher);
    try {
      await readers.assertOriginalInstalledGcpCloudReader(reader, context);
      await expect(readers.assertOriginalInstalledGcpCloudReader({ ...reader }, context)).rejects.toThrow('Original');
      await expect(readers.assertOriginalInstalledGcpCloudReader(reader, { ...context })).rejects.toThrow('context');
      await readers.assertOriginalInstalledGcpCloudReader(reader, context);
    } finally {
      await reader.close();
    }
    await expect(readers.assertOriginalInstalledGcpCloudReader(reader, context)).rejects.toThrow('retired');
  });
});

test('a changed original credential retires reader provenance even after byte restoration', async () => {
  expect(typeof readers.assertOriginalInstalledGcpCloudReader).toBe('function');
  await fixture(async (context) => {
    const reader = await readers.openInstalledGcpCloudSerialReader(context, undefined, fetcher);
    const path = context.inputs.adc.path;
    const bytes = await readFile(path);
    const replacement = `${path}.replacement`;
    try {
      await writeFile(replacement, 'changed original credential', { flag: 'wx', mode: 0o400 });
      await rename(replacement, path);
      await expect(readers.assertOriginalInstalledGcpCloudReader(reader, context)).rejects.toThrow();
      await writeFile(replacement, bytes, { flag: 'wx', mode: 0o400 });
      await rename(replacement, path);
      await expect(readers.assertOriginalInstalledGcpCloudReader(reader, context)).rejects.toThrow('retired');
    } finally {
      await reader.close();
    }
  });
});

test('a generic cloud reader cannot attest an installed context', async () => {
  expect(typeof readers.assertOriginalInstalledGcpCloudReader).toBe('function');
  await fixture(async (context) => {
    await expect(readers.assertOriginalInstalledGcpCloudReader({}, context)).rejects.toThrow('Original');
  });
});
