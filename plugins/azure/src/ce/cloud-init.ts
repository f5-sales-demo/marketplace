export interface CloudInitAnalysis {
  valid: boolean;
  format: 'cloud-config' | 'shell' | 'unknown';
  stages: ['init-local', 'init-network', 'config', 'final'];
  findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
  sensitiveLineCount: number;
}

function yamlSafe(value: string): string {
  return JSON.stringify(value);
}

export function renderCeCloudInit(input: { siteName: string; nodeName: string; token: string }): string {
  const payload = Buffer.from(JSON.stringify({
    version: 2,
    site: input.siteName,
    node: input.nodeName,
    bootstrap_token: input.token,
  })).toString('base64');
  return [
    '#cloud-config',
    'write_files:',
    '  - path: /etc/vpm/user_data',
    "    permissions: '0600'",
    '    owner: root:root',
    '    encoding: b64',
    `    content: ${payload}`,
    'runcmd:',
    `  - [ systemctl, restart, ${yamlSafe('vpm')} ]`,
    '',
  ].join('\n');
}

export function analyzeCloudInit(source: string, secrets: string[] = []): CloudInitAnalysis {
  const findings: CloudInitAnalysis['findings'] = [];
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) findings.push({ severity: 'error', message: 'Input contains forbidden control characters' });
  const format = source.startsWith('#cloud-config') ? 'cloud-config' : source.startsWith('#!') ? 'shell' : 'unknown';
  if (format === 'unknown') findings.push({ severity: 'error', message: 'Missing #cloud-config or script header' });
  if (source.includes('runcmd:')) findings.push({ severity: 'info', message: 'Commands run during the final cloud-init stage' });
  if (source.includes('write_files:')) findings.push({ severity: 'info', message: 'Files are written during the config stage' });
  const sensitiveLineCount = source.split('\n').filter((line) =>
    secrets.some((secret) => secret && line.includes(secret))
    || /^\s*(?:bootstrap_?token|token|password|secret|private_?key)\s*:/i.test(line),
  ).length;
  if (sensitiveLineCount > 0) findings.push({ severity: 'warning', message: 'Sensitive bootstrap material is present and has been redacted from this analysis' });
  return {
    valid: !findings.some((finding) => finding.severity === 'error'),
    format,
    stages: ['init-local', 'init-network', 'config', 'final'],
    findings,
    sensitiveLineCount,
  };
}
