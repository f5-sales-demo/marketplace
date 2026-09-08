import type { AwsExecApi } from '../aws/exec';

/** Bind every CE command to its selected profile without changing AWS CLI defaults. */
export function scopedAwsApi(api: AwsExecApi, profile?: string, signal?: AbortSignal): AwsExecApi {
  if (profile !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$/.test(profile))
    throw new Error('Invalid AWS profile');
  return {
    async exec(command, args, options) {
      if (command !== 'aws') throw new Error('CE AWS executor accepts only AWS commands');
      const cancellation = options?.signal ?? signal;
      cancellation?.throwIfAborted();
      const existing = args.indexOf('--profile');
      if (args.some((arg) => arg.startsWith('--profile=')) || (existing >= 0 && args[existing + 1] !== profile))
        throw new Error('AWS command profile differs from deployment');
      return api.exec(command, profile && existing < 0 ? [...args, '--profile', profile] : args, {
        signal: cancellation,
      });
    },
  };
}
