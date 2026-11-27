import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../aws/src/ce/canonical';
import schema from './fixtures/replacement-provider-schema';
import provenance from './fixtures/replacement-provider-schema-provenance.json';

test('shared replacement provider fixture preserves the full original canonical schema', () => {
  expect(canonicalSha256(schema)).toBe(provenance.canonicalSha256);
});
