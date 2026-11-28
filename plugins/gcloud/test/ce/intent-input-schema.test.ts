import { expect, test } from 'bun:test';
import * as typebox from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { PluginInterface } from '../../src/gcloud/types';
import { createGcpCeTools } from '../../src/tools/gcp-ce';

const tool = createGcpCeTools({ typebox } as unknown as PluginInterface).find((tool) => tool.name === 'gcp_ce_plan')!;
const request = { project: 'f5-gcs-4301-sales-na', region: 'northamerica-northeast1', engine: 'native' };

test('intent input accepts an object owning engine and preserves versioned deployment fields', () => {
  expect(Value.Check(tool.parameters, { ...request, intent: { engine: 'terraform' } })).toBe(true);
  expect(
    Value.Check(tool.parameters, {
      ...request,
      intent: {
        schemaVersion: 2,
        engine: 'terraform',
        project: request.project,
        sites: [{ name: 'owned-test', nodes: [] }],
        egress: { mode: 'cloud-nat' },
      },
    }),
  ).toBe(true);
});

for (const [label, intent] of [
  ['encoded JSON string', '{"engine":"terraform"}'],
  ['array', [{ engine: 'terraform' }]],
  ['null', null],
] as const) {
  test(`intent input rejects ${label} at the registered schema boundary`, () => {
    expect(Value.Check(tool.parameters, { ...request, intent })).toBe(false);
  });
}
