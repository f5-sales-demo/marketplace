import { readFile } from 'node:fs/promises';

export interface CePublicInterface {
  plugin: string;
  tool: string;
  source: string;
  schemaSource: string;
}
const ceTool =
  /^(?:f5xc_ce_v2_|aws_ce_|azure_ce_|aws_compute_discover$|azure_compute_discover$|aws_cloud_init_analyze$|azure_cloud_init_analyze$)/;

/** Read registered public factory identities without executing a plugin or contacting a provider. */
export async function registeredCePublicInterfaces(): Promise<CePublicInterface[]> {
  const entries: CePublicInterface[] = [];
  for (const plugin of ['platform', 'aws', 'azure', 'terraform']) {
    const index = await readFile(new URL(`../plugins/${plugin}/src/index.ts`, import.meta.url), 'utf8');
    for (const match of index.matchAll(/const\s+\{([^}]+)\}\s*=\s*await import\(['"](\.\/tools\/[^'"]+)['"]\)/g)) {
      for (const factory of match[1].split(',').map((value) => value.trim())) {
        if (!new RegExp(`registerTool\\([^;]*\\b${factory}\\(`).test(index)) continue;
        const source = `plugins/${plugin}/src/${match[2].slice(2)}.ts`;
        const text = await readFile(new URL(`../${source}`, import.meta.url), 'utf8');
        const tool = text.match(/name:\s*['"]([^'"]+)['"]/)?.[1];
        if (!tool) throw Error(`Registered tool identity missing: ${source}`);
        if (ceTool.test(tool)) entries.push({ plugin, tool, source, schemaSource: source });
      }
    }
  }
  if (!entries.length) throw Error('Registered CE public inventory is empty');
  return entries.sort((a, b) => a.tool.localeCompare(b.tool));
}

export function assertCePublicInventory(actual: CePublicInterface[], expected: CePublicInterface[]): void {
  const entries = new Map<string, CePublicInterface>();
  for (const entry of actual) {
    if (entries.has(entry.tool)) throw Error(`Duplicate public CE tool: ${entry.tool}`);
    entries.set(entry.tool, entry);
  }
  for (const entry of expected) {
    const current = entries.get(entry.tool);
    if (!current) throw Error(`Missing registered public CE tool: ${entry.tool}`);
    if (
      current.plugin !== entry.plugin ||
      current.source !== entry.source ||
      current.schemaSource !== entry.schemaSource
    )
      throw Error(`Public CE tool mapping differs: ${entry.tool}`);
    entries.delete(entry.tool);
  }
  if (entries.size) throw Error('Unexpected public CE inventory entries');
}
