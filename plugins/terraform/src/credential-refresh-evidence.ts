/** Consistency checks for independently reviewed Google ADC refresh captures. No execution grant. */
export interface GoogleProviderIdentity {
  pid: number;
  group: number;
  boot: string;
  start: string;
}
export interface GoogleRefreshBindings {
  executionId: string;
  configurationSha256: string;
  savedPlanSha256: string;
  terraformSha256: string;
  providerSha256: string;
  adcSha256: string;
  accountSha256: string;
  audienceSha256: string;
  identity: GoogleProviderIdentity;
}
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Typed refresh evidence required');
  return value as Record<string, unknown>;
};
const instant = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('Finite refresh clock required');
  return value as number;
};
function identity(value: unknown): GoogleProviderIdentity {
  const v = object(value);
  if (
    !Number.isSafeInteger(v.pid) ||
    (v.pid as number) <= 0 ||
    (v.pid as number) >= 2 ** 31 ||
    !Number.isSafeInteger(v.group) ||
    (v.group as number) <= 0 ||
    (v.group as number) >= 2 ** 31 ||
    typeof v.boot !== 'string' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.boot) ||
    typeof v.start !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(v.start)
  )
    throw new Error('Original provider identity required');
  return { pid: v.pid as number, group: v.group as number, boot: v.boot, start: v.start };
}
function sameIdentity(a: GoogleProviderIdentity, b: GoogleProviderIdentity): boolean {
  return a.pid === b.pid && a.group === b.group && a.boot === b.boot && a.start === b.start;
}
/** The trusted reviewer must verify raw HTTPS bodies, original process captures and each bound file. */
export function verifyGoogleRefreshEvidence(input: unknown, expected: GoogleRefreshBindings) {
  const evidence = object(input);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.kind !== 'google-adc-refresh' ||
    evidence.engine !== 'terraform' ||
    evidence.providerVersion !== '8.7.0'
  )
    throw new Error('Qualified Google Terraform refresh schema required');
  if (!expected.executionId || evidence.executionId !== expected.executionId)
    throw new Error('Original refresh execution required');
  for (const key of [
    'configurationSha256',
    'savedPlanSha256',
    'terraformSha256',
    'providerSha256',
    'adcSha256',
    'accountSha256',
    'audienceSha256',
  ] as const) {
    if (!hash(expected[key]) || evidence[key] !== expected[key]) throw new Error('Reviewed refresh input changed');
  }
  const original = identity(expected.identity);
  if (!sameIdentity(identity(evidence.identity), original)) throw new Error('Original provider changed');
  if (
    !Array.isArray(evidence.tokens) ||
    evidence.tokens.length !== 2 ||
    !Array.isArray(evidence.samples) ||
    evidence.samples.length < 4 ||
    evidence.samples.length > 128
  )
    throw new Error('Both token reads and original process boundaries required');
  const tokens = evidence.tokens.map((raw) => {
    const value = object(raw);
    if (
      !hash(value.tokenSha256) ||
      !hash(value.bodySha256) ||
      value.accountSha256 !== expected.accountSha256 ||
      value.audienceSha256 !== expected.audienceSha256 ||
      !Number.isSafeInteger(value.expiresInSeconds) ||
      (value.expiresInSeconds as number) <= 60 ||
      (value.expiresInSeconds as number) > 3600
    )
      throw new Error('Verified Google token, audience and principal required');
    const started = instant(value.requestStartedAt),
      finished = instant(value.requestFinishedAt);
    if (finished < started || finished - started > 60000) throw new Error('Bounded complete token inspection required');
    return {
      hash: value.tokenSha256,
      bodyHash: value.bodySha256,
      started,
      finished,
      expiresNoLaterThan: finished + (value.expiresInSeconds as number) * 1000,
    };
  });
  const [before, after] = tokens;
  if (
    before.hash === after.hash ||
    before.bodyHash === after.bodyHash ||
    after.started < before.expiresNoLaterThan + 1000
  )
    throw new Error('Distinct renewed token after conservative original expiry required');
  const samples = evidence.samples.map((raw) => {
    const value = object(raw);
    if (!sameIdentity(identity(value.identity), original)) throw new Error('Provider restarted during refresh');
    return { epoch: instant(value.epochMs), monotonic: instant(value.monotonicMs) };
  });
  const offset = samples[0].epoch - samples[0].monotonic;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (
      Math.abs(sample.epoch - sample.monotonic - offset) > 1000 ||
      (i > 0 && (sample.epoch <= samples[i - 1].epoch || sample.monotonic <= samples[i - 1].monotonic))
    )
      throw new Error('Stable ordered original refresh clocks required');
  }
  if (samples[samples.length - 1].monotonic - samples[0].monotonic > 7200000)
    throw new Error('Immutable two-hour refresh deadline exceeded');
  for (const token of tokens) {
    const left = samples.filter((sample) => sample.epoch <= token.started).at(-1);
    const right = samples.find((sample) => sample.epoch >= token.finished);
    if (!left || !right || token.started - left.epoch >= 5000 || right.epoch - token.finished >= 5000)
      throw new Error('Fresh original provider observations must bracket both token reads');
  }
  return {
    evidenceConsistent: true as const,
    requiresIndependentReview: true as const,
    cloudExecutionEnabled: false as const,
    beforeExpiresNoLaterThan: before.expiresNoLaterThan,
  };
}
