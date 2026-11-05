import { AsyncLocalStorage } from 'node:async_hooks';
import { type OwnedFixtureRoots, withOwnedFixtureRoots } from './owned-roots';

const owners = new AsyncLocalStorage<OwnedFixtureRoots>();

/** A nested fixture inherits its creating test's owner across async work. */
export function createOwnedFixtureRoot() {
  const owner = owners.getStore();
  if (!owner) throw Error('Fixture creation requires an explicit owner scope');
  return owner.create();
}

/** Scope the entire body, including late continuation and its cleanup. */
export function withOwnedFixtureRootScope<T>(body: () => Promise<T>) {
  return withOwnedFixtureRoots((owner) => owners.run(owner, body));
}
