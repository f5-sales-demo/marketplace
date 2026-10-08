import {
  type ControllerInvoker,
  controllerEnvironment,
  createKvmSmsv2Tools,
  invokeController as defaultInvokeController,
  KVM_SMSV2_CONTROLLER,
} from "./tools";

interface KvmExtensionApi {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
  setLabel(label: string): void;
  registerTool?(tool: unknown): void;
  integrations: { register<_T>(definition: unknown): unknown };
  settings?: { get(key: string): unknown };
  on?(event: string, handler: unknown): void;
}

const factory = async (
  pi: KvmExtensionApi,
  invokeController: ControllerInvoker = defaultInvokeController,
) => {
  pi.setLabel("KVM SMSv2");
  pi.integrations.register({
    id: "kvm",
    name: "KVM Secure Mesh Site v2",
    plugin: "kvm",
    kind: "local",
    dependencies: ["platform"],
    setup: {
      pluginDependencies: ["platform"],
      requiredEnvironment: ["XCSH_API_URL", "XCSH_API_TOKEN", "XCSH_NAMESPACE"],
      profileFields: [],
      steps: [
        {
          kind: "install",
          argv: [KVM_SMSV2_CONTROLLER, "--json", "setup", "apply"],
          timeoutMs: 7_200_000,
          environment: ["XCSH_API_URL", "XCSH_API_TOKEN", "XCSH_NAMESPACE"],
          stdin: "inherit",
        },
      ],
      verification: [
        {
          argv: [KVM_SMSV2_CONTROLLER, "--json", "setup", "status"],
          timeoutMs: 60_000,
        },
      ],
    },
    async probe() {
      if (process.platform !== "linux" || process.arch !== "x64")
        return { state: "unavailable", reason: "dependency_missing" };
      try {
        const result = invokeController(
          "setup",
          {},
          "status",
          controllerEnvironment({ settings: pi.settings }),
        );
        const status = result.result as { state?: string } | undefined;
        return status?.state === "ready"
          ? { state: "ready", value: result }
          : {
              state: "setup_required",
              reason: "dependency_missing",
              value: result,
            };
      } catch {
        return { state: "setup_required", reason: "dependency_missing" };
      }
    },
  });
  if (typeof pi.registerTool === "function")
    for (const tool of createKvmSmsv2Tools(pi, invokeController))
      pi.registerTool(tool);
};

export default factory;
