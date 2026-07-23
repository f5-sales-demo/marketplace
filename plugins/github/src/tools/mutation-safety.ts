export type ApprovalMode = 'interactive' | 'headless-allowed' | 'headless-blocked';

export interface ApprovalContext {
  hasUI?: boolean;
  ui?: { confirm?: unknown };
}

export interface ConfirmUI {
  confirm(title: string, message: string): Promise<boolean>;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  rewrite?: { title: string; message: string };
}

export const HEADLESS_BLOCKED_MESSAGE =
  'Refused: this is a mutating GitHub operation and no interactive confirmation is available ' +
  '(headless/print mode). Re-run interactively, or set GITHUB_ALLOW_MUTATIONS=1 to allow ' +
  'mutations without a prompt.';

export function headlessMutationsAllowed(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.GITHUB_ALLOW_MUTATIONS;
  return value === '1' || value === 'true';
}

export function resolveApprovalMode(
  context: ApprovalContext | undefined,
  env: Record<string, string | undefined> = process.env,
): ApprovalMode {
  const interactive = context?.hasUI === true && typeof context.ui?.confirm === 'function';
  if (interactive) return 'interactive';
  return headlessMutationsAllowed(env) ? 'headless-allowed' : 'headless-blocked';
}

export async function confirmMutation(ui: ConfirmUI, request: ConfirmRequest): Promise<boolean> {
  const approved = await ui.confirm(request.title, request.message);
  if (!approved) return false;
  if (request.rewrite) return ui.confirm(request.rewrite.title, request.rewrite.message);
  return true;
}
