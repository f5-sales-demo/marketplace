import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Use an exact installed published runtime, including its actual parser and registry declaration.
const runtimePackage = process.env.XCSH_VALIDATION_PACKAGE;
if (!runtimePackage) throw new Error('Set XCSH_VALIDATION_PACKAGE to the published xcsh package.json');
const runtimeRoot = path.dirname(runtimePackage);
const { parseFrontmatter } = await import(path.resolve(runtimeRoot, '../pi-utils/src/index.ts'));
const { parseAgent } = await import(path.join(runtimeRoot, 'src/task/agents.ts'));
// Read the published registry declaration without importing optional UI workspaces.
const registrySource = await readFile(path.join(runtimeRoot, 'src/tools/index.ts'), 'utf8');
const registryBlocks = [
  ...registrySource.matchAll(/export const (?:BUILTIN_TOOLS|HIDDEN_TOOLS):[^=]+=[ ]*\{([\s\S]*?)\n\};/g),
];
if (registryBlocks.length !== 2) throw new Error('Published runtime registry contract changed');
const root = process.argv[2] ?? path.join(import.meta.dir, '..');
const pluginRoot = path.join(root, 'plugins');
const knownTools = new Set(
  registryBlocks.flatMap((block) => [...block[1].matchAll(/^\s*(\w+):/gm)].map((match) => match[1])),
);
// The browser factory registers puppeteer; inspect the published class name.
const browserSource = await readFile(path.join(runtimeRoot, 'src/tools/browser.ts'), 'utf8');
const browserName = browserSource.match(/readonly name = "([^"]+)"/)?.[1];
if (!browserName) throw new Error('Published browser tool name unavailable');
knownTools.delete('browser');
knownTools.add(browserName);
const agents: Array<{ name: string; tools: string[]; spawns?: string[] }> = [];
const errors: string[] = [];
for (const plugin of await readdir(pluginRoot)) {
  const agentDir = path.join(pluginRoot, plugin, 'agents');
  for (const file of await readdir(agentDir).catch(() => [])) {
    if (!file.endsWith('.md')) continue;
    const source = path.join(agentDir, file);
    const content = await readFile(source, 'utf8');
    const { frontmatter } = parseFrontmatter(content);
    const parsed = parseAgent(source, content, 'project');
    const name = `${plugin}:${parsed.name}`;
    if ('disallowedTools' in frontmatter) errors.push(`${name}: ignored disallowedTools`);
    if (!Array.isArray(frontmatter.tools) || frontmatter.tools.length === 0)
      errors.push(`${name}: explicit tools required`);
    const tools = parsed.tools ?? [];
    for (const tool of tools) {
      // Native plugin names must actually occur in native declarations, never invented aliases.
      if (!knownTools.has(tool)) {
        const result = Bun.spawnSync(['rg', '-U', '-l', '--glob', '*.ts', `name[: =]+["']${tool}["']|tool\\(\\s*["']${tool}["']`, path.join(pluginRoot, plugin, 'src')]);
        if (result.exitCode !== 0) errors.push(`${name}: unknown tool ${tool}`);
      }
    }
    if (frontmatter.tools?.some((tool: string) => tool !== tool.toLowerCase()))
      errors.push(`${name}: canonical lowercase tools required`);
    if (parsed.spawns === '*') errors.push(`${name}: explicit child references required`);
    if (tools.includes('task') && (!Array.isArray(frontmatter.spawns) || !frontmatter.spawns.length))
      errors.push(`${name}: task requires explicit spawns`);
    if (!tools.includes('task') && parsed.spawns?.length) errors.push(`${name}: spawns requires task`);
    agents.push({ name, tools, spawns: Array.isArray(parsed.spawns) ? parsed.spawns : undefined });
  }
  const commandDir = path.join(pluginRoot, plugin, 'commands');
  for (const file of await readdir(commandDir).catch(() => [])) {
    if (!file.endsWith('.md')) continue;
    const { frontmatter } = parseFrontmatter(await readFile(path.join(commandDir, file), 'utf8'));
    for (const field of ['allowed_tools', 'allowed-tools']) {
      if (field in frontmatter) errors.push(`${plugin}:${file}: ignored ${field}`);
    }
  }
}
for (const agent of agents) {
  for (const child of agent.spawns ?? []) {
    if (!agents.some((candidate) => candidate.name === child)) errors.push(`${agent.name}: unknown child ${child}`);
  }
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(
  `Validated ${agents.length} agents against published xcsh ${JSON.parse(await readFile(runtimePackage, 'utf8')).version}`,
);
