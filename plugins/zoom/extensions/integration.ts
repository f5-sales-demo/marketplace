interface ExtensionApi {
  integrations: { register<_T>(definition: unknown): unknown };
  tools?: { register<_T>(definition: unknown): unknown };
}
export type Action = 'status' | 'leave' | 'stop-share' | 'audio' | 'video' | 'share' | 'awareness' | 'join';
const actions: readonly Action[] = ['status', 'leave', 'stop-share', 'audio', 'video', 'share', 'awareness'];
export const redact = (value: string) => value.replace(/https:\/\/[^\s"']+/g, '[redacted-invitation]');
export const isInvitation = (value: string) => /^https:\/\/[^\s]+$/i.test(value);
export const canonicalMeetingId = (value: string) => {
  if (!/^\d[\d\s-]*$/.test(value)) throw new Error('meeting ID must contain digits, spaces, or hyphens only');
  const id = value.replace(/[^\d]/g, '');
  if (id.length < 9 || id.length > 16) throw new Error('meeting ID must contain 9 to 16 digits');
  return id;
};
export function parseZoomCommand(value: string): { action: Action; args: string[] } {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error('meeting ID or Zoom action is required');
  const [first, ...rest] = words;
  return actions.includes(first as Action) ? { action: first as Action, args: rest } : { action: 'join', args: words };
}
const publicXorgCall = (command: string, action: string | undefined, params: Record<string, unknown>) => {
  const result = Bun.spawnSync([
    'xorgctl',
    '--json',
    command,
    ...(action ? [action] : []),
    '--params',
    JSON.stringify(params),
  ]);
  return {
    exitCode: result.exitCode,
    output: redact(new TextDecoder().decode(result.stdout)),
    error: redact(new TextDecoder().decode(result.stderr)),
  };
};
/** Zoom owns semantics; Xorg receives only its documented generic JSON calls. */
export const call = (action: Action, args: string[]) => {
  if (action === 'join') {
    const target = args.join(' ');
    if (isInvitation(target))
      return { exitCode: 1, output: JSON.stringify({ ok: false, error: 'invitation_url_requires_stdin' }), error: '' };
    const meetingId = canonicalMeetingId(target);
    return publicXorgCall('app', 'launch', { argv: ['zoom', '--url', `zoommtg://zoom.us/join?confno=${meetingId}`] });
  }
  if (action === 'status' || action === 'awareness') return publicXorgCall('inspect', 'accessibility', {});
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
  pi.tools?.register({
    name: 'zoom_meeting',
    description: 'Join or control Zoom through verified public xorgctl JSON.',
    inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    async execute(input: { command: string }) {
      const parsed = parseZoomCommand(input.command);
      return call(parsed.action, parsed.args);
    },
  });
}
