import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const INSTALLED_XORGCTL = resolve(homedir(), '.local', 'bin', 'xorgctl');
export interface DesktopInput {
  session?: string;
  command: string;
  action?: string;
  params?: Record<string, unknown>;
}
export const controllerArgv = (input: DesktopInput) => [
  INSTALLED_XORGCTL,
  ...(input.session ? ['--session', input.session] : []),
  '--json',
  input.command,
  ...(input.action ? [input.action] : []),
  '--params',
  JSON.stringify(input.params ?? {}),
];
