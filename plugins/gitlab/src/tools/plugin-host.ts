/**
 * The xcsh plugin-host surface, as this plugin uses it.
 *
 * xcsh publishes the full contract as `ExtensionAPI` in `@f5-sales-demo/xcsh` — see
 * `packages/coding-agent/src/extensibility/extensions/types.ts`. This mirrors only the
 * members the GitLab tools actually touch, because the plugin deliberately carries no
 * runtime dependencies (its devDependencies are `@sinclair/typebox` and `bun-types`), and
 * pulling the whole agent in to name three parameters would be a poor trade.
 *
 * It exists because these parameters were typed `any`, which the governed Biome gate
 * rejects (`lint/suspicious/noExplicitAny`) — and rightly: `pi: any` means a typo in a host
 * call is discovered at runtime, in a demo. If the plugin ever takes `@f5-sales-demo/xcsh`
 * as a dependency, replace this with `import type { ExtensionAPI }` and delete the file;
 * the member names below are deliberately identical so the swap is mechanical.
 */

/** Progress callback handed to a tool's `execute`. Unused by these tools, hence `unknown`. */
export type ToolUpdateCallback = (update: unknown) => void;

/** Per-call context xcsh passes as the final `execute` argument. */
export interface ToolContext {
  cwd: string;
}

/**
 * The host object passed to an extension factory.
 *
 * `registerCommand`, `registerServiceStatus` and `on` are optional because `index.ts`
 * feature-detects them with `typeof pi.x === 'function'` before use — an older host may not
 * provide them, and the type should not pretend otherwise.
 */
export interface PluginHost {
  /** TypeBox re-export, used to declare tool parameter schemas. */
  typebox: { Type: unknown };
  /** Structured logger. */
  logger: { debug: (message: string, ...args: unknown[]) => void };
  /** Run a child process on the host's behalf. */
  exec: (
    command: string,
    args: string[],
    options?: { signal?: AbortSignal; cwd?: string },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  /** The session's working directory. */
  cwd: string;
  /** Set the label shown for this extension in the UI. */
  setLabel: (label: string) => void;
  /** Register an agent tool. */
  registerTool: (tool: unknown) => void;
  /** Register a slash command. Feature-detected in `index.ts`. */
  registerCommand?: (name: string, definition: unknown) => void;
  /** Register a status line entry. Feature-detected in `index.ts`. */
  registerServiceStatus?: (status: unknown) => void;
  /** Subscribe to a host lifecycle event. Feature-detected in `index.ts`. */
  on?: (event: string, handler: (event: unknown, ctx: ToolContext) => unknown) => void;
}
