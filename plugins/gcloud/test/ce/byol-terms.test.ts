import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import profile from '../../skills/gcp-ce/references/byol-vm-contract.json';
import { authorizeGcpByolTerms, normalizedGoogleMarketplaceTerms, planGcpByolTerms } from '../../src/ce/byol-terms';
import { intent } from './fixtures';

const digest = (value: string | Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
async function fixture() {
  const i = intent();
  i.image.name = profile.evidence.imageVersion;
  i.image.id = profile.evidence.imageId;
  i.image.licenses = [profile.evidence.licenseSelfLink];
  i.image.selfLink = `https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/images/${i.image.name}`;
  const html = new TextEncoder().encode(
    `<html><head>dynamic nonce</head><body><h1>Google Cloud Marketplace Terms of Service</h1><p>By using the Marketplace ${'legal terms '.repeat(200)}</p><p>Previous versions</p></body></html>`,
  );
  const pdf = new TextEncoder().encode('%PDF-fake legal fixture');
  const testProfile = structuredClone(profile);
  testProfile.documents[0].sha256 = digest(await normalizedGoogleMarketplaceTerms(html));
  testProfile.documents[1].sha256 = digest(pdf);
  let changed = false;
  const source = {
    query: async (path: string) =>
      path.includes('/images/')
        ? i.image
        : {
            id: profile.evidence.licenseId,
            licenseCode: profile.evidence.licenseCode,
            selfLink: i.image.licenses[0],
            chargesUseFee: false,
            description: `License for Cloud Marketplace virtual machine image solution with billing service ${profile.billingService}: default`,
          },
    document: async (url: string) =>
      url.endsWith('.pdf') ? (changed ? new TextEncoder().encode('changed') : pdf) : html,
  };
  const files = new Map<string, unknown>();
  const store = {
    read: async (n: string) => structuredClone(files.get(n)),
    write: async (n: string, v: unknown) => {
      files.set(n, structuredClone(v));
    },
  };
  const funding = {
    schemaVersion: 1 as const,
    project: i.project,
    accountDomain: 'example.com',
    organizationDomain: 'example.com',
    billingAccountName: 'billingAccounts/000000-000000-000000',
    billingEnabled: true as const,
    policySha256: digest('funding'),
    observedAt: new Date().toISOString(),
    sourceReceipts: Array.from({ length: 4 }, (_, n) => ({ source: String(n), sha256: digest(String(n)) })),
  };
  return {
    i,
    source,
    store,
    funding,
    testProfile,
    change: () => {
      changed = true;
    },
  };
}
it('BYOL review binds documents, image, context and confirmed funding without granting procurement consent or creating resources', async () => {
  const f = await fixture();
  const plan = await planGcpByolTerms(f.i, f.source, f.funding, f.store, undefined, f.testProfile);
  expect(plan.operation).toBe('authorize-byol-terms');
  expect(plan.purchases).toBe(0);
  expect(plan.resourcesCreated).toBe(0);
  const result = await authorizeGcpByolTerms(
    f.i,
    f.source,
    f.funding,
    f.store,
    plan.planHash,
    undefined,
    f.testProfile,
  );
  expect(result.state).toBe('authorized-for-access-or-use');
  expect(result.remoteConsentGranted).toBe(false);
  expect(result.softwareLicenseAcquired).toBe(false);
});
it('changed legal text, altered image/context or changed corporate billing cannot reuse a terms review', async () => {
  const f = await fixture();
  const plan = await planGcpByolTerms(f.i, f.source, f.funding, f.store, undefined, f.testProfile);
  f.change();
  await expect(
    authorizeGcpByolTerms(f.i, f.source, f.funding, f.store, plan.planHash, undefined, f.testProfile),
  ).rejects.toThrow('document changed');
  const next = await fixture();
  const reviewed = await planGcpByolTerms(next.i, next.source, next.funding, next.store, undefined, next.testProfile);
  next.i.platformContext = 'other';
  await expect(
    authorizeGcpByolTerms(
      next.i,
      next.source,
      next.funding,
      next.store,
      reviewed.planHash,
      undefined,
      next.testProfile,
    ),
  ).rejects.toThrow('binding changed');
  next.i.platformContext = 'lab';
  next.funding.billingAccountName = 'billingAccounts/111111-111111-111111';
  await expect(
    authorizeGcpByolTerms(
      next.i,
      next.source,
      next.funding,
      next.store,
      reviewed.planHash,
      undefined,
      next.testProfile,
    ),
  ).rejects.toThrow('funding receipt');
});
it('normalization excludes scripts and requires current legal text rather than fee metadata', async () => {
  const bytes = new TextEncoder().encode('<html><script>By using the Marketplace</script><body>empty</body></html>');
  await expect(normalizedGoogleMarketplaceTerms(bytes)).rejects.toThrow('legal text');
});
