import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface ExtensionApi {
  integrations: { register<_T>(definition: unknown): unknown };
  typebox: {
    Type: {
      Object(shape: Record<string, unknown>): unknown;
      String(): unknown;
      Literal(value: string): unknown;
      Union(schemas: unknown[]): unknown;
      Optional(schema: unknown): unknown;
    };
  };
  registerTool(definition: unknown): void;
}
export type Action =
  | 'status'
  | 'leave'
  | 'stop-share'
  | 'audio'
  | 'video'
  | 'share'
  | 'hand'
  | 'reaction'
  | 'stimulus'
  | 'awareness'
  | 'join';
const DEFAULT_SESSION = 'desktop';
const CANDIDATE_SESSIONS = ['console', DEFAULT_SESSION] as const;
type AccessibilityItem = {
  name?: string;
  role?: string;
  pid?: number;
  box?: number[];
  checked?: boolean;
  selected?: boolean;
};
type WindowItem = { id?: number; pid?: number; title?: string };
type MeetingIdentity = { version: 1; session: string; meeting_id: string; zoom_pid: number };
const zoomProcessId = (windows: WindowItem[]) =>
  windows.find((window) => typeof window.pid === 'number' && /zoom|meeting/i.test(window.title ?? ''))?.pid;
const meetingIdentityDirectory = () =>
  process.env.XCSH_ZOOM_STATE_DIR ??
  join(process.env.XDG_RUNTIME_DIR ?? join(homedir(), '.local', 'state'), 'xcsh-zoom');
const meetingIdentityPath = (session: string) =>
  join(meetingIdentityDirectory(), `meeting-${session.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`);
const forgetMeetingIdentity = (session: string) => rmSync(meetingIdentityPath(session), { force: true });
const rememberMeetingIdentity = (session: string, meetingId: string, windows: WindowItem[]) => {
  const zoomPid = zoomProcessId(windows);
  if (zoomPid === undefined) return;
  const directory = meetingIdentityDirectory();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = meetingIdentityPath(session);
  const temporary = `${path}.${process.pid}.tmp`;
  const state: MeetingIdentity = { version: 1, session, meeting_id: meetingId, zoom_pid: zoomPid };
  writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
};
const recalledMeetingIdentity = (session: string, windows: WindowItem[]) => {
  try {
    const state = JSON.parse(readFileSync(meetingIdentityPath(session), 'utf8')) as Partial<MeetingIdentity>;
    const currentPids = new Set(windows.map((window) => window.pid).filter((pid): pid is number => pid !== undefined));
    if (
      state.version === 1 &&
      state.session === session &&
      typeof state.meeting_id === 'string' &&
      /^\d{9,16}$/.test(state.meeting_id) &&
      typeof state.zoom_pid === 'number' &&
      currentPids.has(state.zoom_pid)
    ) {
      return state.meeting_id;
    }
  } catch {
    // Missing, stale, or malformed state is never promoted to meeting evidence.
  }
  forgetMeetingIdentity(session);
  return undefined;
};
export const deriveMeetingId = (items: AccessibilityItem[]) => {
  for (const item of items) {
    const match = (item.name ?? '').match(/meeting id\s*[:#]?\s*([0-9][0-9\s-]{7,24})/i);
    if (!match) continue;
    const id = match[1].replace(/[^\d]/g, '');
    if (id.length >= 9 && id.length <= 16) return id;
  }
  return undefined;
};
export function deriveAwareness(items: AccessibilityItem[], windows: WindowItem[]) {
  const labels = items.map((item) => (item.name ?? '').trim().toLowerCase()).filter(Boolean);
  const has = (...needles: string[]) => needles.some((needle) => labels.some((label) => label.includes(needle)));
  const hasExact = (...needles: string[]) => needles.some((needle) => labels.includes(needle));
  const hasMeetingWindow = windows.some((window) => /^(zoom )?meeting$/i.test((window.title ?? '').trim()));
  const meeting = has('you are screen sharing', 'stop share', 'stop sharing')
    ? 'sharing'
    : has('waiting room', 'host will let you in', 'please wait for the host')
      ? 'waiting_room'
      : has('join with video', 'video preview', 'preview your video')
        ? 'prejoin'
        : hasMeetingWindow || (has('participants', 'reactions') && has('mute', 'unmute'))
          ? 'in_meeting'
          : has('join a meeting', 'sign into a different account')
            ? 'signed_out'
            : has('new meeting', 'schedule', 'share screen')
              ? 'home'
              : 'unknown';
  return {
    version: 1,
    meeting,
    meeting_id: deriveMeetingId(items) ?? 'unknown',
    audio: hasExact('unmute') ? 'muted' : hasExact('mute') ? 'unmuted' : 'unknown',
    video: hasExact('start video') ? 'off' : hasExact('stop video') ? 'on' : 'unknown',
    share: hasExact('stop share', 'stop sharing')
      ? 'on'
      : meeting === 'in_meeting' && hasExact('share', 'share screen')
        ? 'off'
        : 'unknown',
    hand: hasExact('lower hand') ? 'raised' : hasExact('raise hand') ? 'lowered' : 'unknown',
    zoom_windows: windows.filter((window) => /zoom|meeting/i.test(window.title ?? '')),
    source: ['AT-SPI', 'EWMH'],
  };
}
const actions: readonly Action[] = [
  'join',
  'status',
  'leave',
  'stop-share',
  'audio',
  'video',
  'share',
  'hand',
  'reaction',
  'stimulus',
  'awareness',
];
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
  action?: string;
  invitation_url?: string;
  meeting_id?: string;
  state?: string;
}): { action: Action; args: string[] } {
  const action = input.action?.trim();
  if (!action || !actions.includes(action as Action))
    throw new Error(`unsupported Zoom action: ${action || '<empty>'}`);
  if (action !== 'join') return { action: action as Action, args: input.state?.trim() ? [input.state.trim()] : [] };
  const invitation = input.invitation_url?.trim();
  const meetingId = input.meeting_id?.trim();
  if (invitation && meetingId) throw new Error('join accepts either invitation_url or meeting_id, not both');
  if (invitation) return { action: 'join', args: [invitation] };
  if (meetingId) return { action: 'join', args: [meetingId] };
  throw new Error('join requires invitation_url or meeting_id');
}
const publicXorgCall = (
  session: string,
  command: string,
  action: string | undefined,
  params: Record<string, unknown>,
) => {
  const result = Bun.spawnSync([
    'xorgctl',
    '--session',
    session,
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
const sessionWindows = (session: string): WindowItem[] => {
  const response = publicXorgCall(session, 'window', 'list', {});
  if (response.exitCode) return [];
  try {
    const envelope = JSON.parse(response.output) as { result?: { windows?: WindowItem[] } };
    return envelope.result?.windows ?? [];
  } catch {
    return [];
  }
};
export const discoverActiveMeetingSession = (windowsBySession: Record<string, WindowItem[]>) =>
  CANDIDATE_SESSIONS.find((session) =>
    (windowsBySession[session] ?? []).some((window) => /^(zoom )?meeting$/i.test((window.title ?? '').trim())),
  );
export const discoverZoomSession = (windowsBySession: Record<string, WindowItem[]>) =>
  discoverActiveMeetingSession(windowsBySession) ??
  CANDIDATE_SESSIONS.find((session) =>
    (windowsBySession[session] ?? []).some((window) => /^zoom workplace/i.test((window.title ?? '').trim())),
  );
const sessionInventory = () =>
  Object.fromEntries(CANDIDATE_SESSIONS.map((session) => [session, sessionWindows(session)]));
const sessionAccessibility = (session: string): AccessibilityItem[] => {
  const response = publicXorgCall(session, 'inspect', 'accessibility', {});
  if (response.exitCode) return [];
  try {
    const envelope = JSON.parse(response.output) as { result?: { items?: AccessibilityItem[] } };
    return envelope.result?.items ?? [];
  } catch {
    return [];
  }
};
const discoverActiveMeetingSessionByAwareness = (windowsBySession: Record<string, WindowItem[]>) =>
  CANDIDATE_SESSIONS.find((session) => {
    const state = deriveAwareness(sessionAccessibility(session), windowsBySession[session] ?? []).meeting;
    return state === 'in_meeting' || state === 'sharing' || state === 'waiting_room' || state === 'prejoin';
  });
const clickAccessible = (session: string, item: AccessibilityItem) => {
  const box = item.box;
  if (box?.length !== 4 || box[2] <= 0 || box[3] <= 0) return false;
  const [x, y, width, height] = box;
  const response = publicXorgCall(session, 'input', 'batch', {
    allow_focus_change: true,
    steps: [
      { action: 'click', x: Math.round(x + width / 2), y: Math.round(y + height / 2) },
      { action: 'wait', seconds: 0.5 },
    ],
  });
  return response.exitCode === 0;
};
const readMeetingId = (session: string, windows = sessionWindows(session)) => {
  let items = sessionAccessibility(session);
  const current = deriveMeetingId(items);
  if (current) {
    rememberMeetingIdentity(session, current, windows);
    return current;
  }
  const information = items.find(
    (item) => item.role === 'push button' && (item.name ?? '').trim().toLowerCase() === 'meeting information',
  );
  if (!information || !clickAccessible(session, information)) return recalledMeetingIdentity(session, windows);
  items = sessionAccessibility(session);
  const meetingId = deriveMeetingId(items);
  publicXorgCall(session, 'input', 'batch', {
    allow_focus_change: true,
    steps: [{ action: 'key', key: 'Escape' }],
  });
  if (meetingId) rememberMeetingIdentity(session, meetingId, windows);
  return meetingId ?? recalledMeetingIdentity(session, windows);
};
const verifiedMeetingResult = (session: string, requestedMeetingId: string, changed: boolean) => {
  const activeMeetingId = readMeetingId(session);
  if (!activeMeetingId) {
    return {
      exitCode: 1,
      code: 'active_meeting_identity_unknown',
      state: 'in_meeting',
      session,
      changed: false,
      verified: false,
    };
  }
  if (activeMeetingId !== requestedMeetingId) {
    return {
      exitCode: 1,
      code: 'active_meeting_conflict',
      state: 'in_meeting',
      session,
      changed: false,
      verified: true,
      meeting_identity: activeMeetingId,
      requested_meeting_id: requestedMeetingId,
    };
  }
  return {
    exitCode: 0,
    state: 'in_meeting',
    session,
    changed,
    verified: true,
    meeting_identity: activeMeetingId,
    requested_meeting_id: requestedMeetingId,
  };
};
const observeAwareness = (session: string) => deriveAwareness(sessionAccessibility(session), sessionWindows(session));
const observeHandState = (session: string) => {
  const initial = observeAwareness(session).hand;
  if (initial !== 'unknown') return initial;
  const react = sessionAccessibility(session).find(
    (item) => item.role === 'push button' && (item.name ?? '').trim().toLowerCase() === 'react',
  );
  if (!react || !clickAccessible(session, react)) return 'unknown';
  const state = deriveAwareness(sessionAccessibility(session), sessionWindows(session)).hand;
  publicXorgCall(session, 'input', 'batch', {
    allow_focus_change: true,
    steps: [{ action: 'key', key: 'Escape' }],
  });
  return state;
};
const itemWithin = (item: AccessibilityItem, container: AccessibilityItem) => {
  if (!item.box || !container.box || item.box.length !== 4 || container.box.length !== 4) return false;
  const [x, y, width, height] = item.box;
  const [cx, cy, cwidth, cheight] = container.box;
  return x >= cx && y >= cy && x + width <= cx + cwidth && y + height <= cy + cheight;
};
const exactItem = (items: AccessibilityItem[], name: string, role: string, container?: AccessibilityItem) => {
  const matches = items.filter(
    (item) =>
      item.role === role &&
      (item.name ?? '').trim().toLowerCase() === name.toLowerCase() &&
      (!container || itemWithin(item, container)),
  );
  return matches.length === 1 ? matches[0] : undefined;
};
const clickShareTarget = (session: string, item: AccessibilityItem) => {
  const box = item.box;
  if (box?.length !== 4 || box[2] <= 0 || box[3] <= 0) return false;
  const [x, y, width, height] = box;
  const response = publicXorgCall(session, 'input', 'batch', {
    allow_focus_change: true,
    steps: [
      { action: 'click', x: Math.round(x + Math.min(120, width / 4)), y: Math.round(y + height / 2) },
      { action: 'wait', seconds: 0.5 },
    ],
  });
  return response.exitCode === 0;
};
const controlShare = (session: string, requested = 'browser') => {
  const aliases: Record<string, 'browser_window' | 'entire_desktop'> = {
    browser: 'browser_window',
    browser_window: 'browser_window',
    on: 'browser_window',
    desktop: 'entire_desktop',
    entire_desktop: 'entire_desktop',
  };
  const target = aliases[requested.toLowerCase()];
  if (!target) {
    return { exitCode: 1, code: 'invalid_share_target', control: 'share', requested, allowed: Object.keys(aliases) };
  }
  const previous = observeAwareness(session).share;
  if (previous === 'on') {
    return {
      exitCode: 0,
      control: 'share',
      target,
      shared_sound: 'unknown',
      previous,
      current: 'on',
      changed: false,
      verified: true,
    };
  }
  if (previous !== 'off') {
    return { exitCode: 1, code: 'semantic_state_unavailable', control: 'share', target, previous, verified: false };
  }
  const windows = sessionWindows(session);
  const meeting = windows.find((window) => /^(zoom )?meeting$/i.test((window.title ?? '').trim()));
  if (!meeting?.id)
    return { exitCode: 1, code: 'meeting_window_unavailable', control: 'share', target, verified: false };
  if (target === 'browser_window') {
    const browsers = windows.filter((window) => (window.title ?? '').trim() === 'xcsh Zoom AV UAT - Google Chrome');
    if (browsers.length !== 1) {
      return { exitCode: 1, code: 'browser_share_target_unavailable', control: 'share', target, verified: false };
    }
  }
  let picker = windows.find((window) => /^select a window or an application/i.test((window.title ?? '').trim()));
  if (!picker?.id) {
    const focused = publicXorgCall(session, 'window', 'focus', { window: meeting.id });
    if (focused.exitCode)
      return { ...focused, code: 'meeting_focus_failed', control: 'share', target, verified: false };
    const opened = publicXorgCall(session, 'input', 'batch', {
      window: meeting.id,
      allow_focus_change: true,
      steps: [
        { action: 'chord', keys: ['Alt_L', 's'] },
        { action: 'wait', seconds: 0.5 },
      ],
    });
    if (opened.exitCode)
      return { ...opened, code: 'share_picker_input_failed', control: 'share', target, verified: false };
    const pickerDeadline = Date.now() + 5_000;
    while (Date.now() < pickerDeadline) {
      picker = sessionWindows(session).find((window) =>
        /^select a window or an application/i.test((window.title ?? '').trim()),
      );
      if (picker?.id) break;
      Bun.sleepSync(100);
    }
  }
  if (!picker?.id) return { exitCode: 1, code: 'share_picker_unavailable', control: 'share', target, verified: false };
  const pickerFocused = publicXorgCall(session, 'window', 'focus', { window: picker.id });
  if (pickerFocused.exitCode)
    return { ...pickerFocused, code: 'share_picker_focus_failed', control: 'share', target, verified: false };
  let items = sessionAccessibility(session);
  const chooser = exactItem(items, 'Select a window or an application that you want to share', 'frame');
  if (!chooser)
    return { exitCode: 1, code: 'share_picker_semantics_unavailable', control: 'share', target, verified: false };
  const targetName = target === 'browser_window' ? 'xcsh Zoom AV UAT - Google Chrome' : 'Desktop 1';
  const targetItem = exactItem(items, targetName, 'filler', chooser);
  if (!targetItem || !clickShareTarget(session, targetItem)) {
    return { exitCode: 1, code: 'share_target_unavailable', control: 'share', target, verified: false };
  }
  items = sessionAccessibility(session);
  let sound = exactItem(items, 'Share sound', 'check box', chooser);
  if (!sound)
    return { exitCode: 1, code: 'shared_sound_control_unavailable', control: 'share', target, verified: false };
  if (sound.checked !== true) {
    if (!clickAccessible(session, sound)) {
      return { exitCode: 1, code: 'shared_sound_input_failed', control: 'share', target, verified: false };
    }
    items = sessionAccessibility(session);
    sound = exactItem(items, 'Share sound', 'check box', chooser);
  }
  if (sound?.checked !== true) {
    return { exitCode: 1, code: 'shared_sound_verification_failed', control: 'share', target, verified: false };
  }
  const shareButton = exactItem(items, 'Share', 'push button', chooser);
  if (!shareButton || !clickAccessible(session, shareButton)) {
    return { exitCode: 1, code: 'share_submit_failed', control: 'share', target, verified: false };
  }
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (observeAwareness(session).share === 'on') {
      return {
        exitCode: 0,
        control: 'share',
        target,
        shared_sound: 'on',
        previous,
        current: 'on',
        changed: true,
        verified: true,
      };
    }
    Bun.sleepSync(100);
  }
  return { exitCode: 1, code: 'share_verification_timeout', control: 'share', target, previous, verified: false };
};
const controlStopShare = (session: string) => {
  const previous = observeAwareness(session).share;
  if (previous === 'off') {
    return { exitCode: 0, control: 'stop-share', previous, current: 'off', changed: false, verified: true };
  }
  if (previous !== 'on') {
    return { exitCode: 1, code: 'semantic_state_unavailable', control: 'stop-share', previous, verified: false };
  }
  const controls = sessionAccessibility(session).filter(
    (item) =>
      item.role === 'push button' && ['stop share', 'stop sharing'].includes((item.name ?? '').trim().toLowerCase()),
  );
  if (controls.length !== 1 || !clickAccessible(session, controls[0])) {
    return { exitCode: 1, code: 'stop_share_control_unavailable', control: 'stop-share', previous, verified: false };
  }
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (observeAwareness(session).share === 'off') {
      return { exitCode: 0, control: 'stop-share', previous, current: 'off', changed: true, verified: true };
    }
    Bun.sleepSync(100);
  }
  return { exitCode: 1, code: 'stop_share_verification_timeout', control: 'stop-share', previous, verified: false };
};
const controlReaction = (session: string, requested: string) => {
  const aliases: Record<string, { reaction: string; label: string }> = {
    clap: { reaction: 'clap', label: 'Clap' },
    'thumbs-up': { reaction: 'thumbs_up', label: 'Thumbs up' },
    thumbs_up: { reaction: 'thumbs_up', label: 'Thumbs up' },
    heart: { reaction: 'heart', label: 'Heart' },
    laugh: { reaction: 'laugh', label: 'Laugh' },
    wow: { reaction: 'wow', label: 'Wow' },
    celebrate: { reaction: 'celebrate', label: 'Celebrate' },
    yes: { reaction: 'yes', label: 'Yes' },
    no: { reaction: 'no', label: 'No' },
    'slow-down': { reaction: 'slow_down', label: 'Slow down' },
    slow_down: { reaction: 'slow_down', label: 'Slow down' },
    'speed-up': { reaction: 'speed_up', label: 'Speed up' },
    speed_up: { reaction: 'speed_up', label: 'Speed up' },
    away: { reaction: 'away', label: "I'm away" },
  };
  const selected = aliases[requested.toLowerCase()];
  if (!selected) {
    return { exitCode: 1, code: 'invalid_reaction', control: 'reaction', requested, allowed: Object.keys(aliases) };
  }
  const before = observeAwareness(session);
  if (before.meeting !== 'in_meeting' && before.meeting !== 'sharing') {
    return { exitCode: 1, code: 'meeting_state_unavailable', control: 'reaction', requested, verified: false };
  }
  const meeting = sessionWindows(session).find((window) => /^(zoom )?meeting$/i.test((window.title ?? '').trim()));
  if (meeting?.id) {
    const focused = publicXorgCall(session, 'window', 'focus', { window: meeting.id });
    if (focused.exitCode) return { ...focused, code: 'meeting_focus_failed', control: 'reaction', verified: false };
  }
  let items = sessionAccessibility(session);
  const react = exactItem(items, 'React', 'push button');
  if (!react || !clickAccessible(session, react)) {
    return { exitCode: 1, code: 'reaction_menu_unavailable', control: 'reaction', requested, verified: false };
  }
  let reaction: AccessibilityItem | undefined;
  const menuDeadline = Date.now() + 3_000;
  while (Date.now() < menuDeadline) {
    items = sessionAccessibility(session);
    reaction = exactItem(items, selected.label, 'push button');
    if (reaction) break;
    Bun.sleepSync(100);
  }
  if (!reaction || !clickAccessible(session, reaction)) {
    return { exitCode: 1, code: 'reaction_control_unavailable', control: 'reaction', requested, verified: false };
  }
  const afterItems = sessionAccessibility(session);
  const after = deriveAwareness(afterItems, sessionWindows(session));
  const menuDismissed = !exactItem(afterItems, selected.label, 'push button');
  const meetingActive = after.meeting === 'in_meeting' || after.meeting === 'sharing';
  if (!menuDismissed || !meetingActive) {
    return {
      exitCode: 1,
      code: 'reaction_verification_failed',
      control: 'reaction',
      reaction: selected.reaction,
      verified: false,
    };
  }
  return {
    exitCode: 0,
    control: 'reaction',
    reaction: selected.reaction,
    changed: true,
    verified: true,
    evidence: 'AT-SPI reaction control activation and menu dismissal with active meeting',
    receiver_verification: 'required',
  };
};
const controlStimulus = (session: string, requested = 'tones') => {
  const kind = requested.toLowerCase();
  if (kind !== 'tones' && kind !== 'speech') {
    return { exitCode: 1, code: 'invalid_stimulus', control: 'stimulus', requested, allowed: ['tones', 'speech'] };
  }
  const awareness = observeAwareness(session);
  if (awareness.meeting !== 'in_meeting' && awareness.meeting !== 'sharing') {
    return { exitCode: 1, code: 'meeting_state_unavailable', control: 'stimulus', verified: false };
  }
  if (awareness.audio !== 'unmuted') {
    return { exitCode: 1, code: 'microphone_muted', control: 'stimulus', verified: false };
  }
  const token = kind === 'speech' ? 'XCSH-UAT' : undefined;
  const response = publicXorgCall(DEFAULT_SESSION, 'audio', 'stimulus', {
    kind,
    seconds: kind === 'speech' ? 6 : 2.4,
    ...(token ? { token } : {}),
  });
  if (response.exitCode) return { ...response, code: 'stimulus_delivery_failed', control: 'stimulus', verified: false };
  try {
    const envelope = JSON.parse(response.output) as {
      result?: { stimulus?: string; sink?: string; retention?: string; token_sha256?: string | null };
    };
    const result = envelope.result;
    if (result?.stimulus !== kind || result.sink !== 'xcsh_microphone' || result.retention !== 'none') {
      return { exitCode: 1, code: 'stimulus_verification_failed', control: 'stimulus', verified: false };
    }
    return {
      exitCode: 0,
      control: 'stimulus',
      session,
      media_session: DEFAULT_SESSION,
      kind,
      sink: result.sink,
      retention: result.retention,
      token: token ?? null,
      token_sha256: result.token_sha256 ?? null,
      changed: true,
      verified: true,
      receiver_verification: 'required',
    };
  } catch {
    return { exitCode: 1, code: 'invalid_xorg_stimulus_result', control: 'stimulus', verified: false };
  }
};
const controlLeave = (session: string) => {
  const previous = observeAwareness(session).meeting;
  if (previous === 'home' || previous === 'signed_out') {
    return { exitCode: 0, control: 'leave', previous, current: 'left', changed: false, verified: true };
  }
  if (previous !== 'in_meeting' && previous !== 'sharing') {
    return { exitCode: 1, code: 'meeting_state_unavailable', control: 'leave', previous, verified: false };
  }
  if (previous === 'sharing') {
    const stopped = controlStopShare(session);
    if (stopped.exitCode) return { ...stopped, control: 'leave' };
  }
  const meeting = sessionWindows(session).find((window) => /^(zoom )?meeting$/i.test((window.title ?? '').trim()));
  if (!meeting?.id) return { exitCode: 1, code: 'meeting_window_unavailable', control: 'leave', verified: false };
  const focused = publicXorgCall(session, 'window', 'focus', { window: meeting.id });
  if (focused.exitCode) return { ...focused, code: 'meeting_focus_failed', control: 'leave', verified: false };
  const leave = exactItem(sessionAccessibility(session), 'Leave', 'push button');
  if (!leave || !clickAccessible(session, leave)) {
    return { exitCode: 1, code: 'leave_control_unavailable', control: 'leave', verified: false };
  }
  let confirmation: AccessibilityItem | undefined;
  const confirmationDeadline = Date.now() + 3_000;
  while (Date.now() < confirmationDeadline) {
    confirmation = exactItem(sessionAccessibility(session), 'Leave meeting', 'push button');
    if (confirmation) break;
    Bun.sleepSync(100);
  }
  if (!confirmation || !clickAccessible(session, confirmation)) {
    return { exitCode: 1, code: 'leave_confirmation_unavailable', control: 'leave', verified: false };
  }
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const windows = sessionWindows(session);
    const awareness = deriveAwareness(sessionAccessibility(session), windows);
    const meetingWindow = windows.some((window) => /^(zoom )?meeting$/i.test((window.title ?? '').trim()));
    if (!meetingWindow && (awareness.meeting === 'home' || awareness.meeting === 'signed_out')) {
      forgetMeetingIdentity(session);
      return { exitCode: 0, control: 'leave', previous, current: 'left', changed: true, verified: true };
    }
    Bun.sleepSync(100);
  }
  return { exitCode: 1, code: 'leave_verification_timeout', control: 'leave', previous, verified: false };
};
const controlState = (session: string, action: 'audio' | 'video' | 'hand', requested = 'toggle') => {
  const allowed = {
    audio: ['muted', 'unmuted', 'toggle'],
    video: ['on', 'off', 'toggle'],
    hand: ['raised', 'lowered', 'toggle'],
  }[action];
  if (!allowed.includes(requested)) {
    return { exitCode: 1, code: 'invalid_control_state', control: action, requested, allowed };
  }
  const previous = action === 'hand' ? observeHandState(session) : observeAwareness(session)[action];
  if (previous === 'unknown') {
    return { exitCode: 1, code: 'semantic_state_unavailable', control: action, requested, verified: false };
  }
  const inverse = {
    audio: { muted: 'unmuted', unmuted: 'muted' },
    video: { on: 'off', off: 'on' },
    hand: { raised: 'lowered', lowered: 'raised' },
  }[action] as Record<string, string>;
  const target = requested === 'toggle' ? inverse[previous] : requested;
  if (previous === target) {
    return { exitCode: 0, control: action, requested, previous, current: previous, changed: false, verified: true };
  }
  const meeting = sessionWindows(session).find((window) => /^(zoom )?meeting$/i.test((window.title ?? '').trim()));
  if (!meeting?.id) return { exitCode: 1, code: 'meeting_window_unavailable', control: action, verified: false };
  const key = { audio: 'a', video: 'v', hand: 'y' }[action];
  const focused = publicXorgCall(session, 'window', 'focus', { window: meeting.id });
  if (focused.exitCode) return { ...focused, code: 'meeting_focus_failed', control: action, verified: false };
  const input = publicXorgCall(session, 'input', 'batch', {
    window: meeting.id,
    steps: [
      { action: 'chord', keys: ['Alt_L', key] },
      { action: 'wait', seconds: 0.5 },
    ],
  });
  if (input.exitCode) return { ...input, code: 'control_input_failed', control: action, verified: false };
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const current = action === 'hand' ? observeHandState(session) : observeAwareness(session)[action];
    if (current === target) {
      return { exitCode: 0, control: action, requested, previous, current, changed: true, verified: true };
    }
    Bun.sleepSync(100);
  }
  return { exitCode: 1, code: 'control_verification_timeout', control: action, requested, previous, verified: false };
};
/** Zoom owns semantics; Xorg receives only its documented generic JSON calls. */
export const call = (action: Action, args: string[]) => {
  const windowsBySession = sessionInventory();
  const activeMeetingSession =
    discoverActiveMeetingSession(windowsBySession) ?? discoverActiveMeetingSessionByAwareness(windowsBySession);
  const session =
    action === 'join'
      ? (activeMeetingSession ?? discoverZoomSession(windowsBySession) ?? DEFAULT_SESSION)
      : (activeMeetingSession ?? DEFAULT_SESSION);
  if (action === 'join') {
    const target = args.join(' ');
    const requestedMeetingId = isInvitation(target)
      ? canonicalMeetingId(new URL(target).pathname.split('/').filter(Boolean).at(-1) ?? '')
      : canonicalMeetingId(target);
    if (activeMeetingSession) {
      return verifiedMeetingResult(session, requestedMeetingId, false);
    }
    const joinTarget = isInvitation(target)
      ? invitationToZoomMtg(target)
      : `zoommtg://zoom.us/join?action=join&confno=${canonicalMeetingId(target)}`;
    const launched = publicXorgCall(session, 'app', 'launch', { argv: ['zoom', joinTarget] });
    if (launched.exitCode) return launched;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (sessionWindows(session).some((window) => /^(zoom )?meeting$/i.test((window.title ?? '').trim()))) {
        return verifiedMeetingResult(session, requestedMeetingId, true);
      }
      Bun.sleepSync(250);
    }
    return { exitCode: 1, code: 'join_timeout', session, changed: false, verified: false };
  }
  if (action === 'status' || action === 'awareness') {
    const accessibility = publicXorgCall(session, 'inspect', 'accessibility', {});
    const windowList = publicXorgCall(session, 'window', 'list', {});
    if (accessibility.exitCode || windowList.exitCode) return { accessibility, windowList };
    try {
      const accessibilityEnvelope = JSON.parse(accessibility.output) as { result?: { items?: AccessibilityItem[] } };
      const windowEnvelope = JSON.parse(windowList.output) as { result?: { windows?: WindowItem[] } };
      const awareness = deriveAwareness(
        accessibilityEnvelope.result?.items ?? [],
        windowEnvelope.result?.windows ?? [],
      );
      if (
        awareness.meeting_id === 'unknown' &&
        (awareness.meeting === 'in_meeting' || awareness.meeting === 'sharing')
      ) {
        awareness.meeting_id = readMeetingId(session, windowEnvelope.result?.windows ?? []) ?? 'unknown';
      }
      if (awareness.hand === 'unknown' && (awareness.meeting === 'in_meeting' || awareness.meeting === 'sharing')) {
        awareness.hand = observeHandState(session);
      }
      if (awareness.meeting === 'home' || awareness.meeting === 'signed_out') forgetMeetingIdentity(session);
      return {
        exitCode: 0,
        session,
        awareness,
        evidence: { accessibility: accessibilityEnvelope.result, windows: windowEnvelope.result },
      };
    } catch {
      return { exitCode: 1, error: 'invalid_xorg_observation', accessibility, windowList };
    }
  }
  if (action === 'audio' || action === 'video' || action === 'hand') {
    return controlState(session, action, args[0]?.toLowerCase() ?? 'toggle');
  }
  if (action === 'share') return controlShare(session, args[0]?.toLowerCase() ?? 'browser');
  if (action === 'stop-share') return controlStopShare(session);
  if (action === 'reaction') return controlReaction(session, args.join('-').toLowerCase());
  if (action === 'stimulus') return controlStimulus(session, args[0]?.toLowerCase() ?? 'tones');
  if (action === 'leave') return controlLeave(session);
  const shortcuts: Record<string, string> = {};
  return publicXorgCall(session, 'input', 'batch', { steps: [{ action: 'key', key: shortcuts[action] }] });
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
      'Deterministic Zoom controller and sole owner of Zoom Xorg interaction. Select exactly one action. For join, provide exactly one complete invitation_url or numeric meeting_id. For share, set state to browser or desktop; browser is the default. For status or awareness, omit all optional fields. The controller discovers the active session and verifies state through public xorgctl JSON without physical media.',
    parameters: pi.typebox.Type.Object({
      action: pi.typebox.Type.Union(actions.map((action) => pi.typebox.Type.Literal(action))),
      invitation_url: pi.typebox.Type.Optional(pi.typebox.Type.String()),
      meeting_id: pi.typebox.Type.Optional(pi.typebox.Type.String()),
      state: pi.typebox.Type.Optional(pi.typebox.Type.String()),
    }),
    async execute(
      _toolCallId: string,
      input: { action?: string; invitation_url?: string; meeting_id?: string; state?: string },
    ) {
      const parsed = parseZoomToolInput(input);
      const details = call(parsed.action, parsed.args);
      return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
    },
  });
}
