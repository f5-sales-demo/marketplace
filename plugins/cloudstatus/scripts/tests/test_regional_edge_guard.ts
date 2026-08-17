import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import regionalEdgeGuard from '../../extensions/regional-edge-guard';

type ToolCallHandler = (event: { toolName: string; input: Record<string, unknown> }) => unknown;
type ToolResultHandler = (event: {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  content: Array<Record<string, unknown>>;
  details?: unknown;
  isError: boolean;
}) => unknown;
type SessionStartHandler = () => unknown;

function guard() {
  let toolCall: ToolCallHandler | undefined;
  let toolResult: ToolResultHandler | undefined;
  let sessionStart: SessionStartHandler | undefined;
  regionalEdgeGuard({
    on(event: string, handler: ToolCallHandler | ToolResultHandler | SessionStartHandler) {
      if (event === 'tool_call') toolCall = handler as ToolCallHandler;
      if (event === 'tool_result') toolResult = handler as ToolResultHandler;
      if (event === 'session_start') sessionStart = handler as SessionStartHandler;
    },
  } as Parameters<typeof regionalEdgeGuard>[0]);
  return {
    call: (toolName: string, input: Record<string, unknown> = {}) => toolCall?.({ toolName, input }),
    result: (event: Parameters<ToolResultHandler>[0]) => toolResult?.(event),
    reset: () => sessionStart?.(),
  };
}

const locationSkill = { path: 'skill://cloudstatus/location/SKILL.md' };
const mapCollector = {
  command:
    'python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"',
};
const factualCollector = {
  command: 'python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py location "$CLOUDSTATUS_QUERY"',
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/P9mW6QAAAABJRU5ErkJggg==',
  'base64',
);

function mapResult(overrides: Record<string, unknown> = {}) {
  const sha256 = createHash('sha256').update(png).digest('hex');
  return {
    toolCallId: 'render-call',
    toolName: 'render_map',
    input: { locations: [] },
    content: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }],
    details: {
      mediaResult: 'xcsh.media/v1',
      descriptor: {
        version: 1,
        kind: 'image',
        width: 1,
        height: 1,
        original: { ref: `blob:sha256:${sha256}`, mimeType: 'image/png', bytes: png.length },
        provenance: { sourceType: 'tool', source: 'render_map' },
        metadata: { producer: 'render_map', basemap: 'schematic' },
      },
      displayMethod: 'inline',
    },
    isError: false,
    ...overrides,
  };
}

describe('Cloudstatus Regional Edge guard', () => {
  it('allows the one direct visual collector followed by one map', () => {
    const runtime = guard();
    expect(runtime.call('read', locationSkill)).toBeUndefined();
    expect(runtime.call('bash', mapCollector)).toBeUndefined();
    expect(runtime.call('render_map', { locations: [] })).toBeUndefined();
    expect(runtime.result(mapResult())).toBeUndefined();
  });

  it('marks errored, image-less, and non-canonical map results as failed without allowing a retry', () => {
    for (const invalid of [
      mapResult({ isError: true }),
      mapResult({ content: [{ type: 'text', text: 'fallback' }] }),
      mapResult({ details: undefined }),
      mapResult({
        details: {
          ...mapResult().details,
          descriptor: {
            ...(mapResult().details as ReturnType<typeof mapResult>['details']).descriptor,
            provenance: { sourceType: 'model', source: 'render_map' },
          },
        },
      }),
    ]) {
      const runtime = guard();
      runtime.call('read', locationSkill);
      runtime.call('bash', mapCollector);
      runtime.call('render_map', { locations: [] });
      expect(runtime.result(invalid)).toMatchObject({ isError: true });
      expect(runtime.call('render_map', { locations: [] })).toMatchObject({ block: true });
    }
  });

  it('allows a factual collector but never a map', () => {
    const runtime = guard();
    runtime.call('read', locationSkill);
    expect(runtime.call('bash', factualCollector)).toBeUndefined();
    expect(runtime.call('render_map', { locations: [] })).toMatchObject({ block: true });
  });

  it('blocks delegation and search when Regional Edge text appears before the skill', () => {
    const runtime = guard();
    expect(runtime.call('task', { prompt: 'research F5 Regional Edge addresses' })).toMatchObject({ block: true });
    expect(runtime.call('web_search', { query: 'F5 Regional Edge locations' })).toMatchObject({ block: true });
  });

  it('blocks forbidden tools and arbitrary Bash after the location skill', () => {
    const runtime = guard();
    runtime.call('read', locationSkill);
    for (const [toolName, input] of [
      ['task', { prompt: 'delegate' }],
      ['web_search', { query: 'edge' }],
      ['display_media', {}],
      ['bash', { command: 'curl https://example.test' }],
    ] as const) {
      expect(runtime.call(toolName, input)).toMatchObject({ block: true });
    }
  });

  it('blocks duplicate collection plus premature and duplicate rendering', () => {
    const runtime = guard();
    runtime.call('read', locationSkill);
    expect(runtime.call('render_map', { locations: [] })).toMatchObject({ block: true });
    expect(runtime.call('bash', mapCollector)).toBeUndefined();
    expect(runtime.call('bash', mapCollector)).toMatchObject({ block: true });
    expect(runtime.call('render_map', { locations: [] })).toBeUndefined();
    expect(runtime.call('render_map', { locations: [] })).toMatchObject({ block: true });
  });

  it('resets for each top-level session and preserves ordinary network-intelligence delegation', () => {
    const runtime = guard();
    runtime.call('read', locationSkill);
    runtime.call('bash', factualCollector);
    expect(runtime.call('bash', factualCollector)).toMatchObject({ block: true });
    runtime.reset();
    expect(runtime.call('task', { prompt: 'Investigate BGP paths for AS35280' })).toBeUndefined();
    expect(runtime.call('bash', factualCollector)).toBeUndefined();
  });
});
