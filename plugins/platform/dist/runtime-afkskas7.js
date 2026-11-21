// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/platform/src/ce/security.ts
var SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
var FORBIDDEN_KEY = /(?:^|_)(?:token|secret|password|credential|private_?key|custom_?data|user_?data)(?:$|_)/i;
var SENSITIVE_VALUE = /(?:APIToken|Bearer)\s+\S+|f5xc-ce:\/\//i;
function containsControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
class PublicCeError extends Error {}
function assertSafeName(value, label) {
  if (!SAFE_NAME.test(value))
    throw new PublicCeError(`${label} must contain only letters, numbers, dots, underscores, and hyphens`);
}
function assertSecretFree(value, path = 'config') {
  if (typeof value === 'string') {
    if (containsControlCharacters(value)) throw new PublicCeError(`${path} contains control characters`);
    if (SENSITIVE_VALUE.test(value)) throw new PublicCeError(`${path} contains credential-shaped data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSecretFree(item, `${path}[${index}]`);
    });
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new PublicCeError(`${path}.${key} is not allowed in a secret-free CE plan`);
    assertSecretFree(item, `${path}.${key}`);
  }
}
function publicFailure(error, fallback) {
  return error instanceof PublicCeError ? error.message : fallback;
}

export { assertSafeName, assertSecretFree, PublicCeError, publicFailure };
