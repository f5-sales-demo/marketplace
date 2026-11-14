import { expect, test } from 'bun:test';
import { createWireValidator } from '../../src/ce/wire-schema';
import { buildSiteUpgradeRequest, type SiteUpgradeIntent } from '../../src/ce/wire-upgrade';
import fixture from '../fixtures/site-upgrade-schema.json';

test('maps software and OS actions to verified request bodies without bypassing platform checks', () => {
  for (const [kind, version, root, suffix] of [
    ['software', 'crt-20260201-0179', 'siteUpgradeSWRequest', 'sw'],
    ['os', '9.2026.17', 'siteUpgradeOSRequest', 'os'],
  ] as const) {
    const result = buildSiteUpgradeRequest(
      { siteName: 'ce-one', kind, version },
      createWireValidator(fixture.schemas, root),
    );
    expect(result).toEqual({
      method: 'POST',
      path: `/api/config/namespaces/system/sites/ce-one/upgrade_${suffix}`,
      body: { namespace: 'system', name: 'ce-one', version, force: false },
    });
  }
});
test('rejects unscoped names, aliases, unresolved versions, force requests and mismatched version types', () => {
  const valid = { siteName: 'ce-one', kind: 'software', version: 'crt-20260201-0179' };
  for (const patch of [
    { siteName: undefined },
    { siteName: '../ce-one' },
    { siteName: 'ce/other' },
    { version: 'latest' },
    { version: '__VERSION__' },
    { version: '9.2026.17' },
    { kind: 'os' },
    { kind: 'reboot' },
    { force: true },
  ]) {
    let validations = 0;
    expect(() =>
      buildSiteUpgradeRequest({ ...valid, ...patch } as SiteUpgradeIntent, () => {
        validations++;
      }),
    ).toThrow();
    expect(validations).toBe(0);
  }
});
