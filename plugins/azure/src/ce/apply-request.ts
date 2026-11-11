import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import type { AzureCeToolContext } from './artifacts';
import { canonicalSha256 } from './canonical';

export interface AzureCeApplyIdentity {
  planId: string;
  planSha256: string;
}

/** Capture the public request before any asynchronous artifact or service access.
 * Stable copies are passed to owning execution; the seal also detects changes to the caller.
 */
export function captureAzureCeApplyRequest(request: AzureCeApplyIdentity, context: AzureCeToolContext) {
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    Object.keys(request).length !== 2 ||
    Object.keys(request).some((key) => !['planId', 'planSha256'].includes(key)) ||
    typeof request.planId !== 'string' ||
    !request.planId ||
    typeof request.planSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(request.planSha256)
  )
    throw Error('Azure CE apply accepts only the exact persisted plan identity');
  const input = structuredClone(request),
    requestSha256 = canonicalSha256(input),
    environment = process.env,
    environmentSha256 = canonicalSha256(environment),
    cwd = context.cwd,
    hasUI = context.hasUI,
    ui = context.ui,
    confirm = ui.confirm,
    session = context.sessionManager,
    callbacks = [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact],
    sessionId = session.getSessionId(),
    directory = session.getArtifactsDir();
  let contextSeal = () => {};
  const assertUnchanged = () => {
    contextSeal();
    const currentSessionId = session.getSessionId(),
      currentDirectory = session.getArtifactsDir();
    if (
      canonicalSha256(request) !== requestSha256 ||
      canonicalSha256(input) !== requestSha256 ||
      process.env !== environment ||
      canonicalSha256(environment) !== environmentSha256 ||
      context.cwd !== cwd ||
      context.hasUI !== hasUI ||
      context.ui !== ui ||
      ui.confirm !== confirm ||
      context.sessionManager !== session ||
      callbacks.some(
        (callback, index) =>
          callback !==
          [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact][index],
      ) ||
      currentSessionId !== sessionId ||
      currentDirectory !== directory
    )
      throw Error('Azure CE apply request or session changed during execution');
  };
  assertUnchanged();
  const capturedContext: AzureCeToolContext = {
    cwd,
    hasUI,
    sessionManager: guardAzureCeApplyObject(session, assertUnchanged),
    ui: {
      confirm: async (title, message) => {
        assertUnchanged();
        const accepted = await confirm.call(ui, title, message);
        assertUnchanged();
        return accepted;
      },
    },
  };
  const bindPlatformContext = (name?: string) => {
    assertUnchanged();
    if (!name) return;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(name)) throw Error('Azure CE apply named context is invalid');
    const path = join(environment.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'xcsh', 'contexts', `${name}.json`);
    const readIdentity = () => {
      const before = lstatSync(path);
      if (
        !before.isFile() ||
        before.isSymbolicLink() ||
        before.size > 1024 * 1024 ||
        realpathSync(path) !== join(realpathSync(dirname(path)), basename(path))
      )
        throw Error('invalid context file');
      const bytes = readFileSync(path, 'utf8'),
        after = lstatSync(path);
      if (
        !after.isFile() ||
        after.isSymbolicLink() ||
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs
      )
        throw Error('context changed while reading');
      return canonicalSha256({
        bytes,
        dev: after.dev,
        ino: after.ino,
        size: after.size,
        mtimeMs: after.mtimeMs,
        path: realpathSync(path),
      });
    };
    let identity: string;
    try {
      identity = readIdentity();
    } catch {
      throw Error('Azure CE apply named context is unavailable or invalid');
    }
    contextSeal = () => {
      try {
        if (readIdentity() === identity) return;
      } catch {
        /* Keep private bytes and filesystem diagnostics out of errors. */
      }
      throw Error('Azure CE apply named context changed during execution');
    };
    assertUnchanged();
  };
  return { input, context: capturedContext, assertUnchanged, bindPlatformContext };
}

/** Bind only methods that have actually been acquired from a trusted service.
 * Values before first acquisition have no prior identity to compare against.
 */
export function captureAzureCeApplyCallbacks(object: object, names: string[]) {
  const value = object as Record<string, unknown>,
    callbacks = names.map((name) => value[name]);
  return () => {
    if (names.some((name, index) => value[name] !== callbacks[index]))
      throw Error('Azure CE apply service callback changed during execution');
  };
}

/** Seal each acquired callback before invocation and again on success or failure.
 * Invoke on the original receiver so class private fields and internal methods remain valid.
 * Only explicitly acquired service results become guarded collaborators; evidence stays plain data.
 */
export function guardAzureCeApplyObject<T extends object>(
  object: T,
  seal: () => void,
  children: Record<string, (result: object) => object> = {},
  fields: string[] = [],
): T {
  const names = new Set<string>();
  for (
    let prototype: object | null = object;
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  )
    for (const name of Object.getOwnPropertyNames(prototype))
      if (name !== 'constructor' && typeof Object.getOwnPropertyDescriptor(prototype, name)?.value === 'function')
        names.add(name);
  const value = object as Record<string, unknown>,
    callbacks = new Map([...names].map((name) => [name, value[name]])),
    wrappers = new Map<string, (...args: unknown[]) => unknown>(),
    identity = () => canonicalSha256(Object.fromEntries(fields.map((name) => [name, value[name]]))),
    identitySha256 = identity();
  const assertBound = () => {
    seal();
    if ([...callbacks].some(([name, callback]) => value[name] !== callback) || identity() !== identitySha256)
      throw Error('Azure CE apply acquired collaborator changed during execution');
  };
  assertBound();
  return new Proxy(object, {
    get(target, property) {
      assertBound();
      if (typeof property !== 'string' || !callbacks.has(property)) return Reflect.get(target, property, target);
      let wrapper = wrappers.get(property);
      if (!wrapper) {
        const callback = callbacks.get(property) as (...args: unknown[]) => unknown;
        wrapper = (...args) => {
          assertBound();
          const finish = (result: unknown) => {
            assertBound();
            if (!children[property]) return result;
            if (!result || typeof result !== 'object')
              throw Error('Azure CE apply acquired service result is malformed');
            return children[property](result);
          };
          try {
            const result = callback.apply(object, args);
            if (result && typeof (result as Promise<unknown>).then === 'function')
              return Promise.resolve(result).then(finish, (error: unknown) => {
                assertBound();
                throw error;
              });
            return finish(result);
          } catch (error) {
            assertBound();
            throw error;
          }
        };
        wrappers.set(property, wrapper);
      }
      return wrapper;
    },
  });
}

export function guardAzureCeApplyServices(
  seal: () => void,
  api: AzExecApi,
  platform: CePlatformService,
  terraform?: CeTerraformService,
) {
  return {
    api: guardAzureCeApplyObject(api, seal),
    platform: guardAzureCeApplyObject(platform, seal, {
      storage: (store) => guardAzureCeApplyObject(store, seal, {}, ['owner', 'directory']),
      runtime: (runtime) => guardAzureCeApplyObject(runtime, seal),
    }),
    terraform:
      terraform &&
      guardAzureCeApplyObject(terraform, seal, {
        open: (session) => guardAzureCeApplyObject(session, seal),
      }),
  };
}
