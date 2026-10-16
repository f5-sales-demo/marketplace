/**
 * Execution services used by the GitLab tools. Member names match the injected xcsh host.
 * Shared presentation types come from `@f5-sales-demo/xcsh/presentation`; this narrow
 * interface keeps unrelated application and corpus types out of plugin compilation.
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
 * `registerCommand` and `on` are optional because `index.ts`
 * feature-detects them with `typeof pi.x === 'function'` before use — an older host may not
 * provide them, and the type should not pretend otherwise.
 */
export interface PluginHost {
  /** TypeBox re-export, used to declare tool parameter schemas. */
  typebox: { Type: typeof import('@sinclair/typebox').Type };
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
  /** Subscribe to a host lifecycle event. Feature-detected in `index.ts`. */
  on?: (event: string, handler: (event: unknown, ctx: ToolContext) => unknown) => void;
}
