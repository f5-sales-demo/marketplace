import type { AzRawResult } from '../az/types';

/** Keep actionable vendor categories without retaining raw stderr in the public error. */
export class AzureNativeCommandFailure extends Error {
  readonly errorType: 'auth_required' | 'exec_error';
  readonly vendorCode?: 'AADSTS50076' | 'AADSTS50079';

  constructor(actionId: string, result: Pick<AzRawResult, 'exitCode' | 'stderr'>) {
    const matched = /\bAADSTS(50076|50079)\b/i.exec(result.stderr);
    const vendorCode = matched ? (`AADSTS${matched[1]}` as 'AADSTS50076' | 'AADSTS50079') : undefined;
    super(
      `Azure action ${actionId} failed with exit code ${result.exitCode}` +
        (vendorCode
          ? `: Azure authentication requires MFA (${vendorCode}). Run az login and complete the interactive sign-in`
          : ''),
    );
    this.name = 'AzureNativeCommandFailure';
    this.errorType = vendorCode ? 'auth_required' : 'exec_error';
    this.vendorCode = vendorCode;
  }
}
