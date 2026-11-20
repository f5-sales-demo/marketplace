import { assertOriginalGcpObserverClientAbiContext, type QualifiedGcpObserverClients } from './gcp-observer-client-abi';
import {
  assertOriginalGcpObserverClientAbiRenewalContext,
  type QualifiedGcpObserverRenewalClients,
} from './gcp-observer-client-abi-renewal';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';

export type QualifiedOriginalGcpObserverClients = QualifiedGcpObserverClients | QualifiedGcpObserverRenewalClients;
/** Select an explicit issuer before reading opaque provenance. An expired,
 * retired or unavailable V1 authority cannot fall back to renewal. */
export async function assertOriginalQualifiedGcpObserverClientsContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  if (!value || typeof value !== 'object') throw new Error('Original qualified observer client reference required');
  const reference = value as { schemaVersion?: unknown; kind?: unknown };
  if (reference.schemaVersion === 1 && reference.kind === 'original-gcp-observer-client-abi-reference')
    return Object.freeze({
      ...(await assertOriginalGcpObserverClientAbiContext(value, callback)),
      abiSchemaVersion: 1 as const,
    });
  if (reference.schemaVersion === 2 && reference.kind === 'original-gcp-observer-client-abi-renewal-reference')
    return Object.freeze({
      ...(await assertOriginalGcpObserverClientAbiRenewalContext(value, callback)),
      abiSchemaVersion: 2 as const,
    });
  throw new Error('Original qualified observer client schema and issuer differ');
}
