interface ExtensionApi {
  integrations: { register<_T>(definition: unknown): unknown };
  typebox: {
    Type: { Object(shape: Record<string, unknown>): unknown; String(): unknown; Optional(schema: unknown): unknown };
  };
  registerTool(definition: unknown): void;
}
export type Action = 'status' | 'leave' | 'stop-share' | 'audio' | 'video' | 'share' | 'awareness' | 'join';
const UAT_SESSION = 'desktop';
type AccessibilityItem = { name?: string; role?: string; pid?: number };
type WindowItem = { id?: number; pid?: number; title?: string };
export function deriveAwareness(items: AccessibilityItem[], windows: WindowItem[]) {
  const labels = items.map((item) => (item.name ?? '').trim().toLowerCase()).filter(Boolean);
  const has = (...needles: string[]) => needles.some((needle) => labels.some((label) => label.includes(needle)));
  const meeting = has('you are screen sharing', 'stop share', 'stop sharing')
    ? 'sharing'
    : has('waiting room', 'host will let you in', 'please wait for the host')
      ? 'waiting_room'
      : has('join with video', 'video preview', 'preview your video')
        ? 'prejoin'
        : has('participants', 'reactions') && has('mute', 'unmute')
          ? 'in_meeting'
          : has('join a meeting', 'sign into a different account')
            ? 'signed_out'
            : has('new meeting', 'schedule', 'share screen')
              ? 'home'
              : 'unknown';
  return {
    version: 1,
    meeting,
    audio: has('unmute') ? 'muted' : has('mute') ? 'unmuted' : 'unknown',
    video: has('start video') ? 'off' : has('stop video') ? 'on' : 'unknown',
    share: has('stop share', 'stop sharing')
      ? 'on'
      : meeting === 'in_meeting' && has('share screen')
        ? 'off'
        : 'unknown',
    hand: has('lower hand') ? 'raised' : has('raise hand') ? 'lowered' : 'unknown',
    zoom_windows: windows.filter((window) => /zoom|meeting/i.test(window.title ?? '')),
    source: ['AT-SPI', 'EWMH'],
  };
}
const actions: readonly Action[] = ['status', 'leave', 'stop-share', 'audio', 'video', 'share', 'awareness'];
export const isInvitation = (value: string) => /^https:\/\/[^\s]+$/i.test(value);
export const canonicalMeetingId = (value: string) => {
  if (!/^\d[\d\s-]*$/.test(value)) throw new Error('meeting ID must contain digits, spaces, or hyphens only');
  const id = value.replace(/[^\d]/g, '');
  if (id.length < 9 || id.length > 16) throw new Error('meeting ID must contain 9 to 16 digits');
  return id;
};
export const invitationToZoomMtg = (value: string) => {
  const invitation = new URL(value);
  const meeting = invitation.pathname.match(/^\/j\/(\d[\d-]*)/);
  if (!meeting) throw new Error('invitation URL must contain a Zoom /j/<meeting-id> path');
  const query = new URLSearchParams({ action: 'join', confno: canonicalMeetingId(meeting[1]) });
  for (const [key, item] of invitation.searchParams) {
    if (key !== 'action' && key !== 'confno') query.append(key, item);
  }
  return `zoommtg://${invitation.host}/join?${query.toString()}`;
};
export function parseZoomCommand(value: string): { action: Action; args: string[] } {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error('meeting ID or Zoom action is required');
  const [first, ...rest] = words;
  return actions.includes(first as Action) ? { action: first as Action, args: rest } : { action: 'join', args: words };
}
export function parseZoomToolInput(input: {
  command?: string;
  action?: string;
  invitation_url?: string;
  url?: string;
  meeting_id?: string;
}): { action: Action; args: string[] } {
  const invitation = input.invitation_url ?? input.url;
  if (invitation) return { action: 'join', args: [invitation] };
  if (input.meeting_id) return { action: 'join', args: [input.meeting_id] };
  if (input.command) return parseZoomCommand(input.command);
  if (input.action && actions.includes(input.action as Action)) return { action: input.action as Action, args: [] };
  throw new Error('command, invitation_url, url, or meeting_id is required');
}
const publicXorgCall = (command: string, action: string | undefined, params: Record<string, unknown>) => {
  const result = Bun.spawnSync([
    'xorgctl',
    '--session',
    UAT_SESSION,
    '--json',
    command,
    ...(action ? [action] : []),
    '--params',
    JSON.stringify(params),
  ]);
  return {
    exitCode: result.exitCode,
    output: new TextDecoder().decode(result.stdout),
    error: new TextDecoder().decode(result.stderr),
  };
};
/** Zoom owns semantics; Xorg receives only its documented generic JSON calls. */
export const call = (action: Action, args: string[]) => {
  if (action === 'join') {
    const target = args.join(' ');
    const joinTarget = isInvitation(target)
      ? invitationToZoomMtg(target)
      : `zoommtg://zoom.us/join?action=join&confno=${canonicalMeetingId(target)}`;
    return publicXorgCall('app', 'launch', { argv: ['zoom', joinTarget] });
  }
  if (action === 'status' || action === 'awareness') {
    const accessibility = publicXorgCall('inspect', 'accessibility', {});
    const windowList = publicXorgCall('window', 'list', {});
    if (accessibility.exitCode || windowList.exitCode) return { accessibility, windowList };
    try {
      const accessibilityEnvelope = JSON.parse(accessibility.output) as { result?: { items?: AccessibilityItem[] } };
      const windowEnvelope = JSON.parse(windowList.output) as { result?: { windows?: WindowItem[] } };
      return {
        exitCode: 0,
        awareness: deriveAwareness(accessibilityEnvelope.result?.items ?? [], windowEnvelope.result?.windows ?? []),
        evidence: { accessibility: accessibilityEnvelope.result, windows: windowEnvelope.result },
      };
    } catch {
      return { exitCode: 1, error: 'invalid_xorg_observation', accessibility, windowList };
    }
  }
  const shortcuts: Record<string, string> = {
    leave: 'ALT+Q',
    'stop-share': 'ALT+SHIFT+S',
    audio: 'ALT+A',
    video: 'ALT+V',
    share: 'ALT+SHIFT+S',
  };
  return publicXorgCall('input', 'batch', { steps: [{ action: 'key', key: shortcuts[action] }] });
};
export default function zoomIntegration(pi: ExtensionApi) {
  pi.integrations.register({
    id: 'zoom',
    name: 'Zoom Workplace',
    plugin: 'zoom',
    kind: 'local',
    setup: {
      pluginDependencies: ['xorg'],
      requiredEnvironment: [],
      profileFields: [],
      steps: [{ kind: 'install', argv: ['zoom', '--version'], timeoutMs: 30000 }],
      verification: [{ argv: ['xorgctl', '--version'], timeoutMs: 30000 }],
    },
    async probe() {
      return Bun.spawnSync(['zoom', '--version']).exitCode === 0
        ? { state: 'ready' }
        : { state: 'setup_required', reason: 'zoom_missing' };
    },
  });
  pi.registerTool({
    name: 'zoom_meeting',
    label: 'Zoom meeting',
    description:
      'Deterministic Zoom controller for the owned desktop UAT session. Progression: preflight virtual media, join invitation, inspect/accessibility plus EWMH verification, then one semantic control at a time. Uses only public xorgctl JSON and never uses physical media.',
    parameters: pi.typebox.Type.Object({
      command: pi.typebox.Type.Optional(pi.typebox.Type.String()),
      action: pi.typebox.Type.Optional(pi.typebox.Type.String()),
      invitation_url: pi.typebox.Type.Optional(pi.typebox.Type.String()),
      url: pi.typebox.Type.Optional(pi.typebox.Type.String()),
      meeting_id: pi.typebox.Type.Optional(pi.typebox.Type.String()),
    }),
    async execute(
      _toolCallId: string,
      input: { command?: string; action?: string; invitation_url?: string; url?: string; meeting_id?: string },
    ) {
      const parsed = parseZoomToolInput(input);
      const details = call(parsed.action, parsed.args);
      return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
    },
  });
}
