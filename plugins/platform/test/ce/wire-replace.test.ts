import { expect, test } from 'bun:test';
import { projectReplaceSnapshot } from '../../src/ce/wire-replace';

test('replacement projection preserves settings and maps while omitting read-only and unset defaults', () => {
  const schemas = {
    root: {
      type: 'object',
      properties: {
        settings: { allOf: [{ $ref: '#/components/schemas/settings' }] },
        labels: { type: 'object' },
        description: { type: 'string', minLength: 1 },
        optional: { type: 'object' },
      },
    },
    settings: {
      type: 'object',
      properties: { mtu: { type: 'integer' }, primary: { type: 'boolean', readOnly: true } },
    },
  };
  const observed = {
    settings: { mtu: 0, primary: true },
    labels: { owner: 'retained' },
    description: '',
    optional: null,
    status: 'ONLINE',
  };
  expect(projectReplaceSnapshot(observed, schemas, 'root', ['status'])).toEqual({
    settings: { mtu: 0 },
    labels: { owner: 'retained' },
  });
  expect(observed.settings.primary).toBe(true);
  expect(() => projectReplaceSnapshot({ ...observed, unexpected: 'value' }, schemas, 'root', ['status'])).toThrow(
    'unsupported',
  );
  expect(() =>
    projectReplaceSnapshot({ ...observed, settings: { mtu: 0, unknown: true } }, schemas, 'root', ['status']),
  ).toThrow('unsupported');
});
