import { createHash } from 'node:crypto';
import type { ExtensionAPI } from '@f5-sales-demo/xcsh';

const LOCATION_SKILL = /cloudstatus(?:[:/])location\b/i;
const REGIONAL_EDGE = /\bregional\s+edges?\b/i;
const COLLECTOR =
  /^\s*python3\s+skill:\/\/cloudstatus:network-intelligence\/scripts\/network_lookup\.py\s+(locations\s+--format\s+map-v1|location)\s+"\$CLOUDSTATUS_QUERY"\s*$/;
const RENDER_PLACEHOLDER = [
  {
    label: 'Cloudstatus evidence hydration',
    longitude: 0,
    latitude: 0,
  },
] as const;

type WorkflowState = {
  active: boolean;
  skillRead: boolean;
  collector:
    | {
        kind: 'map' | 'factual';
        toolCallId: string;
        status: 'pending' | 'succeeded' | 'failed';
        mapLocations?: unknown[];
      }
    | undefined;
  renderToolCallId: string | undefined;
};

function freshState(): WorkflowState {
  return { active: false, skillRead: false, collector: undefined, renderToolCallId: undefined };
}

function inputText(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input);
  } catch {
    return '';
  }
}

function blocked(reason: string) {
  return { block: true, reason: `Cloudstatus Regional Edge guard: ${reason}` };
}

function decodeStrictBase64(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) return undefined;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return undefined;
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value ? decoded : undefined;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(png: Buffer): [number, number] | undefined {
  if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return undefined;
  let offset = 8;
  let dimensions: [number, number] | undefined;
  let sawIdat = false;
  let sawIend = false;
  while (offset < png.length) {
    if (png.length - offset < 12) return undefined;
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8);
    const dataEnd = offset + 8 + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > png.length || png.readUInt32BE(dataEnd) !== crc32(png.subarray(offset + 4, dataEnd))) {
      return undefined;
    }
    if (!dimensions) {
      if (!type.equals(Buffer.from('IHDR')) || length !== 13) return undefined;
      const width = png.readUInt32BE(offset + 8);
      const height = png.readUInt32BE(offset + 12);
      if (width <= 0 || height <= 0) return undefined;
      dimensions = [width, height];
    } else if (type.equals(Buffer.from('IHDR'))) {
      return undefined;
    } else if (type.equals(Buffer.from('IDAT'))) {
      if (sawIend) return undefined;
      sawIdat = true;
    } else if (type.equals(Buffer.from('IEND'))) {
      if (length !== 0 || !sawIdat || crcEnd !== png.length) return undefined;
      sawIend = true;
    }
    offset = crcEnd;
  }
  return dimensions && sawIdat && sawIend ? dimensions : undefined;
}

function invalidMapResult(event: {
  content: Array<{ type: string; mimeType?: string; data?: string }>;
  details: unknown;
  isError: boolean;
}): string | undefined {
  if (event.isError) return 'render_map returned an error';
  const images = event.content.filter((block) => block.type === 'image');
  if (images.length !== 1 || images[0].mimeType !== 'image/png')
    return 'render_map did not return exactly one PNG image';
  const png = decodeStrictBase64(images[0].data);
  const dimensions = png ? pngDimensions(png) : undefined;
  if (!png || !dimensions) return 'render_map returned malformed PNG media';
  const [width, height] = dimensions;
  if (!event.details || typeof event.details !== 'object') return 'render_map omitted canonical media details';
  const details = event.details as Record<string, unknown>;
  const descriptor = details.descriptor;
  if (details.mediaResult !== 'xcsh.media/v1' || !descriptor || typeof descriptor !== 'object') {
    return 'render_map omitted the canonical xcsh.media/v1 descriptor';
  }
  const media = descriptor as Record<string, unknown>;
  const original = media.original as Record<string, unknown> | undefined;
  const provenance = media.provenance as Record<string, unknown> | undefined;
  const metadata = media.metadata as Record<string, unknown> | undefined;
  const digest = createHash('sha256').update(png).digest('hex');
  if (
    media.version !== 1 ||
    media.kind !== 'image' ||
    media.width !== width ||
    media.height !== height ||
    original?.mimeType !== 'image/png' ||
    original?.bytes !== png.length ||
    original?.ref !== `blob:sha256:${digest}` ||
    provenance?.sourceType !== 'tool' ||
    provenance?.source !== 'render_map' ||
    metadata?.producer !== 'render_map' ||
    details.displayMethod !== 'inline'
  ) {
    return 'render_map returned malformed canonical media metadata';
  }
  return undefined;
}

function failedResult(reason: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `Cloudstatus Regional Edge guard: ${reason}` }],
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function validMapLocation(value: unknown): boolean {
  const location = record(value);
  if (!location || typeof location.id !== 'string' || typeof location.label !== 'string') return false;
  const longitude = location.longitude;
  const latitude = location.latitude;
  return (
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Array.isArray(location.sources)
  );
}

function isRenderPlaceholder(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 1) return false;
  const placeholder = record(value[0]);
  return (
    placeholder?.label === RENDER_PLACEHOLDER[0].label &&
    placeholder.longitude === RENDER_PLACEHOLDER[0].longitude &&
    placeholder.latitude === RENDER_PLACEHOLDER[0].latitude
  );
}

function collectorResult(
  content: Array<{ type: string; text?: string }>,
  kind: 'map' | 'factual',
): { mapLocations?: unknown[]; reason?: string } {
  if (content.length !== 1 || content[0]?.type !== 'text' || typeof content[0].text !== 'string') {
    return { reason: 'registry collector did not return exactly one JSON text result' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content[0].text);
  } catch {
    return { reason: 'registry collector returned malformed JSON' };
  }
  const payload = record(parsed);
  if (!payload || (payload.status !== 'complete' && payload.status !== 'partial')) {
    return { reason: 'registry collector returned an unavailable or invalid evidence status' };
  }
  for (const field of ['sources', 'inferences', 'errors']) {
    if (!Array.isArray(payload[field])) return { reason: `registry collector omitted the ${field} evidence array` };
  }
  if (typeof payload.observed_at !== 'string' || typeof payload.query !== 'string') {
    return { reason: 'registry collector omitted its query or observation timestamp' };
  }
  if (kind === 'map') {
    if (payload.schema !== 'cloudstatus.locations/v1' || !Array.isArray(payload.map_locations)) {
      return { reason: 'registry collector returned an invalid cloudstatus.locations/v1 envelope' };
    }
    if (
      !Array.isArray(payload.evidence) ||
      !Array.isArray(payload.unresolved_locations) ||
      !payload.map_locations.every(validMapLocation)
    ) {
      return { reason: 'registry collector returned invalid renderable or unresolved location evidence' };
    }
    return { mapLocations: payload.map_locations };
  }
  if (payload.operation !== 'location' || !record(payload.facts)) {
    return { reason: 'registry collector returned an invalid factual location envelope' };
  }
  return {};
}

/**
 * Enforce the Regional Edge registry-only workflow at the tool boundary.
 *
 * This deliberately activates only for the location skill or an attempted task/search
 * containing Regional Edge language, so ordinary network-intelligence work is unaffected.
 */
export default function regionalEdgeGuard(pi: ExtensionAPI): void {
  (
    pi as ExtensionAPI & {
      integrations: { register<_T>(definition: unknown): unknown };
    }
  ).integrations.register({
    id: 'cloudstatus',
    name: 'Cloudstatus',
    plugin: 'cloudstatus',
    kind: 'on_demand',
    async probe() {
      // Deliberately performs no network or location discovery. Commands probe only when invoked.
      return { state: 'ready' };
    },
  });
  let state = freshState();

  pi.on('session_start', () => {
    state = freshState();
  });

  // A submitted top-level prompt starts a new request. Turns and internal
  // continuation loops within that request retain the same guard state.
  pi.on('before_agent_start', () => {
    state = freshState();
  });

  pi.on('tool_call', (event) => {
    const text = inputText(event.input);
    if (event.toolName === 'read' && LOCATION_SKILL.test(text)) {
      state.active = true;
      state.skillRead = true;
      return undefined;
    }

    if ((event.toolName === 'task' || event.toolName === 'web_search') && REGIONAL_EDGE.test(text)) {
      state.active = true;
      return blocked('use cloudstatus:location and its direct registry collector; do not delegate or search');
    }

    if (!state.active) return undefined;

    if (event.toolName === 'task' || event.toolName === 'web_search' || event.toolName === 'display_media') {
      return blocked('this workflow does not permit delegation, web search, or display media');
    }

    if (event.toolName === 'bash') {
      const command = String(event.input.command ?? '');
      const match = command.match(COLLECTOR);
      if (!state.skillRead) return blocked('read cloudstatus:location before invoking the registry collector');
      if (!match) return blocked('only the direct network_lookup.py registry collector is allowed');
      if (state.collector) return blocked('the registry collector may run exactly once per request');
      if (event.input.async === true) return blocked('the registry collector must run in the foreground');
      state.collector = {
        kind: match[1].startsWith('locations') ? 'map' : 'factual',
        toolCallId: event.toolCallId,
        status: 'pending',
      };
      return undefined;
    }

    if (event.toolName === 'render_map') {
      if (state.collector?.kind !== 'map')
        return blocked('render_map requires a successful locations --format map-v1 collector result');
      if (state.collector.status !== 'succeeded')
        return blocked('render_map requires the successful registry collector result');
      if (state.renderToolCallId) return blocked('render_map may run exactly once per request');
      if (!isRenderPlaceholder(event.input.locations)) {
        return blocked('render_map must use the Cloudstatus evidence hydration placeholder');
      }
      if (!state.collector.mapLocations?.length) {
        return blocked('the registry collector returned no coordinate-complete locations to render');
      }
      // xcsh passes this same arguments object from the pre-call hook into the
      // renderer. Hydrate it here so the model never reconstructs evidence.
      event.input.locations = state.collector.mapLocations;
      state.renderToolCallId = event.toolCallId;
    }

    return undefined;
  });

  pi.on('tool_result', (event) => {
    if (!state.active) return undefined;
    if (
      event.toolName === 'bash' &&
      state.collector?.status === 'pending' &&
      event.toolCallId === state.collector.toolCallId
    ) {
      if (event.isError) {
        state.collector.status = 'failed';
        return undefined;
      }
      const result = collectorResult(event.content, state.collector.kind);
      if (result.reason) {
        state.collector.status = 'failed';
        return failedResult(result.reason);
      }
      state.collector.status = 'succeeded';
      state.collector.mapLocations = result.mapLocations;
      return undefined;
    }
    if (event.toolName !== 'render_map' || event.toolCallId !== state.renderToolCallId) return undefined;
    if (state.collector?.kind !== 'map' || state.collector.status !== 'succeeded') {
      return failedResult('unexpected render_map result; a second render is not permitted');
    }
    const reason = invalidMapResult(event);
    return reason ? failedResult(`${reason}; a second render is not permitted`) : undefined;
  });
}
