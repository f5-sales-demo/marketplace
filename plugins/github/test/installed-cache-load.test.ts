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

    const moduleUrl = pathToFileURL(path.join(installedRoot, 'src', 'tools', 'gh.ts')).href;
    const moduleSource = await Bun.file(fileURLToPath(moduleUrl)).text();
    expect(moduleSource).not.toMatch(/await\s+import\(['"]@sinclair\/typebox['"]\)/);
    expect(moduleSource).not.toContain("'node_modules', '@sinclair', 'typebox'");
    const script = `
      const module = await import(${JSON.stringify(moduleUrl)});
      const scalar = (type) => (options = {}) => ({ type, ...options });
      const Type = {
        Array: (items, options = {}) => ({ type: "array", items, ...options }),
        Boolean: scalar("boolean"),
        Number: scalar("number"),
        Object: (properties) => ({ type: "object", properties }),
        Optional: (schema) => schema,
        String: scalar("string"),
      };
      module.setTypebox({ Type });
      const tool = new module.GhExecTool({ cwd: ${JSON.stringify(cacheRoot)} });
      if (tool.parameters?.type !== "object" || tool.parameters?.properties?.args?.type !== "array") {
        throw new Error("host-provided typebox did not initialize GitHub tool schemas");
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
