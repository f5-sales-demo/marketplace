import { describe, expect, it } from 'bun:test';
import { mapSalesforceToProfile } from '../../src/context/profile-mapper';
import type { SalesforceContext } from '../../src/context/salesforce-context';

function makeCtx(overrides: Partial<SalesforceContext> = {}): SalesforceContext {
  return {
    userId: '005xx',
    username: 'user@example.com',
    instanceUrl: 'https://test.salesforce.com',
    collectedAt: new Date().toISOString(),
    ...overrides,
  } as SalesforceContext;
}

describe('mapSalesforceToProfile', () => {
  describe('manager mapping', () => {
    it('splits single-word manager name', () => {
      const result = mapSalesforceToProfile(makeCtx({ managerName: 'Kevin' }));
      expect(result.manager?.givenName).toBe('Kevin');
      expect(result.manager?.familyName).toBeUndefined();
    });

    it('splits two-word manager name', () => {
      const result = mapSalesforceToProfile(makeCtx({ managerName: 'Kevin Reynolds' }));
      expect(result.manager?.givenName).toBe('Kevin');
      expect(result.manager?.familyName).toBe('Reynolds');
    });

    it('handles three-word manager name', () => {
      const result = mapSalesforceToProfile(makeCtx({ managerName: 'Mary Jane Watson' }));
      expect(result.manager?.givenName).toBe('Mary');
      expect(result.manager?.familyName).toBe('Jane Watson');
    });

    it('trims whitespace in manager name', () => {
      const result = mapSalesforceToProfile(makeCtx({ managerName: '  Kevin  Reynolds  ' }));
      expect(result.manager?.givenName).toBe('Kevin');
      expect(result.manager?.familyName).toBe('Reynolds');
    });

    it('omits manager when managerName is undefined', () => {
      const result = mapSalesforceToProfile(makeCtx({}));
      expect(result.manager).toBeUndefined();
    });
  });

  describe('partner mapping', () => {
    it('maps discoveredPartner fields', () => {
      const result = mapSalesforceToProfile(
        makeCtx({
          discoveredPartner: { id: '005abc', name: 'Jane Doe', title: 'Account Executive', role: 'AE' },
        }),
      );
      expect(result.partner).toEqual({ id: '005abc', name: 'Jane Doe', title: 'Account Executive', role: 'AE' });
    });

    it('omits partner when discoveredPartner is undefined', () => {
      const result = mapSalesforceToProfile(makeCtx({}));
      expect(result.partner).toBeUndefined();
    });
  });

  describe('territories mapping', () => {
    it('maps non-empty territories array', () => {
      const result = mapSalesforceToProfile(makeCtx({ territories: ['West', 'Central'] }));
      expect(result.territories).toEqual(['West', 'Central']);
    });

    it('omits territories when array is empty', () => {
      const result = mapSalesforceToProfile(makeCtx({ territories: [] }));
      expect(result.territories).toBeUndefined();
    });

    it('omits territories when undefined', () => {
      const result = mapSalesforceToProfile(makeCtx({}));
      expect(result.territories).toBeUndefined();
    });
  });

  describe('role mapping', () => {
    it('maps discoveredRole', () => {
      const result = mapSalesforceToProfile(makeCtx({ discoveredRole: 'SE' }));
      expect(result.role).toBe('SE');
    });

    it('omits role when discoveredRole is undefined', () => {
      const result = mapSalesforceToProfile(makeCtx({}));
      expect(result.role).toBeUndefined();
    });
  });

  describe('empty context', () => {
    it('returns empty object when no discoverable data', () => {
      const result = mapSalesforceToProfile(makeCtx({}));
      expect(result).toEqual({});
    });
  });
});
