import { expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { createAwsCePlanTool } from '../../src/tools/aws-ce-plan';

it('advertises the optional preboot administrator key in the public planning schema', () => {
  const tool = createAwsCePlanTool({ typebox: { Type } } as never);
  const intent = tool.parameters.properties.intent;
  expect(intent.properties.adminSshPublicKey).toBeDefined();
  expect(intent.required).not.toContain('adminSshPublicKey');
  const property = intent.properties.adminSshPublicKey;
  if (!property) throw new Error('Public administrator key schema missing');
  expect(Value.Check(property, 'ssh-ed25519 public-key')).toBe(true);
  expect(Value.Check(property, { privateKey: 'invalid' })).toBe(false);
});

it('aligns package and xcsh metadata versions for every CE plugin', () => {
  for (const name of ['platform', 'aws', 'azure', 'terraform']) {
    const path = resolve(import.meta.dir, '../../..', name, 'package.json');
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    expect(pkg.xcsh.version).toBe(pkg.version);
  }
});
