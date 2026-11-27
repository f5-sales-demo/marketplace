import { afterAll, expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import type { CeTerraformRuntimeRequest, CeTerraformService } from '../src/service';
import { TERRAFORM_SERVICE_CHANNEL } from '../src/service';
import { fixture } from './installed-provider-reader-fixture';

const original = { ...(await import('../src/installed-runtime')) };
const resolveInstalled = original.createInstalledRuntimeResolver;
let capture: NonNullable<Parameters<typeof original.createInstalledRuntimeResolver>[1]>['capture'];
let resolverCalls = 0;
mock.module('../src/installed-runtime', () => ({
  ...original,
  createInstalledRuntimeResolver(...args: Parameters<typeof original.createInstalledRuntimeResolver>) {
    resolverCalls++;
    capture = args[1]?.capture;
    return resolveInstalled(...args);
  },
}));
afterAll(() => {
  mock.module('../src/installed-runtime', () => original);
});

for (const mode of ['missing-plan', 'wrong-engine', 'wrong-directory', 'changed-budget'] as const)
  test(`registered controller refuses unbound input before storage or cloud: ${mode}`, async () => {
    const { default: extension } = await import('../src/index');
    const handlers = new Map<string, Set<(data: unknown) => void>>();
    const events = {
      on(channel: string, handler: (data: unknown) => void) {
        const list = handlers.get(channel) ?? new Set();
        list.add(handler);
        handlers.set(channel, list);
        return () => {
          list.delete(handler);
        };
      },
      emit(channel: string, data: unknown) {
        for (const handler of handlers.get(channel) ?? []) handler(data);
      },
    };
    const priorCalls = resolverCalls;
    extension({ events, setLabel: () => {} });
    expect(resolverCalls).toBe(priorCalls + 1);
    const service = await new Promise<CeTerraformService>((resolve) =>
      events.emit(TERRAFORM_SERVICE_CHANNEL, { version: 1, resolve }),
    );
    expect(typeof service.open).toBe('function');
    const factory = capture;
    if (!factory) throw new Error('Installed extension omitted the complete capture controller');
    const run = await fixture('812');
    const initial = createInstalledCaptureContext({
      ...run.context,
      executionDirectory: join(run.context.executionDirectory, run.context.owner.deploymentId),
    });
    const context =
      mode === 'changed-budget'
        ? { ...initial, budget: { ...initial.budget, deadline: initial.budget.deadline + 1 } }
        : initial;
    let storageCalls = 0;
    const request = {
      owner: { ...context.owner, ...(mode === 'wrong-engine' ? { engine: 'native' } : {}) },
      directory: mode === 'wrong-directory' ? '/example/foreign' : run.context.executionDirectory,
      deployment: { deploymentId: context.owner.deploymentId, engine: 'terraform' },
      resume: false,
      platform: {
        storage: async () => {
          storageCalls++;
          throw new Error('Storage must not start');
        },
      },
    } as unknown as CeTerraformRuntimeRequest;
    await expect(
      (async () => {
        const worker = factory(request, context);
        await worker.prepare?.(context);
      })(),
    ).rejects.toThrow(/[Oo]riginal/);
    expect(storageCalls).toBe(0);
    expect(run.executions()).toBe(0);
  });
