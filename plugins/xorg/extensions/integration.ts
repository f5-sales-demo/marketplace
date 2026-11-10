import { resolve } from 'node:path';
import manifest from '../.xcsh-plugin/plugin.json';
import { controllerArgv, type DesktopInput, INSTALLED_XORGCTL } from './commands';
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
const VERSION = manifest.version;
const BUNDLED_XORGCTL = resolve(import.meta.dir, '..', 'scripts', 'xorgctl');
const invoke = (session: string | undefined, args: string[]) =>
  Bun.spawnSync([INSTALLED_XORGCTL, ...(session ? ['--session', session] : []), '--json', ...args]);
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
      steps: [
        {
          kind: 'install',
          argv: [BUNDLED_XORGCTL, 'setup', 'apply', '--params', JSON.stringify({ expected_version: VERSION })],
          timeoutMs: 900000,
        },
      ],
      verification: [
        {
          argv: [
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
      let r: ReturnType<typeof invoke>;
      try {
        r = invoke(undefined, ['capabilities']);
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
        return { state: 'setup_required', reason: 'cli_missing', value: { next: 'xcsh plugin setup xorg' } };
      }
      if (r.exitCode !== 0) return { state: 'degraded', reason: 'capabilities_probe_failed' };
      try {
        const envelope = JSON.parse(new TextDecoder().decode(r.stdout));
        if (envelope?.ok !== true || envelope.result?.version !== VERSION)
          return { state: 'degraded', reason: 'version_mismatch' };
      } catch {
        return { state: 'degraded', reason: 'capabilities_probe_invalid' };
      }
      const setup = invoke(undefined, ['setup', 'status', '--params', JSON.stringify({ expected_version: VERSION })]);
      if (setup.exitCode !== 0) return { state: 'degraded', reason: 'setup_probe_failed' };
      try {
        const envelope = JSON.parse(new TextDecoder().decode(setup.stdout));
        if (
          envelope?.ok !== true ||
          !envelope.result ||
          typeof envelope.result !== 'object' ||
          Array.isArray(envelope.result)
        )
          return { state: 'degraded', reason: 'setup_probe_invalid' };
        return envelope.result.state === 'ready'
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
      async execute(_toolCallId: string, input: DesktopInput) {
        const r = Bun.spawnSync(controllerArgv(input));
        const output = new TextDecoder().decode(r.stdout);
        const stderr = new TextDecoder().decode(r.stderr);
        let observation: unknown;
        try {
          observation = JSON.parse(r.exitCode !== 0 && !output.trim() ? stderr : output);
        } catch {
          observation = undefined;
        }
        const details = { exitCode: r.exitCode, output, stderr, observation };
        return { content: [{ type: 'text', text: JSON.stringify(details) }], details, isError: r.exitCode !== 0 };
      },
    }),
  );
}
