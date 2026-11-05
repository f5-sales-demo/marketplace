import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SessionManagerLike } from '../../src/ce/artifacts';
import { compileAzureCePlan } from '../../src/ce/planner';
import { AzureTerraformOutcomeAbsent, loadAzureTerraformOutcome } from '../../src/ce/terraform-outcome';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'azure-outcome-absence-'));
  roots.push(root);
  const input = structuredClone(intent);
  input.engine = 'terraform';
  const plan = compileAzureCePlan(input, structuredClone(observation));
  const session: SessionManagerLike = {
    getSessionId: () => 'public-outcome-absence',
    getArtifactsDir: () => root,
    getArtifactPath: async () => null,
    saveArtifact: async () => undefined,
  };
  return { root, plan, session };
}
test('empty verified public namespace reports typed exact-plan absence', async () => {
  const f = await fixture();
  await expect(loadAzureTerraformOutcome(f.session, f.plan)).rejects.toBeInstanceOf(AzureTerraformOutcomeAbsent);
  await expect(loadAzureTerraformOutcome(f.session, f.plan)).rejects.toMatchObject({ code: 'ENOENT' });
});
for (const fault of ['missing-directory', 'no-directory', 'missing-file', 'malformed-file', 'non-object-file'] as const)
  test(`unavailable public outcome evidence cannot become exact-plan absence (${fault})`, async () => {
    const f = await fixture(),
      path = join(f.root, '1.azure-ce-terraform-checkpoint.log');
    if (fault === 'missing-directory') await rm(f.root, { recursive: true });
    if (fault === 'no-directory') f.session.getArtifactsDir = () => null;
    if (fault === 'missing-file') await symlink(join(f.root, 'missing-target'), path);
    if (fault === 'malformed-file') await writeFile(path, '{', { mode: 0o600 });
    if (fault === 'non-object-file') await writeFile(path, 'null', { mode: 0o600 });
    let failure: unknown;
    try {
      await loadAzureTerraformOutcome(f.session, f.plan);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(AzureTerraformOutcomeAbsent);
    expect((failure as NodeJS.ErrnoException).code).not.toBe('ENOENT');
  });
test('unrelated valid outcome cannot resolve the selected public plan', async () => {
  const f = await fixture();
  await writeFile(
    join(f.root, '1.azure-ce-terraform-checkpoint.log'),
    JSON.stringify({ engine: 'terraform', planId: 'unrelated', planSha256: 'f'.repeat(64), status: 'complete' }),
    { mode: 0o600 },
  );
  await expect(loadAzureTerraformOutcome(f.session, f.plan)).rejects.toBeInstanceOf(AzureTerraformOutcomeAbsent);
});
test('matching public outcome remains readable without executing Terraform', async () => {
  const f = await fixture(),
    row = { engine: 'terraform', planId: f.plan.planId, planSha256: f.plan.planSha256, status: 'complete' };
  await writeFile(join(f.root, '1.azure-ce-terraform-checkpoint.log'), JSON.stringify(row), { mode: 0o600 });
  expect(await loadAzureTerraformOutcome(f.session, f.plan)).toEqual(row);
});

for (const fault of ['older-malformed', 'older-non-object', 'matching-symlink', 'directory-symlink'] as const)
  test(`complete native outcome custody rejects ${fault} even with a matching newest row`, async () => {
    const f = await fixture();
    const row = { engine: 'terraform', planId: f.plan.planId, planSha256: f.plan.planSha256, status: 'complete' };
    const newest = join(f.root, '9.azure-ce-terraform-checkpoint.log');
    const older = join(f.root, '1.azure-ce-terraform-checkpoint.log');
    await writeFile(newest, JSON.stringify(row), { mode: 0o600 });
    if (fault === 'older-malformed') await writeFile(older, '{', { mode: 0o600 });
    if (fault === 'older-non-object') await writeFile(older, 'null', { mode: 0o600 });
    if (fault === 'matching-symlink') {
      await rm(newest);
      const target = join(f.root, 'outside-packet.json');
      await writeFile(target, JSON.stringify(row), { mode: 0o600 });
      await symlink(target, newest);
    }
    if (fault === 'directory-symlink') {
      const linked = `${f.root}-link`;
      roots.push(linked);
      await symlink(f.root, linked);
      f.session.getArtifactsDir = () => linked;
    }
    let failure: unknown;
    try {
      await loadAzureTerraformOutcome(f.session, f.plan);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(AzureTerraformOutcomeAbsent);
    expect((failure as NodeJS.ErrnoException).code).not.toBe('ENOENT');
  });

for (const fault of ['source-change', 'session-id-change', 'pre-aborted'] as const)
  test(`native outcome inspection retains original context and cancellation (${fault})`, async () => {
    const f = await fixture();
    const row = { engine: 'terraform', planId: f.plan.planId, planSha256: f.plan.planSha256, status: 'complete' };
    await writeFile(join(f.root, '9.azure-ce-terraform-checkpoint.log'), JSON.stringify(row), { mode: 0o600 });
    if (fault === 'source-change')
      f.session.getArtifactsDir = () => {
        f.plan.siteName = 'changed-site';
        return f.root;
      };
    if (fault === 'session-id-change')
      f.session.getArtifactsDir = () => {
        f.session.getSessionId = () => 'foreign-session';
        return f.root;
      };
    const signal = fault === 'pre-aborted' ? AbortSignal.abort(Error('stop native outcome')) : undefined;
    await expect(loadAzureTerraformOutcome(f.session, f.plan, signal)).rejects.toBeInstanceOf(Error);
  });
