import { verifyOriginalCleanup } from './cleanup-verifier-worker';

process.umask(0o077); // Child-only permission policy.
try {
  const text = await Bun.stdin.text();
  if (Buffer.byteLength(text) > 65536) throw Error('Oversized request');
  process.stdout.write(JSON.stringify(await verifyOriginalCleanup(JSON.parse(text))));
} catch (error) {
  process.stderr.write(
    error instanceof Error && error.message.startsWith('Independent cleanup')
      ? `${error.message}\n`
      : 'Independent original Terraform cleanup verification failed\n',
  );
  process.exitCode = 1;
}
