// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import { sha256Hex } from './runtime-6j4b2rhv.js';
import { makeExecApi } from './runtime-2139fbqg.js';

// plugins/azure/src/ce/cloud-init.ts
function analyzeCloudInit(source, secrets = []) {
  const findings = [];
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
    .split(`
`)
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

// plugins/azure/src/tools/azure-cloud-init-analyze.ts
function createAzureCloudInitAnalyzeTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_cloud_init_analyze',
    label: 'Analyze Azure cloud-init',
    description:
      'Validate CE or general Linux cloud-init, explain its execution stages, and summarize Azure boot status/log evidence without returning user data, custom data, or bootstrap tokens.',
    parameters: Type.Object({
      source: Type.Optional(Type.String()),
      sourceArtifactId: Type.Optional(Type.String()),
      subscriptionId: Type.Optional(Type.String()),
      resourceGroup: Type.Optional(Type.String()),
      vmName: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        let source = params.source;
        if (params.sourceArtifactId) {
          if (!/^\d+$/.test(params.sourceArtifactId)) throw new Error('Invalid source artifact ID');
          const path = await ctx.sessionManager.getArtifactPath(params.sourceArtifactId);
          if (!path) throw new Error('Source artifact was not found in this session');
          source = await Bun.file(path).text();
        }
        const analysis = source ? analyzeCloudInit(source) : undefined;
        let bootEvidence;
        if (params.subscriptionId || params.resourceGroup || params.vmName) {
          if (!params.subscriptionId || !params.resourceGroup || !params.vmName)
            throw new Error('subscriptionId, resourceGroup, and vmName are required together');
          const result = await makeApi(ctx.cwd).exec('az', [
            'vm',
            'boot-diagnostics',
            'get-boot-log',
            '--resource-group',
            params.resourceGroup,
            '--name',
            params.vmName,
            '--subscription',
            params.subscriptionId,
          ]);
          const raw = `${result.stdout}
${result.stderr}`;
          bootEvidence = {
            ok: result.exitCode === 0,
            bytes: Buffer.byteLength(raw),
            digest: sha256Hex(raw),
            cloudInitFinished: /cloud-init.*finish|status:\s*done/i.test(raw),
            errorsDetected: /cloud-init.*(?:error|fail)/i.test(raw),
          };
        }
        if (!analysis && !bootEvidence)
          throw new Error('Provide cloud-init source, a session artifact ID, or complete VM coordinates');
        return {
          content: [
            {
              type: 'text',
              text: `cloud-init analysis: ${analysis ? (analysis.valid ? 'valid' : 'invalid') : 'source not inspected'}; stages: init-local \u2192 init-network \u2192 config \u2192 final; boot evidence: ${bootEvidence ? (bootEvidence.ok ? 'collected' : 'unavailable') : 'not requested'}. Raw user data and logs were withheld.`,
            },
          ],
          details: { tool: 'azure_cloud_init_analyze', analysis, bootEvidence },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `cloud-init analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_cloud_init_analyze' },
        };
      }
    },
  };
}

export { createAzureCloudInitAnalyzeTool };
