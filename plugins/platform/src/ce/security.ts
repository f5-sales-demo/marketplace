const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
const FORBIDDEN_KEY = /(?:^|_)(?:token|secret|password|credential|private_?key|custom_?data|user_?data)(?:$|_)/i;
const SENSITIVE_VALUE = /(?:APIToken|Bearer)\s+\S+|f5xc-ce:\/\//i;
const CONTROL = /[\u0000-\u001f\u007f]/;

export class PublicCeError extends Error {}

export function assertSafeName(value: string, label: string): void {
  if (!SAFE_NAME.test(value)) throw new PublicCeError(`${label} must contain only letters, numbers, dots, underscores, and hyphens`);
}

export function assertSecretFree(value: unknown, path = 'config'): void {
  if (typeof value === 'string') {
    if (CONTROL.test(value)) throw new PublicCeError(`${path} contains control characters`);
    if (SENSITIVE_VALUE.test(value)) throw new PublicCeError(`${path} contains credential-shaped data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretFree(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key)) throw new PublicCeError(`${path}.${key} is not allowed in a secret-free CE plan`);
    assertSecretFree(item, `${path}.${key}`);
  }
}

export function redactExternal(value: unknown): unknown {
  if (typeof value === 'string') return SENSITIVE_VALUE.test(value) ? '[redacted]' : value.replace(CONTROL, '');
  if (Array.isArray(value)) return value.map(redactExternal);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !FORBIDDEN_KEY.test(key))
    .map(([key, item]) => [key, redactExternal(item)]));
}

export function publicFailure(error: unknown, fallback: string): string {
  return error instanceof PublicCeError ? error.message : fallback;
}
