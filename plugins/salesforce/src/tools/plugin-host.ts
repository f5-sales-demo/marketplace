/** The injected schema module used by Salesforce tool factories. */
export interface PluginHost {
  typebox: typeof import('@sinclair/typebox');
}
/** Progress callback handed to a tool execute call. */
export type ToolUpdateCallback = (update: unknown) => void;
/** Working directory supplied for each tool call. */
export interface ToolContext {
  cwd: string;
}
