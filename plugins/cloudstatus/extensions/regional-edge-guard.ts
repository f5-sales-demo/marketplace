import { createHash } from 'node:crypto';
import type { ExtensionAPI } from '@f5-sales-demo/xcsh';

const LOCATION_SKILL = /cloudstatus(?:[:/])location\b/i;
const REGIONAL_EDGE = /\bregional\s+edges?\b/i;
const COLLECTOR =
  /^\s*python3\s+skill:\/\/cloudstatus:network-intelligence\/scripts\/network_lookup\.py\s+(locations\s+--format\s+map-v1|location)\s+"\$CLOUDSTATUS_QUERY"\s*$/;

type WorkflowState = {
  active: boolean;
  skillRead: boolean;
  collector: 'map' | 'factual' | undefined;
  rendered: boolean;
};

function freshState(): WorkflowState {
  return { active: false, skillRead: false, collector: undefined, rendered: false };
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
  if (!png || png.length < 24 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'render_map returned malformed PNG media';
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width <= 0 || height <= 0) return 'render_map returned invalid PNG dimensions';
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
    content: [
      { type: 'text' as const, text: `Cloudstatus Regional Edge guard: ${reason}; a second render is not permitted.` },
    ],
  };
}

/**
 * Enforce the Regional Edge registry-only workflow at the tool boundary.
 *
 * This deliberately activates only for the location skill or an attempted task/search
 * containing Regional Edge language, so ordinary network-intelligence work is unaffected.
 */
export default function regionalEdgeGuard(pi: ExtensionAPI): void {
  let state = freshState();

  pi.on('session_start', () => {
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
      state.collector = match[1].startsWith('locations') ? 'map' : 'factual';
      return undefined;
    }

    if (event.toolName === 'render_map') {
      if (state.collector !== 'map')
        return blocked('render_map requires locations --format map-v1, not a factual location call');
      if (state.rendered) return blocked('render_map may run exactly once per request');
      state.rendered = true;
    }

    return undefined;
  });

  pi.on('tool_result', (event) => {
    if (!state.active || event.toolName !== 'render_map') return undefined;
    if (state.collector !== 'map' || !state.rendered) return failedResult('unexpected render_map result');
    const reason = invalidMapResult(event);
    return reason ? failedResult(reason) : undefined;
  });
}
