import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const content = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('org-status examples route to credential-filtered native tools', () => {
  const operator = content('agents/cli-operator.md');
  const commands = operator.split('## Common Commands')[1].split('## Error Recovery')[0];
  const orgRows = commands.split('\n').filter((line) => /\| (Default org status|Org info)/.test(line));
  expect(orgRows).toHaveLength(2);
  for (const row of orgRows) {
    expect(row).toContain('sf_org_display');
    expect(row).not.toContain('--json');
  }
  const router = content('skills/salesforce-index/SKILL.md');
  const status = router.split('Org status check')[1].split('### Account')[0];
  expect(status).toContain('sf_org_display');
  expect(status).not.toMatch(/Run sf org (?:list|display)/);
});

test('authentication recovery uses the human-owned canonical setup route', () => {
  const operator = content('agents/cli-operator.md');
  const recovery = operator.split('## Error Recovery')[1];
  for (const row of recovery
    .split('\n')
    .filter((line) => /command not found|No default org|INVALID_SESSION_ID/.test(line))) {
    expect(row).toContain('xcsh plugin setup salesforce');
    expect(row).not.toMatch(/sf org login|brew install/);
  }
  expect(content('skills/salesforce-auth/SKILL.md')).toContain('Do not run Salesforce login');
});
