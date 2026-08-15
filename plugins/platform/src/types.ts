export interface PlatformToolApi {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
}

export interface PlatformSessionManager {
  getSessionId(): string;
  saveArtifact(content: string, toolType: string): Promise<string | undefined>;
}

export interface PlatformToolContext {
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean> };
  sessionManager: PlatformSessionManager;
}
