// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import { makeExecApi } from './runtime-30f0rzjf.js';
import { analyzeAwsCloudInit } from './runtime-k1rqsw4z.js';
import { sha256Hex } from './runtime-wvre8ba5.js';

// plugins/aws/src/ce/console-evidence.ts
function summarizeAwsConsoleOutput(result, instanceId, observedAt = new Date().toISOString()) {
  const base = { instanceId, source: 'aws:ec2:get-console-output', observedAt, scope: 'console-signals-only' };
  const unknown = { ...base, ok: false, cloudInitFinished: null, errorsDetected: null, warningsDetected: null };
  if (result.exitCode !== 0) return { ...unknown, reason: 'console-unavailable' };
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    return { ...unknown, reason: 'malformed-console-response' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ...unknown, reason: 'malformed-console-response' };
  const value = raw;
  const timestamp =
    typeof value.Timestamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.Timestamp)
      ? Date.parse(value.Timestamp)
      : Number.NaN;
  const now = Date.parse(observedAt);
  if (
    value.InstanceId !== instanceId ||
    typeof value.Output !== 'string' ||
    !value.Output.trim() ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(now) ||
    timestamp > now + 5000
  )
    return { ...unknown, reason: 'console-identity-time-or-output-unavailable' };
  const lines = value.Output.split(/\r?\n/);
  return {
    ...base,
    ok: true,
    timestamp: value.Timestamp,
    ageSeconds: Math.max(0, (now - timestamp) / 1000),
    bytes: Buffer.byteLength(value.Output),
    digest: sha256Hex(value.Output),
    cloudInitFinished: lines.some((line) => /cloud-init\b.*\bfinished at\b/i.test(line)),
    warningsDetected: lines.some((line) => /\bWARNING\b|\[WARN\]/i.test(line)),
    errorsDetected: lines.some(
      (line) =>
        /failed to run module\b|running module\b.*\bfailed\b|failed to start\b.*\bcloud-init\b/i.test(line) ||
        (/\bERROR\b|\bCRITICAL\b/.test(line) && /cloud-init\b|\b(?:cc_\w+|util|stages|schema)\.py\b/i.test(line)),
    ),
  };
}

// plugins/aws/src/tools/aws-cloud-init-analyze.ts
function createAwsCloudInitAnalyzeTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_cloud_init_analyze',
    label: 'Analyze AWS cloud-init',
    description:
      'Validate CE or general Linux cloud-init and summarize redacted EC2 console evidence without returning user data, bootstrap tokens, or raw boot logs.',
    parameters: Type.Object({
      source: Type.Optional(Type.String()),
      sourceArtifactId: Type.Optional(Type.String()),
      instanceId: Type.Optional(Type.String()),
      region: Type.Optional(Type.String()),
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
        const analysis = source ? analyzeAwsCloudInit(source) : undefined;
        let bootEvidence;
        if (params.instanceId || params.region) {
          const instanceId = params.instanceId ?? '';
          const region = params.region ?? '';
          if (!/^i-[0-9a-f]{8,17}$/.test(instanceId) || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region))
            throw new Error('instanceId and region are required together');
          const result = await makeApi(ctx.cwd).exec('aws', [
            'ec2',
            'get-console-output',
            '--instance-id',
            instanceId,
            '--latest',
            '--region',
            region,
            '--output',
            'json',
          ]);
          bootEvidence = summarizeAwsConsoleOutput(result, instanceId);
        }
        if (!analysis && !bootEvidence)
          throw new Error('Provide cloud-init source, a session artifact ID, or complete EC2 coordinates');
        return {
          content: [
            {
              type: 'text',
              text: `cloud-init analysis: ${analysis ? (analysis.valid ? 'valid' : 'invalid') : 'source not inspected'}; stages: init-local \u2192 init-network \u2192 config \u2192 final; boot evidence: ${bootEvidence ? (bootEvidence.ok ? 'collected' : 'unavailable') : 'not requested'}. Raw user data and logs were withheld.`,
            },
          ],
          details: { tool: 'aws_cloud_init_analyze', analysis, bootEvidence },
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
          details: { tool: 'aws_cloud_init_analyze' },
        };
      }
    },
  };
}

export { createAwsCloudInitAnalyzeTool };
