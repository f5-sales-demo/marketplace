import { describe, expect, test } from 'bun:test';
import { verifyGoogleRefreshEvidence } from '../src/credential-refresh-evidence';

const hash = (n: number) => n.toString(16).padStart(64, '0');
function fixture() {
  const identity = { pid: 241, group: 240, boot: '11111111-1111-1111-1111-111111111111', start: '1000000' };
  const bindings = {
    executionId: 'refresh-fixture',
    configurationSha256: hash(1),
    savedPlanSha256: hash(2),
    terraformSha256: hash(3),
    providerSha256: hash(4),
    adcSha256: hash(5),
    accountSha256: hash(6),
    audienceSha256: hash(7),
    identity,
  };
  const before = {
    tokenSha256: hash(8),
    accountSha256: hash(6),
    audienceSha256: hash(7),
    bodySha256: hash(9),
    requestStartedAt: 10000000,
    requestFinishedAt: 10000100,
    expiresInSeconds: 3600,
  };
  const after = {
    ...before,
    tokenSha256: hash(10),
    bodySha256: hash(11),
    requestStartedAt: 13602000,
    requestFinishedAt: 13602100,
  };
  const evidence = {
    schemaVersion: 1,
    kind: 'google-adc-refresh',
    engine: 'terraform',
    providerVersion: '8.7.0',
    ...bindings,
    tokens: [before, after],
    samples: [9999990, 10000110, 13601990, 13602110].map((at) => ({
      identity: { ...identity },
      epochMs: at,
      monotonicMs: at - 9000000,
    })),
  };
  return { evidence, bindings };
}
describe('original Google provider refresh evidence', () => {
  test('consistent evidence still requires independent review and grants no cloud execution', () => {
    const { evidence, bindings } = fixture();
    expect(verifyGoogleRefreshEvidence(evidence, bindings)).toEqual({
      evidenceConsistent: true,
      requiresIndependentReview: true,
      cloudExecutionEnabled: false,
      beforeExpiresNoLaterThan: 13600100,
    });
  });
  test.each([
    'configurationSha256',
    'savedPlanSha256',
    'terraformSha256',
    'providerSha256',
    'adcSha256',
    'accountSha256',
    'audienceSha256',
  ] as const)('refuses changed %s', (key) => {
    const { evidence, bindings } = fixture();
    evidence[key] = hash(99);
    expect(() => verifyGoogleRefreshEvidence(evidence, bindings)).toThrow();
  });
  test.each(['pid', 'group', 'boot', 'start'] as const)('refuses replaced provider %s', (key) => {
    const { evidence, bindings } = fixture();
    const last = evidence.samples[3];
    Object.assign(last.identity, {
      [key]:
        key === 'pid' || key === 'group' ? 999 : key === 'boot' ? '22222222-2222-2222-2222-222222222222' : '9999999',
    });
    expect(() => verifyGoogleRefreshEvidence(evidence, bindings)).toThrow();
  });
  test('refuses the same token after expiry', () => {
    const { evidence, bindings } = fixture();
    evidence.tokens[1].tokenSha256 = evidence.tokens[0].tokenSha256;
    expect(() => verifyGoogleRefreshEvidence(evidence, bindings)).toThrow();
  });
  test.each(['accountSha256', 'audienceSha256'] as const)('refuses changed renewed-token %s', (key) => {
    const { evidence, bindings } = fixture();
    evidence.tokens[1][key] = hash(99);
    expect(() => verifyGoogleRefreshEvidence(evidence, bindings)).toThrow();
  });
  test('refuses requests before the conservative expiry boundary', () => {
    const { evidence, bindings } = fixture();
    evidence.tokens[1].requestStartedAt = 13600100;
    expect(() => verifyGoogleRefreshEvidence(evidence, bindings)).toThrow();
  });
  test('refuses unbounded or reversed HTTP observations', () => {
    for (const end of [9999999, 10060001, Number.NaN]) {
      const { evidence, bindings } = fixture();
      evidence.tokens[0].requestFinishedAt = end;
      expect(() => verifyGoogleRefreshEvidence(evidence, bindings)).toThrow();
    }
  });
  test('refuses clock jumps and missing original-process boundaries', () => {
    const a = fixture();
    a.evidence.samples[3].monotonicMs -= 1001;
    expect(() => verifyGoogleRefreshEvidence(a.evidence, a.bindings)).toThrow();
    const b = fixture();
    b.evidence.samples.pop();
    expect(() => verifyGoogleRefreshEvidence(b.evidence, b.bindings)).toThrow();
  });
  test('refuses stale or absent live original identity around token reads', () => {
    const { evidence, bindings } = fixture();
    evidence.samples[0].epochMs -= 6000;
    evidence.samples[0].monotonicMs -= 6000;
    expect(() => verifyGoogleRefreshEvidence(evidence, bindings)).toThrow();
  });
  test('refuses unsupported engines, versions and malformed evidence', () => {
    for (const patch of [{ engine: 'native' }, { providerVersion: '8.6.0' }, { tokens: null }, { samples: [] }]) {
      const { evidence, bindings } = fixture();
      expect(() => verifyGoogleRefreshEvidence({ ...evidence, ...patch }, bindings)).toThrow();
    }
  });
});
