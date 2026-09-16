import { describe, expect, it } from 'bun:test';
import type { KvmLifecyclePlan, KvmLifecyclePreflight } from '../src/lifecycle';
import { createKvmSmsv2Tools, type KvmToolContext, type KvmToolRuntime } from '../src/tools';

const Type: Record<string, (...args: unknown[]) => unknown> = {
  Object: (...args: unknown[]) => args[0],
  String: (...args: unknown[]) => ({ type: 'string', ...((args[0] as object) ?? {}) }),
  Boolean: (...args: unknown[]) => ({ type: 'boolean', ...((args[0] as object) ?? {}) }),
  Number: (...args: unknown[]) => ({ type: 'number', ...((args[0] as object) ?? {}) }),
  Optional: (...args: unknown[]) => ({ optional: true, ...((args[0] as object) ?? {}) }),
  Array: (...args: unknown[]) => ({ type: 'array', items: args[0] }),
  Union: (...args: unknown[]) => ({ union: args[0] }),
  Literal: (...args: unknown[]) => ({ const: args[0] }),
};

const preflight: KvmLifecyclePreflight = {
  releasePrerequisite: {
    id: 'maurice_config_cardinality_exactly_one',
    resource: 'maurice_config',
    cardinality: { exactly: 1 },
    enforcement: 'server',
    availability: 'external_tenant_prerequisite',
    reason: 'The tenant must contain exactly one maurice_config object before image issuance.',
    source: {
      kind: 'runtime_api_error',
      operation: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl',
      immutable: true,
    },
    publication: {
      repository: 'f5-sales-demo/api-specs-enriched',
      tag: 'v7.0.3',
      commit: '55151d9bda8ea8f04c595e76ee6b05aee96d7fc7',
      asset: 'openapi.json',
      sha256: 'sha256:d17d0e8366d49132d8de12498585725cc77d20390919b359de8c126d3e624993',
    },
  },
  imagePrerequisite: { available: true },
  host: { hostname: 'kvm-demo.example.test', libvirtUri: 'qemu:///system', projectResources: [] },
};

function runtime(overrides: Partial<KvmToolRuntime> = {}): KvmToolRuntime {
  return {
    preflight: async () => preflight,
    plan: async () => ({ planArtifact: 'artifact://kvm-plan', lifecyclePlan: plan() }),
    apply: async () => ({ mode: 'apply', outputBytes: 60, outputSha256: 'c'.repeat(64) }),
    drift: async () => ({ planArtifact: 'artifact://kvm-drift', lifecyclePlan: plan() }),
    status: async () => ({
      hostname: 'kvm-demo.example.test',
      libvirtUri: 'qemu:///system',
      terraformResources: 12,
      domains: [
        { name: 'onprem-ce-01', state: 'running' },
        { name: 'onprem-ce-02', state: 'running' },
        { name: 'onprem-ce-03', state: 'running' },
      ],
      frr: { present: true, peers: 3, established: 3, sha256: 'd'.repeat(64) },
      traffic: { samples: 5, successes: 5, statusCodes: [200, 200, 200, 200, 200] },
    }),
    ...overrides,
  };
}

function plan(): KvmLifecyclePlan {
  return {
    ...preflight,
    savedPlan: {
      path: '/secure/evidence/kvm.tfplan',
      sha256: 'b'.repeat(64),
      mode: 'apply',
      add: 12,
      change: 0,
      destroy: 0,
      azureActions: 0,
    },
  };
}

const context: KvmToolContext = {
  hasUI: false,
  ui: { confirm: async () => false },
  sessionManager: {
    getSessionId: () => 'fixture-session',
    getArtifactsDir: () => '/secure/evidence',
    saveArtifact: async () => 'artifact://fixture',
    getArtifactPath: async () => null,
  },
};

interface TestToolResult {
  content: Array<{ text: string }>;
  isError?: boolean;
  details: Record<string, unknown>;
}

interface TestTool {
  name: string;
  execute(...args: unknown[]): Promise<TestToolResult>;
}

function tools(value: KvmToolRuntime): TestTool[] {
  return createKvmSmsv2Tools({ typebox: { Type } }, value) as unknown as TestTool[];
}

describe('kvm_smsv2_preflight', () => {
  it('does not accept release provenance from the caller', () => {
    const tool = tools(runtime()).find((candidate) => candidate.name === 'kvm_smsv2_preflight') as
      | (TestTool & { parameters: Record<string, unknown> })
      | undefined;
    if (!tool) throw new Error('preflight tool was not registered');
    expect(tool.parameters).toHaveProperty('workspace');
    expect(tool.parameters).not.toHaveProperty('contractTag');
    expect(tool.parameters).not.toHaveProperty('contractCommit');
    expect(tool.parameters).not.toHaveProperty('openapiSha256');
    expect(tool.parameters).not.toHaveProperty('reason');
  });

  it('returns only non-secret prerequisite, host, and provenance evidence', async () => {
    const tool = tools(runtime()).find((candidate) => candidate.name === 'kvm_smsv2_preflight');
    if (!tool) throw new Error('preflight tool was not registered');
    const result = await tool.execute(
      'id',
      {
        workspace: '/workspace/mcn/terraform',
        contractTag: 'v7.0.3',
        contractCommit: '55151d9bda8ea8f04c595e76ee6b05aee96d7fc7',
        openapiSha256: 'sha256:d17d0e8366d49132d8de12498585725cc77d20390919b359de8c126d3e624993',
        reason: preflight.releasePrerequisite.reason,
      },
      undefined,
      undefined,
      context,
    );
    expect(result).not.toHaveProperty('isError', true);
    expect(result.content[0].text).toContain('KVM prerequisite available');
    expect(result.details.preflight).toEqual(preflight);
    expect(JSON.stringify(result)).not.toMatch(/token|password|signed\.example/i);
  });

  it('returns the actionable typed prerequisite failure without leaking arbitrary errors', async () => {
    const tool = tools(
      runtime({
        preflight: async () => {
          throw new Error('server said secret=do-not-return');
        },
      }),
    ).find((candidate) => candidate.name === 'kvm_smsv2_preflight');
    if (!tool) throw new Error('preflight tool was not registered');
    const result = await tool.execute(
      'id',
      {
        workspace: '/workspace/mcn/terraform',
        contractTag: 'v7.0.3',
        contractCommit: '55151d9bda8ea8f04c595e76ee6b05aee96d7fc7',
        openapiSha256: 'sha256:d17d0e8366d49132d8de12498585725cc77d20390919b359de8c126d3e624993',
        reason: preflight.releasePrerequisite.reason,
      },
      undefined,
      undefined,
      context,
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('do-not-return');
  });
});

describe('kvm_smsv2_plan', () => {
  it('returns an opaque receipt for an inspected zero-Azure saved plan', async () => {
    const tool = tools(runtime()).find((candidate) => candidate.name === 'kvm_smsv2_plan');
    if (!tool) throw new Error('plan tool was not registered');
    const result = await tool.execute(
      'id',
      {
        workspace: '/workspace/mcn/terraform',
        mode: 'apply',
        contractTag: 'v7.0.3',
        contractCommit: '55151d9bda8f04c595e76ee6b05aee96d7fc7',
        openapiSha256: 'sha256:d17d0e8366d49132d8de12498585725cc77d20390919b359de8c126d3e624993',
        reason: preflight.releasePrerequisite.reason,
      },
      undefined,
      undefined,
      context,
    );
    expect(result).not.toHaveProperty('isError', true);
    expect(result.content[0].text).toContain('12 to add, 0 to change, 0 to destroy');
    expect(result.details).toMatchObject({
      planArtifact: 'artifact://kvm-plan',
      planSha256: 'b'.repeat(64),
      azureActions: 0,
    });
    expect(JSON.stringify(result)).not.toContain('/secure/evidence/kvm.tfplan');
  });
});

describe('kvm_smsv2_apply', () => {
  it('returns a redacted receipt for the exact applied saved plan', async () => {
    const tool = tools(runtime()).find((candidate) => candidate.name === 'kvm_smsv2_apply');
    if (!tool) throw new Error('apply tool was not registered');
    const result = await tool.execute(
      'id',
      { planArtifact: 'artifact://kvm-plan', planSha256: 'b'.repeat(64) },
      undefined,
      undefined,
      context,
    );
    expect(result).not.toHaveProperty('isError', true);
    expect(result.content[0].text).toContain('exact saved plan applied');
    expect(result.details).toMatchObject({
      mode: 'apply',
      planSha256: 'b'.repeat(64),
      outputSha256: 'c'.repeat(64),
      outputBytes: 60,
    });
  });
});

describe('kvm_smsv2_drift', () => {
  it('classifies an inspected refresh-aware plan without applying it', async () => {
    const driftPlan = plan();
    driftPlan.savedPlan = { ...driftPlan.savedPlan, add: 0, change: 1 };
    const tool = tools(
      runtime({ drift: async () => ({ planArtifact: 'artifact://kvm-drift', lifecyclePlan: driftPlan }) }),
    ).find((candidate) => candidate.name === 'kvm_smsv2_drift');
    if (!tool) throw new Error('drift tool was not registered');
    const result = await tool.execute(
      'id',
      {
        workspace: '/workspace/mcn/terraform',
        contractTag: 'v7.0.3',
        contractCommit: '55151d9bda8ea8f04c595e76ee6b05aee96d7fc7',
        openapiSha256: 'sha256:d17d0e8366d49132d8de12498585725cc77d20390919b359de8c126d3e624993',
        reason: preflight.releasePrerequisite.reason,
      },
      undefined,
      undefined,
      context,
    );
    expect(result).not.toHaveProperty('isError', true);
    expect(result.content[0].text).toContain('drift detected');
    expect(result.details).toMatchObject({ classification: 'drift', planArtifact: 'artifact://kvm-drift' });
  });
});

describe('kvm_smsv2_status', () => {
  it('returns local runtime, FRR convergence, and bounded traffic evidence', async () => {
    const tool = tools(runtime()).find((candidate) => candidate.name === 'kvm_smsv2_status');
    if (!tool) throw new Error('status tool was not registered');
    const result = await tool.execute(
      'id',
      { workspace: '/workspace/mcn/terraform', trafficUrl: 'https://lb.example.test/health', trafficSamples: 5 },
      undefined,
      undefined,
      context,
    );
    expect(result).not.toHaveProperty('isError', true);
    expect(result.content[0].text).toContain('3/3 domains running');
    expect(result.content[0].text).toContain('3/3 FRR peers established');
    expect(result.content[0].text).toContain('5/5 traffic samples successful');
    expect(JSON.stringify(result)).not.toContain('lb.example.test');
  });
});
