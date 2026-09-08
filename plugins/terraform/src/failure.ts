export type TerraformFailureCategory =
  | 'capacity'
  | 'quota'
  | 'authorization'
  | 'expired'
  | 'throttled'
  | 'configuration'
  | 'state-lock'
  | 'unknown';

const patterns: Array<[TerraformFailureCategory, RegExp]> = [
  ['capacity', /\bInsufficientInstanceCapacity\b/],
  ['quota', /\bVpcLimitExceeded\b/],
  ['authorization', /\b(?:AccessDenied|AccessDeniedException|UnauthorizedOperation|AuthorizationFailed)\b/],
  ['expired', /\b(?:ExpiredToken|ExpiredTokenException|AuthenticationTokenExpired)\b/],
  ['throttled', /\b(?:Throttling|ThrottlingException|RequestLimitExceeded|TooManyRequests)\b/],
  [
    'configuration',
    /(?:Error: (?:Missing block label|Unsupported argument|Invalid expression|Invalid reference)|"summary"\s*:\s*"(?:Missing block label|Unsupported argument|Invalid expression|Invalid reference)")/,
  ],
  ['state-lock', /Error (?:acquiring|releasing) the state lock/],
];

/** Inspect bounded private stderr; expose only a fixed category, never diagnostic text. */
export function terraformFailureCategories(text: string): TerraformFailureCategory[] {
  const plain = Bun.stripANSI(text);
  return patterns.filter(([, pattern]) => pattern.test(plain)).map(([category]) => category);
}

export class TerraformCommandError extends Error {
  readonly category: TerraformFailureCategory;
  constructor(
    readonly operation: string,
    readonly exitCode: number,
    category: TerraformFailureCategory = 'unknown',
  ) {
    const safe = category === 'unknown' || patterns.some(([value]) => value === category) ? category : 'unknown';
    super(`Terraform ${operation} failed (${safe}); exit code ${exitCode}`);
    this.name = 'TerraformCommandError';
    this.category = safe;
  }
}
