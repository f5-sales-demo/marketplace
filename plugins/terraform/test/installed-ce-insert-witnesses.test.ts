/** Actual original plan, descriptor, UI, body and window issuers; offline provider observations. */
import { expect, test } from 'bun:test';
import { withInsertWitnesses } from './fixtures/original-insert-witness.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const mode of [
  'complete',
  'duplicate-body',
  'copied-body',
  'duplicate-target',
  'wrong-target',
  'missing-ui',
  'copied-rpc',
] as const)
  test(`installed CE witness dispatcher consumes actual source joins: ${mode}`, async () => {
    const module = await import('../src/installed-ce-insert-witnesses');
    await withInsertWitnesses(
      async (input) => {
        const target = {
          address: input.started.address,
          name: input.insert.nodeName,
          project: input.insert.project,
          zone: input.insert.zone,
        };
        const source = {
          originalPlan: input.originalPlan,
          binding: input.binding,
          configuration: input.configuration,
          providerPath: input.providerPath,
          targets:
            mode === 'duplicate-target'
              ? [target, target]
              : mode === 'wrong-target'
                ? [{ ...target, name: 'foreign-node' }]
                : [target],
          hooks: mode === 'missing-ui' ? [input.completed] : [input.started, input.completed],
          rpcs: mode === 'copied-rpc' ? [{ ...input.rpc }] : [input.rpc],
          bodies:
            mode === 'duplicate-body'
              ? [input.bodies, input.bodies]
              : mode === 'copied-body'
                ? [{ ...input.bodies }]
                : [input.bodies],
          windows: input.allWindows,
        };
        if (mode !== 'complete') {
          await expect(module.collectInstalledCeInsertWitnesses(source)).rejects.toThrow();
        } else {
          const joined = await module.collectInstalledCeInsertWitnesses(source);
          expect(joined).toHaveLength(1);
          expect(joined[0].target).toEqual(target);
          expect(joined[0].witnesses.schemaVersion).toBe(2);
          expect(joined[0].witnesses.windowSha256s).toHaveLength(2);
          expect(joined[0].witnesses.uiSourceCorroborated).toBe(true);
          expect(joined[0].candidate.originalInsertQualified).toBe(false);
          expect(Object.isFrozen(joined)).toBe(true);
          await retainOwnedTestCapture(input.originalPlan.directory, 'ce-insert-dispatch', 'success');
        }
      },
      'normal',
      '8.12.0',
      'overlap',
    );
  }, 60000);
