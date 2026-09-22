import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import regionalEdgeGuard from '../../extensions/regional-edge-guard';

type ToolCallHandler = (event: { toolCallId: string; toolName: string; input: Record<string, unknown> }) => unknown;
type ToolResultHandler = (event: {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  content: Array<Record<string, unknown>>;
  details?: unknown;
  isError: boolean;
}) => unknown;
type SessionStartHandler = () => unknown;
type BeforeAgentStartHandler = () => unknown;
type TurnStartHandler = () => unknown;

function guard() {
  let toolCall: ToolCallHandler | undefined;
  let toolResult: ToolResultHandler | undefined;
  let sessionStart: SessionStartHandler | undefined;
  let beforeAgentStart: BeforeAgentStartHandler | undefined;
  let turnStart: TurnStartHandler | undefined;
  let nextToolCall = 0;
  regionalEdgeGuard({
    integrations: { register() {} },
    on(event: string, handler: ToolCallHandler | ToolResultHandler | SessionStartHandler) {
      if (event === 'tool_call') toolCall = handler as ToolCallHandler;
      if (event === 'tool_result') toolResult = handler as ToolResultHandler;
      if (event === 'session_start') sessionStart = handler as SessionStartHandler;
      if (event === 'before_agent_start') beforeAgentStart = handler as BeforeAgentStartHandler;
      if (event === 'turn_start') turnStart = handler as TurnStartHandler;
    },
  } as Parameters<typeof regionalEdgeGuard>[0]);
  function call(toolName: string, input: Record<string, unknown> = {}, toolCallId?: string) {
    nextToolCall += 1;
    return toolCall?.({ toolCallId: toolCallId ?? `call-${nextToolCall}`, toolName, input });
  }
  return {
    call,
    result: (event: Parameters<ToolResultHandler>[0]) => toolResult?.(event),
    reset: () => sessionStart?.(),
    startRequest: () => beforeAgentStart?.(),
    startTurn: () => turnStart?.(),
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
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==',
  'base64',
);
const mapLocations = [
  {
    id: 'edge-example',
    label: 'Example Regional Edge',
    latitude: 45,
    longitude: -75,
    precision: 'metro',
    sources: [
      {
        url: 'https://example.test/location',
        sourceName: 'Fixture registry',
        observedAt: '2026-09-22T12:00:00Z',
        claim: 'Fixtureville is the representative metro point.',
      },
    ],
  },
];
const mapInput = { title: 'Current F5 Regional Edges', locations: mapLocations };
const hydrationPlaceholder = [{ label: 'Cloudstatus evidence hydration', longitude: 0, latitude: 0 }];

function collectorResult(
  toolCallId: string,
  input: Record<string, unknown>,
  output: unknown,
  overrides: Partial<Parameters<ToolResultHandler>[0]> = {},
) {
  return {
    toolCallId,
    toolName: 'bash',
    input,
    content: [{ type: 'text', text: JSON.stringify(output) }],
    details: { execution: { exitCode: 0, failed: false } },
    isError: false,
    ...overrides,
  };
}

function mapCollectorResult(overrides: Partial<Parameters<ToolResultHandler>[0]> = {}) {
  return collectorResult(
    'map-collector',
    mapCollector,
    {
      schema: 'cloudstatus.locations/v1',
      observed_at: '2026-09-22T12:00:00Z',
      query: 'Example',
      status: 'complete',
      map_locations: mapLocations,
      unresolved_locations: [],
      evidence: [],
      sources: [],
      inferences: [],
      errors: [],
    },
    overrides,
  );
}

function factualCollectorResult() {
  return collectorResult('factual-collector', factualCollector, {
    operation: 'location',
    query: 'Example',
    observed_at: '2026-09-22T12:00:00Z',
    status: 'complete',
    facts: {},
    inferences: [],
    sources: [],
    errors: [],
  });
}

function mapResult(overrides: Record<string, unknown> = {}, image = png) {
  const sha256 = createHash('sha256').update(image).digest('hex');
  return {
    toolCallId: 'render-call',
    toolName: 'render_map',
    input: { locations: [] },
    content: [{ type: 'image', mimeType: 'image/png', data: image.toString('base64') }],
    details: {
      mediaResult: 'xcsh.media/v1',
      descriptor: {
        version: 1,
        kind: 'image',
        width: 1,
        height: 1,
        original: { ref: `blob:sha256:${sha256}`, mimeType: 'image/png', bytes: image.length },
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
    expect(runtime.call('bash', mapCollector, 'map-collector')).toBeUndefined();
    expect(runtime.result(mapCollectorResult())).toBeUndefined();
    const placeholder = { title: mapInput.title, locations: hydrationPlaceholder };
    expect(runtime.call('render_map', placeholder, 'render-call')).toBeUndefined();
    expect(placeholder.locations).toEqual(mapLocations);
    expect(runtime.result(mapResult())).toBeUndefined();
  });

  it('marks errored, image-less, and non-canonical map results as failed without allowing a retry', () => {
    const corruptCrc = Buffer.from(png);
    corruptCrc[corruptCrc.length - 1] ^= 1;
    for (const invalid of [
      mapResult({ isError: true }),
      mapResult({ content: [{ type: 'text', text: 'fallback' }] }),
      mapResult({ details: undefined }),
      mapResult({}, corruptCrc),
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
      runtime.call('bash', mapCollector, 'map-collector');
      runtime.result(mapCollectorResult());
      runtime.call('render_map', { locations: hydrationPlaceholder }, 'render-call');
      expect(runtime.result(invalid)).toMatchObject({ isError: true });
      expect(runtime.call('render_map', { locations: [] })).toMatchObject({ block: true });
    }
  });

  it('allows a factual collector but never a map', () => {
    const runtime = guard();
    runtime.call('read', locationSkill);
    expect(runtime.call('bash', factualCollector, 'factual-collector')).toBeUndefined();
    expect(runtime.result(factualCollectorResult())).toBeUndefined();
    expect(runtime.call('render_map', { locations: hydrationPlaceholder })).toMatchObject({ block: true });
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
      ['bash', { ...mapCollector, async: true }],
    ] as const) {
      expect(runtime.call(toolName, input)).toMatchObject({ block: true });
    }
  });

  it('blocks duplicate collection plus premature and duplicate rendering', () => {
    const runtime = guard();
    runtime.call('read', locationSkill);
    expect(runtime.call('render_map', { locations: hydrationPlaceholder })).toMatchObject({ block: true });
    expect(runtime.call('bash', mapCollector, 'map-collector')).toBeUndefined();
    expect(runtime.call('bash', mapCollector, 'duplicate-collector')).toMatchObject({ block: true });
    expect(runtime.result(mapCollectorResult())).toBeUndefined();
    expect(runtime.call('render_map', { locations: hydrationPlaceholder }, 'render-call')).toBeUndefined();
    expect(runtime.call('render_map', { ...mapInput, locations: [] })).toMatchObject({ block: true });
  });

  it('resets for each top-level request but not between turns', () => {
    const runtime = guard();
    runtime.startRequest();
    runtime.call('read', locationSkill);
    runtime.call('bash', factualCollector, 'factual-collector');
    runtime.startTurn();
    expect(runtime.call('bash', factualCollector)).toMatchObject({ block: true });
    runtime.startRequest();
    expect(runtime.call('task', { prompt: 'Investigate BGP paths for AS35280' })).toBeUndefined();
    expect(runtime.call('bash', { command: 'git status -sb' })).toBeUndefined();
  });

  it('resets for a new session', () => {
    const runtime = guard();
    runtime.call('read', locationSkill);
    runtime.call('bash', factualCollector, 'factual-collector');
    runtime.reset();
    expect(runtime.call('bash', factualCollector)).toBeUndefined();
  });

  it('does not authorize rendering after a failed or mismatched collector result', () => {
    const runtime = guard();
    runtime.call('read', locationSkill);
    runtime.call('bash', mapCollector, 'map-collector');
    expect(runtime.result(mapCollectorResult({ toolCallId: 'stale-collector' }))).toBeUndefined();
    expect(runtime.call('render_map', { locations: hydrationPlaceholder })).toMatchObject({ block: true });
    expect(
      runtime.result(
        mapCollectorResult({
          isError: true,
          content: [{ type: 'text', text: 'Command exited with code 1' }],
        }),
      ),
    ).toBeUndefined();
    expect(runtime.call('render_map', { locations: [] })).toMatchObject({ block: true });
  });

  it('rejects malformed collector output and altered map evidence', () => {
    const malformed = guard();
    malformed.call('read', locationSkill);
    malformed.call('bash', mapCollector, 'map-collector');
    expect(malformed.result(mapCollectorResult({ content: [{ type: 'text', text: 'not json' }] }))).toMatchObject({
      isError: true,
    });
    expect(malformed.call('render_map', { locations: hydrationPlaceholder })).toMatchObject({ block: true });

    const altered = guard();
    altered.call('read', locationSkill);
    altered.call('bash', mapCollector, 'map-collector');
    altered.result(mapCollectorResult());
    expect(altered.call('render_map', mapInput)).toMatchObject({ block: true });
  });

  it('rejects invalid coordinates and does not render an empty resolved set', () => {
    const invalid = guard();
    invalid.call('read', locationSkill);
    invalid.call('bash', mapCollector, 'map-collector');
    expect(
      invalid.result(
        collectorResult('map-collector', mapCollector, {
          schema: 'cloudstatus.locations/v1',
          observed_at: '2026-09-22T12:00:00Z',
          query: 'Example',
          status: 'complete',
          map_locations: [{ ...mapLocations[0], longitude: 181 }],
          unresolved_locations: [],
          evidence: [],
          sources: [],
          inferences: [],
          errors: [],
        }),
      ),
    ).toMatchObject({ isError: true });

    const empty = guard();
    empty.call('read', locationSkill);
    empty.call('bash', mapCollector, 'map-collector');
    expect(
      empty.result(
        collectorResult('map-collector', mapCollector, {
          schema: 'cloudstatus.locations/v1',
          observed_at: '2026-09-22T12:00:00Z',
          query: 'Unknown',
          status: 'complete',
          map_locations: [],
          unresolved_locations: [{ id: 'unknown', label: 'Unknown', sources: [] }],
          evidence: [],
          sources: [],
          inferences: [],
          errors: [],
        }),
      ),
    ).toBeUndefined();
    expect(empty.call('render_map', { locations: hydrationPlaceholder })).toMatchObject({ block: true });
  });
});
