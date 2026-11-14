import { test as bunTest } from 'bun:test';
import { withOwnedFixtureRootScope } from './root-scope';

/** Preserve Bun registration and deadlines while scoping fixture ownership. */
export function ownedFixtureBody(body: () => unknown | Promise<unknown>) {
  return () => withOwnedFixtureRootScope(async () => await body());
}

export function test(name: string, body: () => unknown | Promise<unknown>, timeout?: number) {
  return bunTest(name, ownedFixtureBody(body), timeout);
}
