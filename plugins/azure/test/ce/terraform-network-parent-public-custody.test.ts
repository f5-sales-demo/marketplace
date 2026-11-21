import { expect, test } from 'bun:test';
import { appendFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkParentPublicCustody } from '../../src/ce/terraform-network-parent-public-custody';
import { readAzureTerraformNetworkRetirementRequests } from '../../src/ce/terraform-network-retirement-requests';
import { saveAzureTerraformOutcome } from '../../src/ce/terraform-outcome';
import { networkUpdateFixture } from './network-update-fixture';

async function fixture(published = true) {
  const f = networkUpdateFixture(false, 'terraform', true, false);
  const root = await mkdtemp(join(tmpdir(), 'network-parent-public-only-'));
  let next = 0;
  const session: SessionManagerLike = {
    getSessionId: () => root,
    getArtifactsDir: () => root,
    getArtifactPath: async () => null,
    async saveArtifact(content, tool) {
      const id = String(++next);
      await writeFile(join(root, `${id}.${tool}.log`), content, { mode: 0o600 });
      return id;
    },
  };
  await savePlanArtifact(session, f.original, f.current);
  const outcome = { planId: f.original.planId, planSha256: f.original.planSha256, status: 'registered' };
  if (published) await saveAzureTerraformOutcome(session, outcome);
  const requests = await readAzureTerraformNetworkRetirementRequests(f.original, session);
  const retained = {
    publicPlanInventorySha256: requests.publicPlanInventorySha256,
    requestInventorySha256: requests.requestInventorySha256,
    publicBindings: {
      sources: [{ planSha256: f.original.planSha256, sourceSha256: canonicalSha256(f.original) }],
      outcomes: [
        {
          planSha256: f.original.planSha256,
          sourceSha256: canonicalSha256(f.original),
          publication: published ? ('published' as const) : ('absent' as const),
          outcomeSha256: published ? canonicalSha256({ value: outcome }) : null,
        },
      ],
    },
  };
  return { ...f, root, session, retained, outcome, close: () => rm(root, { recursive: true, force: true }) };
}
test('public-only reader matches durable source/outcome without any private store or staging', async () => {
  const f = await fixture();
  try {
    const result = await readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained);
    expect(result.scope).toBe('post-parent-public-evidence-match-only');
    expect(result.parentRetirementQualified).toBe(false);
    expect(result.nativeBarrierReadQualified).toBe(false);
    await result.recheck();
  } finally {
    await f.close();
  }
});
test('public-only explicit outcome absence is rechecked and later publication rejects', async () => {
  const f = await fixture(false);
  try {
    const result = await readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained);
    await result.recheck();
    await saveAzureTerraformOutcome(f.session, f.outcome);
    await expect(result.recheck()).rejects.toThrow('public evidence bytes, inode or namespace changed');
    await expect(readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained)).rejects.toThrow(
      'public outcome publication changed',
    );
  } finally {
    await f.close();
  }
});
test('public-only outcome byte change rejects initial matching and warm replay', async () => {
  const f = await fixture();
  try {
    const result = await readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained);
    const name = (await readdir(f.root)).find((name) => name.endsWith('.azure-ce-terraform-checkpoint.log'));
    if (!name) throw Error('Published outcome required');
    await writeFile(join(f.root, name), JSON.stringify({ ...f.outcome, status: 'changed' }), { mode: 0o600 });
    await expect(result.recheck()).rejects.toThrow('public evidence bytes, inode or namespace changed');
    await expect(readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained)).rejects.toThrow(
      'public outcome publication changed',
    );
  } finally {
    await f.close();
  }
});
test('public-only identical-byte inode replacement rejects replay', async () => {
  const f = await fixture();
  try {
    const result = await readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained);
    const name = (await readdir(f.root))[0];
    if (!name) throw Error('Published evidence required');
    const path = join(f.root, name),
      bytes = await readFile(path);
    await rename(path, join(f.root, 'retained-original.backup'));
    await writeFile(path, bytes, { mode: 0o600 });
    await expect(result.recheck()).rejects.toThrow('public evidence bytes, inode or namespace changed');
  } finally {
    await f.close();
  }
});
test('missing or malformed public evidence never qualifies as absence', async () => {
  const f = await fixture(false);
  try {
    await writeFile(join(f.root, 'foreign.azure-ce-terraform-checkpoint.log'), '{malformed', { mode: 0o600 });
    await expect(readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained)).rejects.toThrow(
      'malformed public evidence',
    );
    await f.close();
    await expect(readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained)).rejects.toThrow();
  } finally {
    await f.close();
  }
});
test('duplicate, malformed and foreign source/outcome mappings reject', async () => {
  const f = await fixture();
  try {
    const cases = [
      {
        ...f.retained,
        publicBindings: {
          ...f.retained.publicBindings,
          sources: [...f.retained.publicBindings.sources, ...f.retained.publicBindings.sources],
        },
      },
      {
        ...f.retained,
        publicBindings: {
          ...f.retained.publicBindings,
          outcomes: [...f.retained.publicBindings.outcomes, ...f.retained.publicBindings.outcomes],
        },
      },
      {
        ...f.retained,
        publicBindings: {
          ...f.retained.publicBindings,
          outcomes: f.retained.publicBindings.outcomes.map((row) => ({ ...row, sourceSha256: '0'.repeat(64) })),
        },
      },
      { ...f.retained, publicPlanInventorySha256: 'unresolved' },
      { ...f.retained, publicBindings: { ...f.retained.publicBindings, outcomes: [] } },
    ];
    for (const retained of cases)
      await expect(readAzureTerraformNetworkParentPublicCustody(f.original, f.session, retained)).rejects.toThrow();
  } finally {
    await f.close();
  }
});
test('public-only retained context mutation and preabort reject', async () => {
  const f = await fixture();
  try {
    const result = await readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained);
    f.retained.publicBindings.sources[0].sourceSha256 = '0'.repeat(64);
    await expect(result.recheck()).rejects.toThrow('owning public context changed');
    const controller = new AbortController();
    controller.abort(Error('public preabort'));
    await expect(
      readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained, controller.signal),
    ).rejects.toThrow('public preabort');
  } finally {
    await f.close();
  }
});

test('native-bound public snapshot rejects added duplicate outcomes even if selected outcome still matches', async () => {
  const f = await fixture();
  try {
    const result = await readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained);
    const bound = { ...f.retained, publicEvidenceSnapshotSha256: result.publicEvidenceSnapshotSha256 };
    await readAzureTerraformNetworkParentPublicCustody(f.original, f.session, bound);
    await saveAzureTerraformOutcome(f.session, f.outcome);
    await expect(readAzureTerraformNetworkParentPublicCustody(f.original, f.session, bound)).rejects.toThrow(
      'native-bound public namespace changed',
    );
  } finally {
    await f.close();
  }
});

test('last session callback cannot mutate public bytes after the final native custody check', async () => {
  const f = await fixture();
  try {
    const name = (await readdir(f.root)).find((name) => name.endsWith('.azure-ce-terraform-checkpoint.log'));
    if (!name) throw Error('Published outcome required');
    let calls = 0,
      attackAt = Number.POSITIVE_INFINITY;
    f.session.getSessionId = () => {
      calls++;
      if (calls === attackAt) appendFileSync(join(f.root, name), '\n');
      return f.root;
    };
    await readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained);
    attackAt = calls;
    calls = 0;
    await expect(readAzureTerraformNetworkParentPublicCustody(f.original, f.session, f.retained)).rejects.toThrow(
      'public evidence bytes, inode or namespace changed',
    );
    expect(calls).toBe(attackAt);
  } finally {
    await f.close();
  }
});
