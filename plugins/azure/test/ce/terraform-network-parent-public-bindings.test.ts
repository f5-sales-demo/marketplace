import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkParentPublicBindings } from '../../src/ce/terraform-network-parent-public-bindings';
import type { AzureCePlan } from '../../src/ce/types';

// This exercises callback accounting, not CE plan or execution acceptance. The parent
// composition fixture separately consumes real compiled plans through owning validators.
const plan = () => ({ planSha256: 'a'.repeat(64), payload: 'private-rendered-source' }) as unknown as AzureCePlan;
const missing = () => Object.assign(Error('missing outcome'), { code: 'ENOENT' });
function fixture() {
  const controller = new AbortController(),
    source = plan();
  let reads = 0;
  const owning = {
    async loadSource(_digest: string) {
      reads++;
      return structuredClone(source);
    },
    async loadOutcome(_source: AzureCePlan): Promise<Record<string, unknown>> {
      reads++;
      return { status: 'complete', payload: 'private-outcome' };
    },
  };
  const capture = captureAzureNetworkParentPublicBindings(owning, controller.signal, () => {});
  return { controller, source, owning, capture, reads: () => reads };
}
test('public callback mapping retains hashes only and freshly rechecks exact source and outcome', async () => {
  const f = fixture(),
    source = await f.capture.loaders.loadSource(f.source.planSha256);
  await f.capture.loaders.loadOutcome(source);
  const snapshot = f.capture.snapshot(),
    reads = f.reads();
  expect(snapshot.sources).toEqual([{ planSha256: source.planSha256, sourceSha256: canonicalSha256(source) }]);
  expect(snapshot.outcomes[0]?.publication).toBe('published');
  expect(JSON.stringify(snapshot)).not.toContain('private-rendered-source');
  expect(JSON.stringify(snapshot)).not.toContain('private-outcome');
  const first = snapshot.sources[0];
  if (!first) throw Error('Captured source required');
  first.sourceSha256 = '0'.repeat(64);
  await f.capture.recheck();
  expect(f.reads()).toBe(reads + 2);
  expect(f.capture.snapshot().sources[0]?.sourceSha256).toBe(canonicalSha256(source));
});
test('same loader returning changed source blocks replay', async () => {
  const f = fixture();
  await f.capture.loaders.loadSource(f.source.planSha256);
  Reflect.set(f.source, 'payload', 'changed-source');
  await expect(f.capture.recheck()).rejects.toThrow('repeated source changed');
});
test('same loader returning changed outcome blocks replay', async () => {
  const f = fixture();
  let status = 'complete';
  f.owning.loadOutcome = async () => ({ status });
  const capture = captureAzureNetworkParentPublicBindings(f.owning, f.controller.signal, () => {});
  await capture.loaders.loadOutcome(f.source);
  status = 'changed';
  await expect(capture.recheck()).rejects.toThrow('repeated outcome changed');
});
test('explicit ENOENT stays absent and a later published outcome cannot replace it', async () => {
  const f = fixture();
  let absent = true;
  f.owning.loadOutcome = async () => {
    if (absent) throw missing();
    return {};
  };
  const capture = captureAzureNetworkParentPublicBindings(f.owning, f.controller.signal, () => {});
  await expect(capture.loaders.loadOutcome(f.source)).rejects.toThrow('missing outcome');
  expect(capture.snapshot().outcomes).toEqual([
    {
      planSha256: f.source.planSha256,
      sourceSha256: canonicalSha256(f.source),
      publication: 'absent',
      outcomeSha256: null,
    },
  ]);
  await capture.recheck();
  absent = false;
  await expect(capture.recheck()).rejects.toThrow('repeated outcome changed');
});
test('service and authorization failures never become absence receipts', async () => {
  for (const code of ['EACCES', 'ETIMEDOUT', 'ECONNRESET']) {
    const f = fixture();
    f.owning.loadOutcome = async () => {
      throw Object.assign(Error(code), { code });
    };
    const capture = captureAzureNetworkParentPublicBindings(f.owning, f.controller.signal, () => {});
    await expect(capture.loaders.loadOutcome(f.source)).rejects.toThrow(code);
    expect(capture.snapshot().outcomes).toEqual([]);
  }
});
test('published empty outcome is retained as published and rejects later absence', async () => {
  const f = fixture();
  let absent = false;
  f.owning.loadOutcome = async () => {
    if (absent) throw missing();
    return {};
  };
  const capture = captureAzureNetworkParentPublicBindings(f.owning, f.controller.signal, () => {});
  await capture.loaders.loadOutcome(f.source);
  expect(capture.snapshot().outcomes[0]?.publication).toBe('published');
  absent = true;
  await expect(capture.recheck()).rejects.toThrow('repeated outcome changed');
});
test('changed loader and unresolved or mismatched source identifiers reject', async () => {
  const f = fixture();
  await expect(f.capture.loaders.loadSource('future-runtime-id')).rejects.toThrow('identifier unresolved');
  await expect(f.capture.loaders.loadSource('b'.repeat(64))).rejects.toThrow('loaded source identity differs');
  f.owning.loadSource = async () => f.source;
  await expect(f.capture.recheck()).rejects.toThrow('owning loader changed');
});
test('callback cannot mutate its source input even when returning an outcome', async () => {
  const f = fixture();
  f.owning.loadOutcome = async (input) => {
    Reflect.set(input, 'payload', 'changed');
    return {};
  };
  const capture = captureAzureNetworkParentPublicBindings(f.owning, f.controller.signal, () => {});
  await expect(capture.loaders.loadOutcome(f.source)).rejects.toThrow('outcome source input changed');
  expect(capture.snapshot().outcomes).toEqual([]);
});
test('preabort and ignored-callback abort cannot publish mappings', async () => {
  const f = fixture();
  f.controller.abort(Error('preabort'));
  await expect(f.capture.loaders.loadSource(f.source.planSha256)).rejects.toThrow('preabort');
  expect(f.reads()).toBe(0);
  const next = fixture();
  next.owning.loadOutcome = async () => {
    next.controller.abort(Error('ignored callback abort'));
    return new Promise(() => {});
  };
  const capture = captureAzureNetworkParentPublicBindings(next.owning, next.controller.signal, () => {});
  await expect(capture.loaders.loadOutcome(next.source)).rejects.toThrow('ignored callback abort');
});
test('owning context is checked again after a callback settles', async () => {
  const f = fixture();
  let intact = true;
  f.owning.loadOutcome = async () => {
    intact = false;
    return {};
  };
  const capture = captureAzureNetworkParentPublicBindings(f.owning, f.controller.signal, () => {
    if (!intact) throw Error('context changed');
  });
  await expect(capture.loaders.loadOutcome(f.source)).rejects.toThrow('context changed');
});

test('malformed returned outcomes cannot become published or absent receipts', async () => {
  for (const value of [undefined, null, [], 'malformed']) {
    const f = fixture();
    f.owning.loadOutcome = async () => value as unknown as Record<string, unknown>;
    const capture = captureAzureNetworkParentPublicBindings(f.owning, f.controller.signal, () => {});
    await expect(capture.loaders.loadOutcome(f.source)).rejects.toThrow(
      'complete outcome or explicit absence required',
    );
    expect(capture.snapshot().outcomes).toEqual([]);
  }
});
