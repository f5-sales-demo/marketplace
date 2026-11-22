// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/aws/src/ce/cloud-init.ts
function renderAwsCeCloudInit(input) {
  if (!/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.nodeName)) throw new Error('Cloud-init node name is invalid');
  let parsed;
  try {
    parsed = Bun.YAML.parse(input.material);
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
  return `${input.material.trimEnd()}
hostname: ${input.nodeName}
fqdn: ${input.nodeName}
preserve_hostname: false
`;
}
function analyzeAwsCloudInit(body, sensitiveValues = []) {
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

export { analyzeAwsCloudInit, renderAwsCeCloudInit };
