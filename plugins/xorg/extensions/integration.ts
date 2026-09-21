interface ExtensionApi {
  integrations: { register<_T>(definition: unknown): unknown };
  typebox: { Type: { Object(shape: Record<string, unknown>): unknown; String(): unknown } };
  registerTool(definition: unknown): void;
}
const VERSION = '0.3.0';
const invoke = (args: string[]) => Bun.spawnSync(['xorgctl', '--json', ...args]);
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
      steps: [{ kind: 'install', argv: ['xorgctl', 'setup', 'apply', '--version', VERSION], timeoutMs: 300000 }],
      verification: [{ argv: ['xorgctl', '--version'], timeoutMs: 30000 }],
    },
    async probe() {
      const r = invoke(['capabilities']);
      const text = new TextDecoder().decode(r.stdout);
      return r.exitCode === 0 && text.includes(VERSION)
        ? { state: 'ready' }
        : { state: 'degraded', reason: 'version_mismatch' };
    },
  });
  pi.registerTool({
    name: 'xorg_desktop',
    label: 'Xorg desktop',
    description: 'Observe or act on Ubuntu Xorg through xorgctl JSON.',
    parameters: pi.typebox.Type.Object({
      command: pi.typebox.Type.String(),
      action: pi.typebox.Type.String(),
      params: pi.typebox.Type.Object({}),
    }),
    async execute(_toolCallId: string, input: { command: string; action?: string; params?: Record<string, unknown> }) {
      const r = invoke([
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
