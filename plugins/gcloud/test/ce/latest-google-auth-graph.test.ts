import { expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createGoogleVertexAuthClient } from '@f5-sales-demo/pi-ai/providers/google-vertex';
import { GoogleGenAI } from '@google/genai';

test('GenAI and the current SDK resolve one Google auth implementation', () => {
  const genai = createRequire(import.meta.resolve('@google/genai'));
  const provider = createRequire(import.meta.resolve('@f5-sales-demo/pi-ai/providers/google-vertex'));
  expect(realpathSync(genai.resolve('google-auth-library'))).toBe(
    realpathSync(provider.resolve('google-auth-library')),
  );
});

test('current Google auth sends explicit credentials and retains verified response content', async () => {
  const requests: Array<{ authorization: string | null; path: string }> = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests.push({ authorization: request.headers.get('authorization'), path: new URL(request.url).pathname });
      return Response.json({
        candidates: [{ content: { role: 'model', parts: [{ text: 'synthetic-qualified-response' }] } }],
      });
    },
  });
  try {
    for (const token of ['synthetic-first-token', 'synthetic-rotated-token']) {
      const client = new GoogleGenAI({
        vertexai: true,
        project: 'synthetic-project',
        location: 'us-central1',
        googleAuthOptions: { authClient: createGoogleVertexAuthClient(token) },
        httpOptions: { baseUrl: server.url.toString(), apiVersion: 'v1' },
      });
      const response = await client.models.generateContent({ model: 'synthetic-model', contents: 'synthetic-input' });
      expect(response.text).toBe('synthetic-qualified-response');
    }
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.authorization)).toEqual([
      'Bearer synthetic-first-token',
      'Bearer synthetic-rotated-token',
    ]);
    expect(requests.every((request) => request.path.includes('/projects/synthetic-project/'))).toBe(true);
  } finally {
    await server.stop(true);
  }
});
