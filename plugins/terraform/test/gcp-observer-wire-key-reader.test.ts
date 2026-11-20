/** Offline cloud/client/host-key fixtures; actual gated processes and output issuers. */
import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openInstalledGcpCloudSerialReader } from '../src/gcp-cloud-serial-reader';
import { bindOriginalGcpObserverKeyScanCommand } from '../src/gcp-keyscan-command';
import * as observer from '../src/gcp-observer-insert-evidence';
import * as wire from '../src/gcp-observer-wire-key-reader';
import {
  closeOriginalGcpSshClientProfile,
  openGcpSshClientProfile,
  readOriginalGcpSshClientProfile,
} from '../src/gcp-ssh-client-profile';
import { type OriginalExecutionOutput, readOriginalExecutionCompletion } from '../src/original-output-stream';
import * as executor from '../src/signal-free-executor';
import { type ObserverInsertFixtureInput, withObserverInsert } from './fixtures/observer-insert.fixture';
import { authInfo, roots as inventoryRoots } from './original-gcp-inventory-fixture';

const roots: string[] = [];

test('serial trust consumes wire evidence only for its exact VM and actual callback', async () => {
  await withObserverInsert(async (input) => {
    const profile = await clients(),
      target = await vm(input);
    const reader = await wire.openGcpObserverWireKeyReader(target, input.callback, profile, {
      executorFactory: async (policy) => fixtureExecutor(policy, `${line}\n`),
    });
    try {
      const ref = await reader.scan();
      const otherVm = await vm(input);
      const original = await wire.assertOriginalGcpObserverWireKeysOrigin(ref, target, input.callback);
      expect(original.knownHostsLine).toBe(line);
      for (const [source, node, callback] of [
        [{ ...ref }, target, input.callback],
        [ref, { ...target }, input.callback],
        [ref, otherVm, input.callback],
        [ref, target, { ...input.callback }],
      ] as const)
        await expect(wire.assertOriginalGcpObserverWireKeysOrigin(source, node, callback)).rejects.toThrow('Original');
      await wire.assertOriginalGcpObserverWireKeysOrigin(ref, target, input.callback);
    } finally {
      await reader.close();
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);

test('changed retained wire evidence permanently retires its original source', async () => {
  await withObserverInsert(async (input) => {
    const profile = await clients(),
      target = await vm(input);
    const reader = await wire.openGcpObserverWireKeyReader(target, input.callback, profile, {
      executorFactory: async (policy) => fixtureExecutor(policy, `${line}\n`),
    });
    try {
      const ref = await reader.scan();
      const names = (await readdir(input.callback.original.executionDirectory)).filter((name) =>
        name.startsWith('gcp-wire-key-readers-'),
      );
      expect(names).toHaveLength(1);
      const path = join(input.callback.original.executionDirectory, names[0], 'wire-stdout.private.bin');
      const bytes = await readFile(path);
      await rename(path, `${path}.original`);
      await writeFile(path, bytes, { mode: 0o400 });
      await expect(wire.readOriginalGcpObserverWireKeys(ref)).rejects.toThrow();
      await rm(path);
      await rename(`${path}.original`, path);
      await expect(wire.readOriginalGcpObserverWireKeys(ref)).rejects.toThrow('retired');
    } finally {
      await reader.close();
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);

test('reader closure refuses unresolved executor locks and preserves their original evidence', async () => {
  await withObserverInsert(async (input) => {
    const profile = await clients(),
      target = await vm(input);
    let retainedLock = '';
    const reader = await wire.openGcpObserverWireKeyReader(target, input.callback, profile, {
      executorFactory: async () => async (invocation) => {
        retainedLock = join(invocation.cwd, '.terraform-executor-lock');
        await mkdir(retainedLock, { mode: 0o700 });
        await writeFile(join(retainedLock, 'offline-unresolved.private'), 'explicit offline unresolved lock', {
          mode: 0o400,
        });
        throw new Error('Offline unresolved execution');
      },
    });
    try {
      await expect(reader.scan()).rejects.toThrow('Offline unresolved execution');
      await expect(reader.close()).rejects.toThrow('closure unresolved');
      await expect(reader.close()).rejects.toThrow('closure unresolved');
      expect(await readFile(join(retainedLock, 'offline-unresolved.private'), 'utf8')).toBe(
        'explicit offline unresolved lock',
      );
    } finally {
      closeOriginalGcpSshClientProfile(profile);
      // Retain this explicit unresolved fixture instead of deleting its claim.
      for (let index = inventoryRoots.length - 1; index >= 0; index--)
        if (input.callback.original.executionDirectory.startsWith(`${inventoryRoots[index]}/`))
          inventoryRoots.splice(index, 1);
    }
  });
}, 60000);
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const wireString = (bytes: Uint8Array) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
};
const hostKey = Buffer.concat([wireString(Buffer.from('ssh-ed25519')), wireString(Buffer.alloc(32, 7))]);
const line = `192.0.2.7 ssh-ed25519 ${hostKey.toString('base64')}`;
async function clients() {
  const root = await mkdtemp(join(tmpdir(), 'gcp-wire-key-reader-'));
  roots.push(root);
  await mkdir(join(root, 'bin'), { mode: 0o700 });
  const files: Record<string, string> = {};
  const bytes = await readFile('/usr/bin/true'); // Explicit offline native executable, never a key-scan acceptance claim.
  for (const name of ['ssh', 'ssh-keyscan', 'ssh-keygen']) {
    await writeFile(join(root, 'bin', name), bytes, { mode: 0o500 });
    files[name] = hash(bytes);
  }
  return openGcpSshClientProfile(root, { pins: { version: '10.6p2', files } });
}
async function vm(input: ObserverInsertFixtureInput) {
  const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
  return observer.collectOriginalGcpObserverVmEvidence({
    identity,
    callback: input.callback,
    reader: input.cloudReader,
  });
}
async function fixtureExecutor(policy: executor.SignalFreeExecutionPolicy, text: string, callback = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'gcp-wire-source-'));
  roots.push(root);
  const script = join(root, 'wire.py');
  await writeFile(
    script,
    `import sys\nsys.stdout.buffer.write(bytes.fromhex('${Buffer.from(text).toString('hex')}'));sys.stdout.flush()\n`,
    { mode: 0o400 },
  );
  const native = executor.signalFreeTerraformExecutor({
    ...policy,
    executable: policy.python,
    finalCapture: async (capture) => {
      await callback();
      await policy.finalCapture(capture);
    },
  });
  return (invocation: import('../src/runner').Invocation) => native({ ...invocation, args: ['-I', '-B', script] });
}

test('wire-key reader consumes original descriptors and retires after closure', async () => {
  await withObserverInsert(async (input) => {
    const profile = await clients();
    const target = await vm(input);
    const reader = await wire.openGcpObserverWireKeyReader(target, input.callback, profile, {
      executorFactory: async (policy) => fixtureExecutor(policy, `${line}\n`),
    });
    try {
      const ref = await reader.scan();
      const source = await wire.readOriginalGcpObserverWireKeys(ref);
      expect(source.knownHostsLine).toBe(line);
      expect(source.fingerprint).toBe(
        `SHA256:${createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}`,
      );
      expect(source.instanceId).toBe(String(input.operation.targetId));
      expect(source.sshTrustQualified).toBe(false);
      await expect(wire.readOriginalGcpObserverWireKeys({ ...ref })).rejects.toThrow('Original');
      await expect(reader.scan()).rejects.toThrow('single');
      await reader.close();
      await reader.close();
      await expect(wire.readOriginalGcpObserverWireKeys(ref)).rejects.toThrow('retired');
    } finally {
      await reader.close();
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);

for (const [label, text, error] of [
  ['foreign address', `${line.replace('192.0.2.7', '192.0.2.8')}\n`, 'Original VM address'],
  ['duplicate keys', `${line}\n${line}\n`, 'One complete original VM wire key'],
  ['malformed wire fields', '192.0.2.7 ssh-ed25519 AAAA\n', 'Complete canonical original'],
  ['missing keys', '', 'One complete original VM wire key'],
  ['control characters', `${line}\u0000\n`, 'One complete original VM wire key'],
] as const)
  test(`${label} remains incomplete with its specific parsing failure`, async () => {
    await withObserverInsert(async (input) => {
      const profile = await clients(),
        target = await vm(input);
      try {
        const reader = await wire.openGcpObserverWireKeyReader(target, input.callback, profile, {
          executorFactory: async (policy) => fixtureExecutor(policy, text),
        });
        try {
          await expect(reader.scan()).rejects.toThrow(error);
        } finally {
          await reader.close();
        }
      } finally {
        closeOriginalGcpSshClientProfile(profile);
      }
    });
  }, 60000);

test('ownership changes at final capture prevent issuing a wire-key source', async () => {
  await withObserverInsert(async (input) => {
    const profile = await clients(),
      target = await vm(input);
    const reader = await wire.openGcpObserverWireKeyReader(target, input.callback, profile, {
      executorFactory: async (policy) =>
        fixtureExecutor(policy, `${line}\n`, async () => {
          input.vm.id = '18446744073709551610';
        }),
    });
    try {
      await expect(reader.scan()).rejects.toThrow();
      await expect(reader.close()).rejects.toThrow('closure unresolved');
    } finally {
      closeOriginalGcpSshClientProfile(profile);
      for (let index = inventoryRoots.length - 1; index >= 0; index--)
        if (input.callback.original.executionDirectory.startsWith(`${inventoryRoots[index]}/`))
          inventoryRoots.splice(index, 1);
    }
  });
}, 60000);

test('native key-scan mapping refuses replaced arguments, clocks, executable bindings and limits', async () => {
  await withObserverInsert(async (input) => {
    const profile = await clients(),
      target = await vm(input);
    try {
      const command = await bindOriginalGcpObserverKeyScanCommand(target, input.callback, profile);
      const executable = (await readOriginalGcpSshClientProfile(profile)).files['ssh-keyscan'];
      const policy: executor.SignalFreeExecutionPolicy = {
        python: input.callback.original.inputs.python,
        executable,
        originalStartMs: input.callback.original.budget.start,
        originalDeadlineMs: input.callback.original.budget.deadline,
        assertOriginal: async () => {},
        finalCapture: async () => {},
      };
      for (const change of [
        { timeoutMs: 60001 },
        { startupTimeoutMs: 15001 },
        { originalStartMs: policy.originalStartMs + 1 },
        { executable: policy.python },
      ])
        await expect(executor.signalFreeGcpKeyScanExecutor({ ...policy, ...change }, command)).rejects.toThrow();
      const execute = await executor.signalFreeGcpKeyScanExecutor(policy, command);
      await expect(
        execute({
          cwd: input.callback.original.executionDirectory,
          args: ['-q', '-T', '15', '-t', 'ed25519', '-p', '22', '192.0.2.8'],
          env: { LC_ALL: 'C' },
        }),
      ).rejects.toThrow('arguments');
      await expect(executor.signalFreeGcpKeyScanExecutor(policy, { ...command })).rejects.toThrow('Original');
    } finally {
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);

test('native final key scanning consumes the actual parent reserve without relaxing Python reader admission', async () => {
  let original: ObserverInsertFixtureInput | undefined;
  let identity: observer.OriginalGcpObserverInsertIdentity | undefined;
  await withObserverInsert(
    async (input) => {
      original = input;
      identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    },
    undefined,
    async (callback) => {
      if (!original || !identity || !callback.reserve) throw new Error('Original observer final fixture required');
      const source = original;
      const reader = await openInstalledGcpCloudSerialReader(
        callback.original,
        undefined,
        (async (url: string | URL | Request) => {
          const path = new URL(String(url)).pathname;
          if (path === '/token')
            return Response.json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 3599 });
          if (path === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
          if (path === '/v1/projects/example-project')
            return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
          if (path.includes('/operations/')) return Response.json(source.operation);
          if (path.includes('/disks/')) return Response.json(source.disk);
          return Response.json(source.vm);
        }) as typeof fetch,
        { admission: callback.execution, reserve: callback.reserve },
      );
      const profile = await clients();
      try {
        const target = await observer.collectOriginalGcpObserverVmEvidence({ identity, callback, reader });
        const command = await bindOriginalGcpObserverKeyScanCommand(target, callback, profile);
        const executable = (await readOriginalGcpSshClientProfile(profile)).files['ssh-keyscan'];
        let output: OriginalExecutionOutput | undefined;
        let capture: executor.FinalExecutionCapture | undefined;
        const policy: executor.SignalFreeExecutionPolicy = {
          python: callback.original.inputs.python,
          executable,
          originalStartMs: callback.original.budget.start,
          originalDeadlineMs: callback.original.budget.deadline,
          assertOriginal: async () => {},
          beforeRelease: async (admission) => {
            output = admission.output;
          },
          finalCapture: async (value) => {
            capture = value;
            if (!output) throw new Error('Original key-scan output required');
            for (const channel of ['stdout', 'stderr'] as const) while (await output.read(channel)) {}
            readOriginalExecutionCompletion(output, await output.finish());
          },
        };
        expect(() =>
          executor.signalFreeFinalReaderExecutor(policy, callback.reserve as NonNullable<typeof callback.reserve>),
        ).toThrow('interpreter');
        const execute = await executor.signalFreeGcpKeyScanExecutor(policy, command);
        const root = await mkdtemp(join(tmpdir(), 'gcp-final-keyscan-'));
        roots.push(root);
        const result = await execute({
          cwd: resolve(root),
          args: ['-q', '-T', '15', '-t', 'ed25519', '-p', '22', '192.0.2.7'],
          env: { LC_ALL: 'C' },
        });
        expect(result.code).toBe(0); // /usr/bin/true fixture output is deliberately not a host key.
        expect(capture?.finalStartedMs).toBe(callback.reserve.finalStartedMs);
        expect(capture?.finalDeadlineMs).toBe(callback.reserve.finalDeadlineMs);
        expect(capture?.originalDeadlineMs).toBe(callback.original.budget.deadline);
      } finally {
        closeOriginalGcpSshClientProfile(profile);
        await reader.close();
      }
    },
  );
}, 60000);

function startupHooks(policy: executor.SignalFreeExecutionPolicy) {
  const identity = policy.assertOriginalIdentity,
    beforeRelease = policy.beforeRelease;
  if (!identity || !beforeRelease) throw new Error('Original startup identity and release hooks required');
  return { identity, beforeRelease };
}

test('startup identity polling keeps source leases without replaying cloud observations', async () => {
  await withObserverInsert(async (input) => {
    const profile = await clients(),
      target = await vm(input);
    let reads = 0;
    input.cloudHook.run = () => {
      reads++;
    };
    const reader = await wire.openGcpObserverWireKeyReader(target, input.callback, profile, {
      executorFactory: async (policy) => {
        const { identity, beforeRelease } = startupHooks(policy);
        const initial = reads;
        for (let round = 0; round < 3; round++) await identity();
        expect(reads).toBe(initial);
        input.vm.id = '18446744073709551610';
        await expect(beforeRelease({} as executor.ExecutionCaptureAdmission)).rejects.toThrow(
          'Original VM identity changed during cloud capture',
        );
        throw new Error('Offline policy inspected');
      },
    });
    try {
      await expect(reader.scan()).rejects.toThrow('Offline policy inspected');
    } finally {
      await reader.close();
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);

test('startup identity polling permanently rejects a replaced original client file', async () => {
  await withObserverInsert(async (input) => {
    const profile = await clients(),
      target = await vm(input);
    const client = (await readOriginalGcpSshClientProfile(profile)).files['ssh-keyscan'];
    const originalBytes = await readFile(client.path);
    const reader = await wire.openGcpObserverWireKeyReader(target, input.callback, profile, {
      executorFactory: async (policy) => {
        const { identity } = startupHooks(policy);
        await identity();
        await rename(client.path, `${client.path}.original`);
        try {
          await writeFile(client.path, originalBytes, { mode: 0o500 });
          await expect(identity()).rejects.toThrow();
        } finally {
          await rm(client.path);
          await rename(`${client.path}.original`, client.path);
        }
        await expect(identity()).rejects.toThrow('retired');
        throw new Error('Offline client replacement inspected');
      },
    });
    try {
      await expect(reader.scan()).rejects.toThrow('Offline client replacement inspected');
    } finally {
      await reader.close();
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);

test('delayed original cloud observations cannot consume repeated startup polling budgets', async () => {
  await withObserverInsert(async (input) => {
    const profile = await clients(),
      target = await vm(input);
    let capture: executor.FinalExecutionCapture | undefined;
    const reader = await wire.openGcpObserverWireKeyReader(target, input.callback, profile, {
      executorFactory: async (policy) => {
        const { beforeRelease } = startupHooks(policy);
        // The original before-release VM validation still incurs both real
        // offline cloud observations; continuous local polls must not repeat them.
        input.cloudHook.run = async () => {
          await Bun.sleep(2000);
        };
        return fixtureExecutor(
          {
            ...policy,
            beforeRelease: async (admission) => {
              await beforeRelease(admission);
              input.cloudHook.run = undefined;
            },
            finalCapture: async (value) => {
              capture = value;
              await policy.finalCapture(value);
            },
          },
          `${line}\n`,
        );
      },
    });
    try {
      const ref = await reader.scan();
      expect((await wire.readOriginalGcpObserverWireKeys(ref)).knownHostsLine).toBe(line);
      expect(capture?.submitted).toBe(true);
      expect(capture?.reason).toBeUndefined();
      expect(capture?.actualExitCode).toBe(0);
      expect(capture?.originalGroupClosed).toBe(true);
      expect(capture?.signalsSent).toBe(false);
    } finally {
      input.cloudHook.run = undefined;
      await reader.close();
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);
