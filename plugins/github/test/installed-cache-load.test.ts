import { afterEach, describe, expect, it } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('installed marketplace cache', () => {
  it('imports the GitHub tools without package node_modules', async () => {
    const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'xcsh-github-cache-'));
    temporaryDirectories.push(cacheRoot);
    const installedRoot = path.join(cacheRoot, 'github');
    await cp(sourceRoot, installedRoot, {
      recursive: true,
      filter: (source) => path.basename(source) !== 'node_modules',
    });

    const installedPackage = JSON.parse(await Bun.file(path.join(installedRoot, 'package.json')).text()) as {
      version?: string;
      xcsh?: { version?: string };
      peerDependencies?: Record<string, string>;
    };
    const installedManifest = JSON.parse(
      await Bun.file(path.join(installedRoot, '.xcsh-plugin', 'plugin.json')).text(),
    ) as { version?: string };
    expect(installedPackage.version).toBe('3.1.1');
    expect(installedPackage.xcsh?.version).toBe(installedPackage.version);
    expect(installedManifest.version).toBe(installedPackage.version);
    expect(installedPackage.peerDependencies?.['@f5-sales-demo/xcsh']).toBe('>=21.39.1');

    const moduleUrl = pathToFileURL(path.join(installedRoot, 'src', 'tools', 'gh.ts')).href;
    const workflowUrl = pathToFileURL(path.join(installedRoot, 'src', 'tools', 'github-workflow.ts')).href;
    const moduleSource = await Bun.file(fileURLToPath(moduleUrl)).text();
    expect(moduleSource).not.toMatch(/await\s+import\(['"]@sinclair\/typebox['"]\)/);
    expect(moduleSource).not.toContain("'node_modules', '@sinclair', 'typebox'");
    const script = `
      const module = await import(${JSON.stringify(moduleUrl)});
      const scalar = (type) => (options = {}) => ({ type, ...options });
      const Type = {
        Array: (items, options = {}) => ({ type: "array", items, ...options }),
        Boolean: scalar("boolean"),
        Literal: (value) => ({ const: value }),
        Number: scalar("number"),
        Object: (properties) => ({ type: "object", properties }),
        Optional: (schema) => schema,
        String: scalar("string"),
        Union: (variants) => ({ anyOf: variants }),
      };
      module.setTypebox({ Type });
      const tool = new module.GhExecTool({ cwd: ${JSON.stringify(cacheRoot)} });
      if (tool.parameters?.type !== "object" || tool.parameters?.properties?.args?.type !== "array") {
        throw new Error("host-provided typebox did not initialize GitHub tool schemas");
      }
      const workflow = await import(${JSON.stringify(workflowUrl)});
      const tools = workflow.createGitHubWorkflowTools({ Type }, { cwd: ${JSON.stringify(cacheRoot)} });
      const names = tools.map((entry) => entry.name);
      if (!names.includes("github_workflow") || !names.includes("github_worktree_cleanup")) {
        throw new Error("installed cache omitted typed GitHub lifecycle tools");
      }
    `;
    const result = Bun.spawnSync([process.execPath, '-e', script], {
      cwd: cacheRoot,
      env: { ...process.env, NODE_PATH: '' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(new TextDecoder().decode(result.stderr)).toBe('');
    expect(result.exitCode).toBe(0);
  });
});
