/** Select an already dispatched component using the public TUI container API. */
export function selectObservedLifecycleComponent(tui: any, expectedText: string, stripANSI: (text: string) => string) {
  if (!expectedText.trim()) throw new Error('A literal expected lifecycle result is required');
  const seen = new Set<any>();
  const matches: any[] = [];
  const visit = (node: any): boolean => {
    if (seen.has(node)) return false;
    if (!node || typeof node.render !== 'function') throw new Error('Invalid public component tree');
    seen.add(node);
    if (seen.size > 10000) throw new Error('Public component tree exceeds inspection limit');
    let descendantMatch = false;
    if (Array.isArray(node.children))
      for (const child of node.children) descendantMatch = visit(child) || descendantMatch;
    const lines = node.render(153);
    if (!Array.isArray(lines) || lines.some((line) => typeof line !== 'string'))
      throw new Error('Invalid public component rendering');
    const ownMatch = stripANSI(lines.join('\n')).includes(expectedText);
    if (ownMatch && !descendantMatch) matches.push(node);
    return ownMatch || descendantMatch;
  };
  visit(tui);
  if (matches.length !== 1) throw new Error(`Expected one dispatched lifecycle result; found ${matches.length}`);
  return matches[0];
}
