interface ExtensionApi {
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
const VERSION = '1.0.1';
const invoke = (session: string | undefined, args: string[]) =>
  Bun.spawnSync(['xorgctl', ...(session ? ['--session', session] : []), '--json', ...args]);
export default function xorgIntegration(pi: ExtensionApi) {
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
          argv: ['xorgctl', 'setup', 'apply', '--params', JSON.stringify({ expected_version: VERSION })],
          timeoutMs: 300000,
        },
      ],
      verification: [
        {
          argv: ['xorgctl', '--json', 'setup', 'status', '--params', JSON.stringify({ expected_version: VERSION })],
          timeoutMs: 30000,
        },
      ],
    },
    async probe() {
      const r = invoke(undefined, ['capabilities']);
      const text = new TextDecoder().decode(r.stdout);
      if (r.exitCode !== 0 || !text.includes(VERSION)) {
        return { state: 'degraded', reason: 'version_mismatch' };
      }
      const setup = invoke(undefined, [
        'setup',
        'status',
        '--params',
        JSON.stringify({ expected_version: VERSION }),
      ]);
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
  pi.registerTool({
    name: 'xorg_desktop',
    label: 'Xorg desktop',
    description:
      'Observe or act on a named Ubuntu Xorg session through xorgctl JSON. Always set session explicitly for UAT. Setup readiness is setup/status with params {expected_version:"1.0.1"}. Supported discovery includes window/list, inspect/accessibility, screenshot/screenshot, and input/batch.',
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
      const details = { exitCode: r.exitCode, output: new TextDecoder().decode(r.stdout) };
      return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
    },
  });
}
