import { resolve } from 'node:path';
export const PLUGIN_VERSION = '1.0.0';
const setup = resolve(import.meta.dir, '..', 'scripts', 'ghostty-setup.py');
export default function ghosttyIntegration(pi: { integrations: { register(definition: unknown): unknown } }) {
  pi.integrations.register({ id: 'ghostty', name: 'Ghostty terminal', plugin: 'ghostty', kind: 'local',
    setup: { pluginDependencies: ['xorg', 'herdr'], requiredEnvironment: [], profileFields: [], steps: [{ kind: 'install', argv: ['python3', setup, 'apply', PLUGIN_VERSION], timeoutMs: 900000 }], verification: [{ argv: ['python3', setup, 'verify', PLUGIN_VERSION], timeoutMs: 30000 }] },
    async probe() { const r = Bun.spawnSync(['python3', setup, 'status', PLUGIN_VERSION], { stdout: 'pipe' }); try { const value = JSON.parse(new TextDecoder().decode(r.stdout)); return r.exitCode === 0 && value.state === 'ready' ? { state: 'ready', value } : { state: 'setup_required', reason: value.reason ?? 'setup_required', value }; } catch { return { state: 'degraded', reason: 'invalid_setup_probe' }; } }
  });
}
