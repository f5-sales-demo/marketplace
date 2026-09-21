interface ExtensionApi { integrations: { register<T>(definition: unknown): unknown }; tools?: { register<T>(definition: unknown): unknown } }
const VERSION = "0.3.0";
const invoke = (args: string[]) => Bun.spawnSync(["xorgctl", "--json", ...args]);
export default function xorgIntegration(pi: ExtensionApi) {
  pi.integrations.register({ id: "xorg", name: "Xorg desktop", plugin: "xorg", kind: "local",
    setup: { pluginDependencies: [], requiredEnvironment: [], profileFields: [], steps: [{ kind: "install", argv: ["xorgctl", "setup", "apply", "--version", VERSION], timeoutMs: 300000 }], verification: [{ argv: ["xorgctl", "--version"], timeoutMs: 30000 }] },
    async probe() { const r = invoke(["capabilities"]); const text = new TextDecoder().decode(r.stdout); return r.exitCode === 0 && text.includes(VERSION) ? { state: "ready" } : { state: "degraded", reason: "version_mismatch" }; } });
  pi.tools?.register({ name: "xorg_desktop", description: "Observe or act on Ubuntu Xorg through xorgctl JSON.", inputSchema: { type: "object", properties: { command: { type: "string" }, action: { type: "string" }, params: { type: "object" } }, required: ["command"] },
    async execute(input: { command: string; action?: string; params?: Record<string, unknown> }) { const r = invoke([input.command, ...(input.action ? [input.action] : []), "--params", JSON.stringify(input.params ?? {})]); return { exitCode: r.exitCode, output: new TextDecoder().decode(r.stdout) }; } });
}
