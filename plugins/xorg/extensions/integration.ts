import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { presentTool as enrichTool } from './presentation';

interface ExtensionApi {
  presentation: import('@f5-sales-demo/xcsh/presentation').PresentationAPI;
  integrations: { register<_T>(definition: unknown): unknown };
  typebox: {
    Type: {
      Object(shape: Record<string, unknown>): unknown;
      String(): unknown;
      Optional(schema: unknown): unknown;
      Unknown(): unknown;
      Record(key: unknown, value: unknown): unknown;
    };
  };
  registerTool(definition: unknown): void;
}
const VERSION = '1.4.0';
const BUNDLED_XORGCTL = resolve(import.meta.dir, '..', 'scripts', 'xorgctl');
const BAKED = existsSync('/etc/pi-desktop/desktop-lock.json');
const WAYLAND = process.env.XDG_SESSION_TYPE === 'wayland' || process.env.XORGCTL_BACKEND === 'wayland';
const INSTALLED_XORGCTL = BAKED ? '/usr/local/bin/xorgctl' : resolve(homedir(), '.local', 'bin', 'xorgctl');
const invoke = (session: string | undefined, args: string[]) =>
  Bun.spawnSync([INSTALLED_XORGCTL, ...(session ? ['--session', session] : []), '--json', ...(WAYLAND ? ['--backend', 'wayland'] : []), ...args]);
export default function xorgIntegration(pi: ExtensionApi) {
  const presentTool = <T extends { name: string; label?: string }>(tool: T) => enrichTool(tool, pi.presentation);
  pi.integrations.register({
    id: 'xorg',
    name: 'Xorg desktop',
    plugin: 'xorg',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: [],
      steps: BAKED ? [] : [
        {
          kind: 'install',
          argv: [BUNDLED_XORGCTL, 'setup', 'apply', '--params', JSON.stringify({ expected_version: VERSION })],
          timeoutMs: 900000,
        },
      ],
      verification: [
        {
          argv: BAKED && WAYLAND ? [INSTALLED_XORGCTL, '--backend', 'wayland', 'capabilities'] : [
            INSTALLED_XORGCTL,
            '--json',
            'setup',
            'status',
            '--params',
            JSON.stringify({ expected_version: VERSION }),
          ],
          timeoutMs: 30000,
        },
      ],
    },
    async probe() {
      const r = invoke(undefined, ['capabilities']);
      const text = new TextDecoder().decode(r.stdout);
      if (r.exitCode !== 0 || (!WAYLAND && !text.includes(VERSION))) {
        return { state: 'degraded', reason: 'version_mismatch' };
      }
      if (BAKED && WAYLAND) {
        try { const value = JSON.parse(text); return { state: value.ok ? 'ready' : 'degraded', value: value.result }; }
        catch { return { state: 'degraded', reason: 'backend_probe_invalid' }; }
      }
      const setup = invoke(undefined, ['setup', 'status', '--params', JSON.stringify({ expected_version: VERSION })]);
      if (setup.exitCode !== 0) return { state: 'degraded', reason: 'setup_probe_failed' };
      try {
        const envelope = JSON.parse(new TextDecoder().decode(setup.stdout)) as {
          result?: { state?: string; missing?: string[] };
        };
        return envelope.result?.state === 'ready'
          ? { state: 'ready', value: envelope.result }
          : { state: 'degraded', reason: 'setup_incomplete', value: envelope.result };
      } catch {
        return { state: 'degraded', reason: 'setup_probe_invalid' };
      }
    },
  });
  pi.registerTool(
    presentTool({
      name: 'xorg_desktop',
      label: 'Xorg desktop',
      description:
        'Observe or act on a named Ubuntu Xorg session through xorgctl JSON. Always set session explicitly for UAT. Setup readiness is reported by setup/status. Supported discovery includes window/list, inspect/accessibility, screenshot/screenshot, and input/batch.',
      parameters: pi.typebox.Type.Object({
        session: pi.typebox.Type.Optional(pi.typebox.Type.String()),
        command: pi.typebox.Type.String(),
        action: pi.typebox.Type.String(),
        params: pi.typebox.Type.Record(pi.typebox.Type.String(), pi.typebox.Type.Unknown()),
      }),
      async execute(
        _toolCallId: string,
        input: { session?: string; command: string; action?: string; params?: Record<string, unknown> },
      ) {
        const r = invoke(input.session, [
          input.command,
          ...(input.action ? [input.action] : []),
          '--params',
          JSON.stringify(input.params ?? {}),
        ]);
        const output = new TextDecoder().decode(r.stdout);
        let observation: unknown;
        try {
          observation = JSON.parse(output);
        } catch {
          observation = undefined;
        }
        const details = { exitCode: r.exitCode, output, observation };
        return { content: [{ type: 'text', text: JSON.stringify(details) }], details, isError: r.exitCode !== 0 };
      },
    }),
  );
}
