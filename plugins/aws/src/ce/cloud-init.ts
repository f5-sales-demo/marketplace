export function renderAwsCeCloudInit(input: { siteName: string; nodeName: string; token: string }): string {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/.test(input.siteName) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/.test(input.nodeName)
  )
    throw new Error('Cloud-init site or node name is invalid');
  if (
    !input.token ||
    Array.from(input.token).some(
      (character) => character === '\r' || character === '\n' || character.charCodeAt(0) === 0,
    )
  )
    throw new Error('Bootstrap token is invalid');
  const payload = Buffer.from(
    JSON.stringify({ siteName: input.siteName, nodeName: input.nodeName, bootstrapToken: input.token }),
    'utf8',
  ).toString('base64');
  return `#cloud-config\nwrite_files:\n  - path: /var/lib/f5xc/bootstrap.json\n    permissions: '0600'\n    encoding: b64\n    content: ${payload}\nruncmd:\n  - [ systemctl, enable, --now, f5xc-ce ]\n`;
}

export function analyzeAwsCloudInit(body: string, sensitiveValues: string[] = []) {
  const redacted = sensitiveValues.reduce(
    (value, secret) => (secret ? value.replaceAll(secret, '[redacted]') : value),
    body,
  );
  const controls = Array.from(redacted).some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });
  return {
    valid: redacted.startsWith('#cloud-config') && !controls,
    stages: ['init-local', 'init-network', 'config', 'final'],
    hasWriteFiles: /^write_files:/m.test(redacted),
    hasRunCmd: /^runcmd:/m.test(redacted),
    sha256: new Bun.CryptoHasher('sha256').update(redacted).digest('hex'),
  };
}
