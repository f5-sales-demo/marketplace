export function renderAwsCeCloudInit(input: { nodeName: string; material: string }): string {
  if (!/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.nodeName)) throw new Error('Cloud-init node name is invalid');
  let parsed: Record<string, unknown>;
  try {
    parsed = Bun.YAML.parse(input.material) as Record<string, unknown>;
  } catch {
    throw new Error('Issued cloud-init material is malformed');
  }
  if (
    !input.material.startsWith('#cloud-config') ||
    !parsed ||
    !Array.isArray(parsed.write_files) ||
    parsed.write_files.some((file) => file.path === '/etc/vpm/config.yaml') ||
    !parsed.write_files.some((file) => file.path === '/etc/vpm/user_data')
  )
    throw new Error('Verified issued cloud-init material is required');
  if (['hostname', 'fqdn', 'preserve_hostname'].some((key) => Object.hasOwn(parsed, key)))
    throw new Error('Issued cloud-init contains an unresolved hostname policy');
  return `${input.material.trimEnd()}\nhostname: ${input.nodeName}\nfqdn: ${input.nodeName}\npreserve_hostname: false\n`;
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
