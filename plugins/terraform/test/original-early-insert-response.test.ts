import { expect, test } from 'bun:test';
import * as http from '../src/gcp-http-rpc-trace';
import * as output from '../src/original-output-stream';
import { operationFixture, requestFixture, scope, traceFixture } from './fixtures/gcp-insert.fixture';

const binding = {
  terraformVersion: '1.17.2',
  providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
};

test('unissued output interfaces cannot verify original live prefixes or invoke caller readers', async () => {
  let calls = 0;
  const unissued = {
    read: async () => {
      calls++;
      return null;
    },
    finish: async () => {
      calls++;
      throw new Error('unissued finish must not run');
    },
  };
  await expect(output.readOriginalExecutionPrefix(unissued)).rejects.toThrow('Original');
  expect(calls).toBe(0);
});

test('serialized early HTTP responses cannot obtain original descriptor provenance', async () => {
  await expect(
    http.readOriginalGoogleHttpResponseSource({
      kind: 'original-google-http-response-observation',
      responseBody: JSON.stringify(operationFixture()),
      planSha256: scope.planSha256,
    }),
  ).rejects.toThrow('Original');
});

test('plain HTTP log bytes cannot mint early original insertion response references', () => {
  const parser = new http.GoogleHttpRpcTraceParser({ ...scope, instanceName: 'example-node' }, binding);
  parser.push(Buffer.from(traceFixture(requestFixture(), operationFixture(), '8.11.0')));
  expect(typeof parser.takeOriginalResponses).toBe('function');
  expect(() => parser.takeOriginalResponses()).toThrow('Original executor');
});

import { withEarlyResponse } from './fixtures/original-early-response.fixture';

test('an original insertion response is available while its RPC and process remain unfinished', async () => {
  expect(typeof http.GoogleHttpRpcTraceParser.prototype.takeOriginalResponses).toBe('function');
  await withEarlyResponse(
    async ({ response, output: original, admission, parser }) => {
      const source = await http.readOriginalGoogleHttpResponseSource(response);
      expect(source.executor).toEqual(admission.identity);
      expect(source.directory).toBe(admission.directory);
      expect(source.planSha256).toBe(scope.planSha256);
      expect(response.status).toBe(200);
      expect(JSON.parse(response.responseBody).targetId).toBe(operationFixture().targetId);
      expect(source.rpcCompletionQualified).toBe(false);
      expect(source.originalInsertQualified).toBe(false);
      expect(parser.takeOriginalResponses()).toHaveLength(0);
      await expect(original.finish()).rejects.toThrow('remains live');
      await expect(http.readOriginalGoogleHttpResponseSource({ ...response })).rejects.toThrow('Original');
    },
    async ({ response, output: original }) => {
      const before = await http.readOriginalGoogleHttpResponseSource(response);
      const prefix = await output.readOriginalExecutionPrefix(original);
      const copy = { ...prefix };
      await expect(output.readOriginalExecutionPrefix(original, copy)).rejects.toThrow('Original');
      const again = await http.readOriginalGoogleHttpResponseSource(response);
      expect(again.stderrSha256).toBe(before.stderrSha256);
    },
  );
});

test('a verified live prefix neither requires EOF nor consumes subsequent output bytes', async () => {
  expect(typeof output.readOriginalExecutionPrefix).toBe('function');
  await withEarlyResponse(async ({ output: original }) => {
    const first = await output.readOriginalExecutionPrefix(original);
    const second = await output.readOriginalExecutionPrefix(original, first);
    expect(second).toEqual(first);
    expect(first.stderr.bytes).toBeGreaterThan(0);
    expect(first.applyRpcQualified).toBe(false);
  });
});

test('missing RPC completion retires the original early response without promoting captured identity', async () => {
  expect(typeof http.GoogleHttpRpcTraceParser.prototype.takeOriginalResponses).toBe('function');
  await withEarlyResponse(
    async ({ response }) => {
      expect((await http.readOriginalGoogleHttpResponseSource(response)).originalInsertQualified).toBe(false);
    },
    async ({ response }) => {
      await expect(http.readOriginalGoogleHttpResponseSource(response)).rejects.toThrow('failed');
    },
    'truncated',
  );
});

test('copied, replayed and wrong-channel chunks cannot mint original early response sources', async () => {
  await withEarlyResponse(async ({ output: original, chunk }) => {
    const copied = new http.GoogleHttpRpcTraceParser({ ...scope, instanceName: 'example-node' }, binding);
    expect(() => copied.pushOriginal(original, { ...chunk })).toThrow('original');
    const stdout = await original.read('stdout');
    if (!stdout) throw new Error('Actual original stdout fixture required');
    const wrong = new http.GoogleHttpRpcTraceParser({ ...scope, instanceName: 'example-node' }, binding);
    expect(() => wrong.pushOriginal(original, stdout)).toThrow('channel');
    const replay = new http.GoogleHttpRpcTraceParser({ ...scope, instanceName: 'example-node' }, binding);
    replay.pushOriginal(original, chunk);
    const observation = replay.takeOriginalResponses()[0];
    expect(() => replay.pushOriginal(original, chunk)).toThrow('gap');
    await expect(http.readOriginalGoogleHttpResponseSource(observation)).rejects.toThrow('failed');
  });
});

test('mixing unowned bytes retires an already observed original insertion response', async () => {
  await expect(
    withEarlyResponse(async ({ parser, response }) => {
      expect(() => parser.push(Buffer.from('unowned'))).toThrow('unowned');
      await expect(http.readOriginalGoogleHttpResponseSource(response)).rejects.toThrow('failed');
      throw new Error('Expected original mixed-source capture refusal');
    }),
  ).rejects.toThrow('Expected original mixed-source capture refusal');
});

test('changed original prefix bytes permanently retire early response authority even after restoration', async () => {
  await expect(
    withEarlyResponse(async ({ response, admission }) => {
      await http.readOriginalGoogleHttpResponseSource(response);
      const { readFile, writeFile } = await import('node:fs/promises');
      const bytes = await readFile(admission.stderrPath);
      const changed = Buffer.from(bytes);
      changed[0] = changed[0] ^ 1;
      await writeFile(admission.stderrPath, changed);
      await expect(http.readOriginalGoogleHttpResponseSource(response)).rejects.toThrow('prefix');
      await writeFile(admission.stderrPath, bytes);
      await expect(http.readOriginalGoogleHttpResponseSource(response)).rejects.toThrow('failed');
      throw new Error('Expected original changed-prefix capture refusal');
    }),
  ).rejects.toThrow('Expected original changed-prefix capture refusal');
});
