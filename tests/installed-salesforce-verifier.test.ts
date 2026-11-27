import { expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('verification injects published presentation without executing setup or printing tool data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'installed-sf-verifier-'));
  const runtime = join(root, 'runtime'),
    plugin = join(root, 'plugin');
  try {
    for (const path of [
      'runtime/src/host',
      'runtime/src/extensibility',
      'runtime/node_modules/@sinclair/typebox',
      'plugin/src',
      'plugin/src/sf',
      'private',
      'plugin/.xcsh-plugin',
    ])
      mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(runtime, 'package.json'), JSON.stringify({ version: '23.5.1' }));
    writeFileSync(join(plugin, '.xcsh-plugin/plugin.json'), JSON.stringify({ name: 'salesforce', version: '2.3.11' }));
    writeFileSync(join(runtime, 'node_modules/@sinclair/typebox/package.json'), JSON.stringify({ main: 'index.js' }));
    writeFileSync(join(runtime, 'node_modules/@sinclair/typebox/index.js'), 'exports.Type = {};');
    const config = join(root, 'private', 'config.json');
    chmodSync(join(root, 'private'), 0o700);
    writeFileSync(config, JSON.stringify({ version: 1, orgs: { '00D000000000001': {} } }), { mode: 0o600 });
    writeFileSync(
      join(plugin, 'src/configuration.ts'),
      `export const configurationPath=()=>${JSON.stringify(config)}; export const readConfiguration=async()=>JSON.parse(await Bun.file(configurationPath()).text());`,
    );
    writeFileSync(
      join(plugin, 'src/sf/sanitize.ts'),
      `export {sanitize} from ${JSON.stringify(resolve(import.meta.dir, '../plugins/salesforce/src/sf/sanitize.ts'))};`,
    );
    const fakeSf = '/synthetic/sf';
    // The CLI fixture models Linux; it must not depend on an ambient Homebrew file.
    const preload = join(root, 'fixture-platform.ts');
    writeFileSync(preload, "Object.defineProperty(process, 'platform', { value: 'linux' });");
    writeFileSync(
      join(runtime, 'src/host/host.ts'),
      `export const host={findExecutable:()=>${JSON.stringify(fakeSf)}};`,
    );
    writeFileSync(join(runtime, 'src/host/software.ts'), 'export const software={};');
    writeFileSync(
      join(runtime, 'src/extensibility/presentation.ts'),
      'export const presentation={withPresentation:tool=>({...tool,presentation:{result(){return {sections:[]}}}})};',
    );
    writeFileSync(
      join(plugin, 'src/index.ts'),
      `export default function(pi){if(!pi.presentation) throw new Error('Missing injected presentation API'); pi.integrations.register({prepareSetup:async()=>({steps:[{kind:'login',argv:[${JSON.stringify(fakeSf)},'org','login','web','--set-default','--instance-url','https://example.com']}],validate:async()=>{}}),probe:async()=>({state:process.env.SYNTHETIC_SF_READINESS ?? 'ready',value:{userId:'005000000000001',orgId:'00D000000000001'}})}); for(const name of ['sf_query','sf_describe','sf_org_display','sf_pipeline_report','sf_help','sf_exec']) pi.registerTool(pi.presentation.withPresentation({name,execute:async()=>({details:{accessToken:process.env.SYNTHETIC_LEAK_CREDENTIAL ? 'PRIVATE_SENTINEL' : '[REDACTED]'},content:[{type:'text',text:'PRIVATE_SENTINEL'}]})}));}`,
    );
    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        preload,
        resolve(import.meta.dir, '../scripts/verify-installed-salesforce.ts'),
        runtime,
        plugin,
        'acceptance',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, SF_ACCEPTANCE_EVIDENCE: join(root, 'private-evidence') },
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, stderr).toBe(0);
    expect(stdout).not.toContain('PRIVATE_SENTINEL');
    const receipt = JSON.parse(stdout.trim());
    expect(receipt.tools).toHaveLength(6);
    expect(receipt.readOnlyToolsPassed).toBe(true);
    expect(receipt.readOnlyTools).toHaveLength(6);
    expect(receipt.configurationHydrated).toBe(true);
    expect(receipt.runtimePackageVersion).toBe('23.5.1');
    expect(receipt.installedPluginVersion).toBe('2.3.11');
    expect(receipt.setupExecuted).toBe(false);
    expect(receipt.evidenceTier).toBe('installed-plugin-module');
    const blocked = Bun.spawn(
      [
        process.execPath,
        '--preload',
        preload,
        resolve(import.meta.dir, '../scripts/verify-installed-salesforce.ts'),
        runtime,
        plugin,
        'acceptance',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          SYNTHETIC_SF_READINESS: 'setup_required',
          SF_ACCEPTANCE_EVIDENCE: join(root, 'private-evidence'),
        },
      },
    );
    const [blockedText, blockedError, blockedCode] = await Promise.all([
      new Response(blocked.stdout).text(),
      new Response(blocked.stderr).text(),
      blocked.exited,
    ]);
    expect(blockedCode, blockedError).toBe(1);
    const blockedReceipt = JSON.parse(blockedText);
    expect(blockedReceipt.state).toBe('setup_required');
    expect(blockedReceipt.blocked).toBe(true);
    expect(blockedReceipt.nextAction).toContain('host authorized');
    expect(blockedReceipt.readOnlyToolAttempted).toBe(false);
    expect(blockedReceipt.setupExecuted).toBe(false);
    expect(blockedText).not.toContain('PRIVATE_SENTINEL');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
