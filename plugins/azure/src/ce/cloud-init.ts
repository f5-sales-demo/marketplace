export interface CloudInitAnalysis {
  valid: boolean;
  format: 'cloud-config' | 'shell' | 'unknown';
  stages: ['init-local', 'init-network', 'config', 'final'];
  findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
  sensitiveLineCount: number;
}

export function renderCeCloudInit(input: { siteName: string; nodeName: string; token: string }): string {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(input.token);
  } catch {
    throw new Error('Azure requires platform-issued cloud-init material');
  }
  if (
    envelope.version !== 2 ||
    envelope.provider !== 'azure' ||
    envelope.siteName !== input.siteName ||
    envelope.nodeName !== input.nodeName ||
    typeof envelope.configurationUid !== 'string' ||
    !envelope.configurationUid ||
    typeof envelope.cloudInit !== 'string' ||
    !envelope.cloudInit.startsWith('#cloud-config') ||
    /\{\{|\}\}|\/etc\/vpm\/config\.yaml/.test(envelope.cloudInit)
  )
    throw new Error('Issued Azure bootstrap identity or material differs');
  return envelope.cloudInit;
}

export function analyzeCloudInit(source: string, secrets: string[] = []): CloudInitAnalysis {
  const findings: CloudInitAnalysis['findings'] = [];
  const hasForbiddenControl = Array.from(source).some((character) => {
    const code = character.charCodeAt(0);
    return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13);
  });
  if (hasForbiddenControl) findings.push({ severity: 'error', message: 'Input contains forbidden control characters' });
  const format = source.startsWith('#cloud-config') ? 'cloud-config' : source.startsWith('#!') ? 'shell' : 'unknown';
  if (format === 'unknown') findings.push({ severity: 'error', message: 'Missing #cloud-config or script header' });
  if (source.includes('runcmd:'))
    findings.push({ severity: 'info', message: 'Commands run during the final cloud-init stage' });
  if (source.includes('write_files:'))
    findings.push({ severity: 'info', message: 'Files are written during the config stage' });
  const sensitiveLineCount = source
    .split('\n')
    .filter(
      (line) =>
        secrets.some((secret) => secret && line.includes(secret)) ||
        /^\s*(?:bootstrap_?token|token|password|secret|private_?key)\s*:/i.test(line),
    ).length;
  if (sensitiveLineCount > 0)
    findings.push({
      severity: 'warning',
      message: 'Sensitive bootstrap material is present and has been redacted from this analysis',
    });
  return {
    valid: !findings.some((finding) => finding.severity === 'error'),
    format,
    stages: ['init-local', 'init-network', 'config', 'final'],
    findings,
    sensitiveLineCount,
  };
}
