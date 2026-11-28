import { expect, it } from 'bun:test';
import { fingerprint } from '../../src/ce/discovery';
import { applyGcpMarketplaceAcceptance, planGcpMarketplaceAcceptance } from '../../src/ce/marketplace-agreement';

function fixture() {
  const service = 'f5-ce.endpoints.f5-7626-networks-public.cloud.goog';
  const agreement = `commerceoffercatalog.googleapis.com/services/${service}/standardOffers/default/agreements/eula`;
  const binding = {
    project: 'test-project',
    projectNumber: '123',
    imageId: '456',
    imageSelfLink: 'https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/images/ce-test',
    licenseId: '789',
    licenseSelfLink: 'https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/licenses/ce-test',
    billingService: service,
    agreement,
    agreementDocument: `${agreement}/documents/v1`,
  };
  const files = new Map<string, unknown>();
  const store = {
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('absent'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
  };
  let active = false,
    grants = 0,
    dryRuns = 0,
    loseResponse = false;
  const consent = {
    state: 'ACTIVE',
    name: 'projects/123/consents/consent-1',
    agreement,
    agreementDocument: binding.agreementDocument,
    privateField: 'private-consent-fixture',
  };
  const port = {
    binding: async () => structuredClone(binding),
    check: async () => (active ? { consent } : {}),
    validateGrant: async () => {
      dryRuns++;
    },
    grant: async () => {
      grants++;
      active = true;
      if (loseResponse) throw new Error('lost grant response');
      return consent;
    },
  };
  return {
    binding,
    consent,
    store,
    port,
    grants: () => grants,
    dryRuns: () => dryRuns,
    activate: () => {
      active = true;
    },
    revoke: () => {
      active = false;
    },
    lose: () => {
      loseResponse = true;
    },
  };
}
it('plans an exact document with server dry run and no grant, then verifies acceptance independently', async () => {
  const f = fixture();
  const plan = await planGcpMarketplaceAcceptance(f.port, f.store);
  expect(f.grants()).toBe(0);
  expect(f.dryRuns()).toBe(1);
  expect(plan.purchases).toBe(0);
  const receipt = await applyGcpMarketplaceAcceptance(f.port, f.store, plan.planHash);
  expect(receipt.state).toBe('accepted');
  expect(f.grants()).toBe(1);
  expect(JSON.stringify(receipt)).not.toContain('private-consent-fixture');
  expect(JSON.stringify(receipt)).not.toContain('consent-1');
});
it('lost grant responses resume by checking active consent without duplicate acceptance', async () => {
  const f = fixture();
  const plan = await planGcpMarketplaceAcceptance(f.port, f.store);
  f.lose();
  await expect(applyGcpMarketplaceAcceptance(f.port, f.store, plan.planHash)).rejects.toThrow('lost grant');
  expect((await applyGcpMarketplaceAcceptance(f.port, f.store, plan.planHash)).state).toBe('accepted');
  expect(f.grants()).toBe(1);
  f.revoke();
  await expect(applyGcpMarketplaceAcceptance(f.port, f.store, plan.planHash)).rejects.toThrow('revoked');
  expect(f.grants()).toBe(1);
});
it('does not accept a document for another billing service or grant after image replacement', async () => {
  const f = fixture();
  const plan = await planGcpMarketplaceAcceptance(f.port, f.store);
  f.binding.imageId = '999';
  await expect(applyGcpMarketplaceAcceptance(f.port, f.store, plan.planHash)).rejects.toThrow('binding changed');
  f.binding.agreementDocument =
    'commerceoffercatalog.googleapis.com/services/foreign/standardOffers/default/agreements/eula/documents/v1';
  await expect(planGcpMarketplaceAcceptance(f.port, f.store)).rejects.toThrow('billing service');
  expect(f.grants()).toBe(0);
});
it('current acceptance is observed without granting and cannot be silently renewed after revocation', async () => {
  const f = fixture();
  f.activate();
  const plan = await planGcpMarketplaceAcceptance(f.port, f.store);
  expect(plan.alreadyAccepted).toBe(true);
  expect(f.dryRuns()).toBe(0);
  f.revoke();
  await expect(applyGcpMarketplaceAcceptance(f.port, f.store, plan.planHash)).rejects.toThrow('no longer active');
  expect(f.grants()).toBe(0);
});
it('rejects stale initial reviews and wrong-document or foreign-project consent evidence', async () => {
  const f = fixture();
  const plan = await planGcpMarketplaceAcceptance(f.port, f.store);
  const { planHash: _hash, ...body } = plan;
  const staleBody = { ...body, createdAt: '2000-01-01T00:00:00Z' },
    stale = { ...staleBody, planHash: fingerprint(staleBody) };
  await f.store.write(`gcp-marketplace-plan-${stale.planHash.slice(7)}.json`, stale);
  await expect(applyGcpMarketplaceAcceptance(f.port, f.store, stale.planHash)).rejects.toThrow('stale');
  f.activate();
  f.consent.name = 'projects/999/consents/consent-1';
  await expect(planGcpMarketplaceAcceptance(f.port, f.store)).rejects.toThrow('identity');
  f.consent.name = 'projects/123/consents/consent-1';
  f.consent.agreementDocument += '-old';
  await expect(planGcpMarketplaceAcceptance(f.port, f.store)).rejects.toThrow('identity');
  expect(f.grants()).toBe(0);
});
it('incomplete post-grant evidence cannot establish acceptance or trigger a blind retry', async () => {
  const f = fixture();
  const port = { ...f.port, check: async () => ({}) };
  const plan = await planGcpMarketplaceAcceptance(port, f.store);
  await expect(applyGcpMarketplaceAcceptance(port, f.store, plan.planHash)).rejects.toThrow(
    'independently established',
  );
  await expect(applyGcpMarketplaceAcceptance(port, f.store, plan.planHash)).rejects.toThrow('Ambiguous');
  expect(f.grants()).toBe(1);
});
