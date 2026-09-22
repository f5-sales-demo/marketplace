import { createHash } from 'node:crypto';
import type { ExtensionAPI } from '@f5-sales-demo/xcsh';

const LOCATION_SKILL = /cloudstatus(?:[:/])location\b/i;
const REGIONAL_EDGE = /\bregional\s+edges?\b/i;
const COLLECTOR =
  /^\s*python3\s+skill:\/\/cloudstatus:network-intelligence\/scripts\/network_lookup\.py\s+(locations\s+--format\s+map-v1|location)\s+"\$CLOUDSTATUS_QUERY"\s*$/;
const COLLECTOR_INTENT = /cloudstatus:network-intelligence\/scripts\/network_lookup\.py\s+locations?\b/;
const CAPABILITIES = ['read', 'task', 'web_search', 'bash', 'render_map'] as const;

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

interface Advisory {
  code: string;
  message: string;
  severity?: 'info' | 'warning';
}

interface AdvisoryApi {
  advisories: {
    register(registration: {
      id: string;
      capabilities: readonly string[];
      match(event: {
        toolCallId: string;
        toolName: string;
        input: Record<string, unknown>;
      }): Advisory | readonly Advisory[] | undefined;
    }): () => void;
    unregister(id: string): boolean;
  };
}

function freshState(active = false): WorkflowState {
  return { active, skillRead: false, collector: undefined, renderToolCallId: undefined };
}

function inputText(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input);
  } catch {
    return '';
  }
}

function warning(code: string, message: string): Advisory {
  return { code, message, severity: 'warning' };
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
    if (crcEnd > png.length || png.readUInt32BE(dataEnd) !== crc32(png.subarray(offset + 4, dataEnd))) return undefined;
    if (!dimensions) {
      if (!type.equals(Buffer.from('IHDR')) || length !== 13) return undefined;
      const width = png.readUInt32BE(offset + 8);
      const height = png.readUInt32BE(offset + 12);
      if (width <= 0 || height <= 0) return undefined;
      dimensions = [width, height];
    } else if (type.equals(Buffer.from('IHDR'))) return undefined;
    else if (type.equals(Buffer.from('IDAT'))) {
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
  details?: unknown;
  isError: boolean;
}): string | undefined {
  if (event.isError) return 'render_map returned an error';
  const images = event.content.filter((block) => block.type === 'image');
  if (images.length !== 1 || images[0].mimeType !== 'image/png')
    return 'render_map did not return exactly one PNG image';
  const png = decodeStrictBase64(images[0].data);
  const dimensions = png ? pngDimensions(png) : undefined;
  if (!png || !dimensions) return 'render_map returned malformed PNG media';
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
  const [width, height] = dimensions;
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

/** Register non-blocking, request-scoped Regional Edge recommendations. */
export default function regionalEdgeAdvisories(pi: ExtensionAPI): void {
  (
    pi as ExtensionAPI & {
      integrations: { register(definition: unknown): unknown };
    }
  ).integrations.register({
    id: 'cloudstatus',
    name: 'Cloudstatus',
    plugin: 'cloudstatus',
    kind: 'on_demand',
    async probe() {
      return { state: 'ready' };
    },
  });

  let state = freshState();
  const api = pi as ExtensionAPI & AdvisoryApi;
  api.advisories.register({
    id: 'cloudstatus.regional-edge',
    capabilities: CAPABILITIES,
    match(event) {
      const text = inputText(event.input);
      if (event.toolName === 'read' && LOCATION_SKILL.test(text)) {
        state.active = true;
        state.skillRead = true;
        return undefined;
      }

      if ((event.toolName === 'task' || event.toolName === 'web_search') && REGIONAL_EDGE.test(text)) {
        state.active = true;
        return warning(
          'cloudstatus.registry_source_recommended',
          'Use cloudstatus:location and its direct registry collector for authoritative Regional Edge evidence.',
        );
      }

      if (event.toolName === 'bash') {
        const command = String(event.input.command ?? '');
        if (!COLLECTOR_INTENT.test(command)) return undefined;
        state.active = true;
        const findings: Advisory[] = [];
        const match = command.match(COLLECTOR);
        if (!state.skillRead) {
          findings.push(
            warning(
              'cloudstatus.skill_read_recommended',
              'Read cloudstatus:location before invoking the registry collector.',
            ),
          );
        }
        if (!match) {
          findings.push(
            warning(
              'cloudstatus.registry_collector_recommended',
              'Use the direct network_lookup.py location collector with the documented argv.',
            ),
          );
          return findings;
        }
        if (state.collector) {
          findings.push(
            warning(
              'cloudstatus.single_collection_recommended',
              'Reuse the first registry collection for this request instead of collecting again.',
            ),
          );
        }
        if (event.input.async === true) {
          findings.push(
            warning(
              'cloudstatus.foreground_collection_recommended',
              'Run the registry collector in the foreground so its result can be correlated with this request.',
            ),
          );
        }
        if (!state.collector) {
          state.collector = {
            kind: match[1].startsWith('locations') ? 'map' : 'factual',
            toolCallId: event.toolCallId,
            status: 'pending',
          };
        }
        return findings.length ? findings : undefined;
      }

      if (event.toolName === 'render_map' && state.active) {
        const findings: Advisory[] = [];
        if (state.collector?.kind !== 'map' || state.collector.status !== 'succeeded') {
          findings.push(
            warning(
              'cloudstatus.map_collector_recommended',
              'Render Regional Edge maps after one successful locations --format map-v1 registry collection.',
            ),
          );
        }
        if (
          state.collector?.status === 'succeeded' &&
          JSON.stringify(event.input.locations) !== JSON.stringify(state.collector.mapLocations)
        ) {
          findings.push(
            warning(
              'cloudstatus.registry_evidence_recommended',
              'Pass the collector map_locations array to render_map unchanged.',
            ),
          );
        }
        if (state.renderToolCallId) {
          findings.push(
            warning('cloudstatus.single_render_recommended', 'Reuse the first Regional Edge map for this request.'),
          );
        }
        state.renderToolCallId ??= event.toolCallId;
        findings.push(
          warning(
            'cloudstatus.map_integrity',
            'Preserve the canonical single-PNG xcsh.media/v1 result and its registry provenance.',
          ),
        );
        return findings;
      }
      return undefined;
    },
  });

  const reset = () => {
    state = freshState();
  };
  pi.on('session_start', reset);
  pi.on('session_switch', reset);
  pi.on('turn_end', reset);
  pi.on('input', (event) => {
    state = freshState(REGIONAL_EDGE.test(event.text));
  });
  pi.on('tool_result', (event) => {
    if (!state.active) return;
    if (
      event.toolName === 'bash' &&
      state.collector?.status === 'pending' &&
      event.toolCallId === state.collector.toolCallId
    ) {
      if (event.isError) {
        state.collector.status = 'failed';
        return;
      }
      const result = collectorResult(event.content, state.collector.kind);
      if (result.reason) {
        state.collector.status = 'failed';
        pi.logger.warn(`Cloudstatus Regional Edge advisory: ${result.reason}`);
        return;
      }
      state.collector.status = 'succeeded';
      state.collector.mapLocations = result.mapLocations;
      return;
    }
    if (event.toolName !== 'render_map' || event.toolCallId !== state.renderToolCallId) return;
    const reason = invalidMapResult(event);
    if (reason) pi.logger.warn(`Cloudstatus Regional Edge advisory: ${reason}`);
  });
}
