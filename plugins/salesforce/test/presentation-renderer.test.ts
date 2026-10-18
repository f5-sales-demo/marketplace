import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';

const theme = {
  fg: (_key: string, text: string) => text,
  bold: (text: string) => text,
  boxSharp: {
    horizontal: '-',
    vertical: '|',
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    teeDown: '+',
    teeUp: '+',
    teeLeft: '+',
    teeRight: '+',
    cross: '+',
  },
};
test('actual render width keeps fitting commands literal and shows ordinary tables completely', () => {
  const tool = presentTool({ name: 'sf_query' }, presentation);
  const args = { query: 'SELECT Name FROM Account' };
  const result = {
    content: [],
    details: {
      queryResult: {
        records: Array.from({ length: 15 }, (_, i) => ({ Name: `Example ${i}` })),
        done: true,
        totalSize: 15,
      },
    },
  };
  const render = tool.renderResult(result, { expanded: false, isPartial: false }, theme, args);
  const wide = render.render(120).join('\n');
  expect(wide).toContain("sf data query --query 'SELECT Name FROM Account' --json");
  expect(wide).not.toContain('\\\n');
  expect(wide).toContain('Example 11');
  expect(wide).not.toContain('Example 12');
  expect(wide).toContain('3 more rows in expanded details');
  expect(render.render(40).join('\n')).toContain('\\');
  const expanded = tool.renderResult(result, { expanded: true, isPartial: false }, theme, args).render(120).join('\n');
  expect(expanded).toContain('Example 14');
  expect(expanded).toContain('Arguments');
});
