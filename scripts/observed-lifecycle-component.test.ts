import { expect, test } from 'bun:test';
import { selectObservedLifecycleComponent } from './observed-lifecycle-component';

const strip = (text: string) => Bun.stripANSI(text);
const result = 'asm-migration: ready (setup is not required)';
const leaf = (text: string) => ({ render: (_width: number) => [text] });
const container = (children: any[]) => ({
  children,
  render: (width: number): string[] => children.flatMap((c) => c.render(width)),
});

test('selects the actual nested public component without constructing a replacement', () => {
  const dispatched = leaf(`\u001b[32m${result}\u001b[0m`);
  const root = container([leaf('unrelated'), container([dispatched])]);
  expect(selectObservedLifecycleComponent(root, result, strip)).toBe(dispatched);
});

test('rejects missing and duplicate dispatch instead of claiming a capture', () => {
  expect(() => selectObservedLifecycleComponent(container([leaf('unavailable')]), result, strip)).toThrow('found 0');
  expect(() => selectObservedLifecycleComponent(container([leaf(result), leaf(result)]), result, strip)).toThrow(
    'found 2',
  );
});

test('deduplicates the same public object and guards malformed components', () => {
  const dispatched = leaf(result);
  expect(selectObservedLifecycleComponent(container([dispatched, dispatched]), result, strip)).toBe(dispatched);
  expect(() => selectObservedLifecycleComponent(container([{}]), result, strip)).toThrow('Invalid public component');
  expect(() => selectObservedLifecycleComponent(leaf(result), '', strip)).toThrow('literal expected');
  expect(() => selectObservedLifecycleComponent({ render: () => [42] }, result, strip)).toThrow(
    'Invalid public component rendering',
  );
});
