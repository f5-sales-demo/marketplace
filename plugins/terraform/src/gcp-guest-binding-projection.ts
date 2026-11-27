import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';
import type { CeOwner } from '../../platform/src/ce/runtime';

export interface GcpGuestBindingFields {
  readonly project: string;
  readonly region: string;
  readonly site_name: string;
  readonly node_name: string;
  readonly zone: string;
  readonly instance_id: string;
  readonly observer_name: string;
  readonly observer_id: string;
  readonly observer_address: string;
  readonly address: string;
  readonly original_interfaces: readonly string[];
  readonly token_node: string;
  readonly token_site: string;
  readonly token_expires: number;
  readonly token_sha256: string;
  readonly ownership_sha256: string;
  readonly observer_key: string;
  readonly ce_key: string;
  readonly observer_hosts: string;
  readonly ce_hosts: string;
  readonly observer_algorithm: 'ssh-ed25519';
  readonly ce_algorithm: 'rsa-sha2-512';
}
export interface GcpGuestBindingProjectionInput {
  readonly owner: CeOwner;
  readonly vm: {
    readonly project: string;
    readonly zone: string;
    readonly nodeName: string;
    readonly siteName: string;
    readonly instanceId: string;
    readonly interfaces: readonly string[];
    readonly expiresAt: string;
    readonly jwtSha256: string;
    readonly ownershipSha256: string;
  };
  readonly observer: {
    readonly project: string;
    readonly zone: string;
    readonly name: string;
    readonly instanceId: string;
    readonly externalAddress: string;
  };
  readonly target: {
    readonly project: string;
    readonly zone: string;
    readonly nodeName: string;
    readonly instanceId: string;
    readonly address: string;
    readonly interfaceIndex: 1;
    readonly role: 'sli';
  };
  readonly paths: Pick<GcpGuestBindingFields, 'observer_key' | 'ce_key' | 'observer_hosts' | 'ce_hosts'>;
}
const uint64 = (value: string) =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
const name = (value: string) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(value);
/** Pure consistency projection. Only the enclosing original-source binder may
 * supply this to a worker after verifying its native/SDK/VM/trust issuers.
 * A packet, finite clock or matching fields never grants execution authority. */
export function projectGcpGuestBinding(input: GcpGuestBindingProjectionInput, nowMs: number) {
  const { owner, vm, observer, target, paths } = input;
  if (
    owner.provider !== 'gcp' ||
    owner.engine !== 'terraform' ||
    ![
      owner.account,
      owner.region,
      owner.deploymentId,
      vm.project,
      vm.zone,
      vm.nodeName,
      vm.siteName,
      observer.name,
      observer.zone,
    ].every(name) ||
    vm.project !== owner.account ||
    observer.project !== owner.account ||
    target.project !== owner.account ||
    !vm.zone.startsWith(`${owner.region}-`) ||
    !observer.zone.startsWith(`${owner.region}-`) ||
    !uint64(vm.instanceId) ||
    !uint64(observer.instanceId) ||
    vm.instanceId === observer.instanceId ||
    vm.nodeName === observer.name ||
    target.instanceId !== vm.instanceId ||
    target.nodeName !== vm.nodeName ||
    target.zone !== vm.zone ||
    target.interfaceIndex !== 1 ||
    target.role !== 'sli' ||
    vm.interfaces.length !== 2 ||
    vm.interfaces[0] === vm.interfaces[1] ||
    target.address !== vm.interfaces[1] ||
    ![...vm.interfaces, observer.externalAddress, target.address].every((address) => isIP(address) === 4) ||
    vm.interfaces.includes(observer.externalAddress) ||
    !/^[a-f0-9]{64}$/.test(vm.jwtSha256) ||
    !/^[a-f0-9]{64}$/.test(vm.ownershipSha256)
  )
    throw new Error('Original guest identity, token or NIC consistency differs');
  const expires = Date.parse(vm.expiresAt);
  if (!Number.isFinite(nowMs) || nowMs <= 0 || !Number.isFinite(expires) || expires <= nowMs)
    throw new Error('Original guest token expiry is invalid or expired');
  const values = Object.values(paths);
  if (
    Object.keys(paths).sort().join(',') !== 'ce_hosts,ce_key,observer_hosts,observer_key' ||
    values.some(
      (path) =>
        typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || !/^\/[A-Za-z0-9_./-]+$/.test(path),
    ) ||
    new Set(values).size !== 4
  )
    throw new Error('Original guest key/host paths are unsafe or aliased');
  const binding: Readonly<GcpGuestBindingFields> = Object.freeze({
    project: owner.account,
    region: owner.region,
    site_name: vm.siteName,
    node_name: vm.nodeName,
    zone: vm.zone,
    instance_id: vm.instanceId,
    observer_name: observer.name,
    observer_id: observer.instanceId,
    observer_address: observer.externalAddress,
    address: target.address,
    original_interfaces: Object.freeze([...vm.interfaces]),
    token_node: vm.nodeName,
    token_site: vm.siteName,
    token_expires: expires / 1000,
    token_sha256: vm.jwtSha256,
    ownership_sha256: vm.ownershipSha256,
    observer_key: paths.observer_key,
    ce_key: paths.ce_key,
    observer_hosts: paths.observer_hosts,
    ce_hosts: paths.ce_hosts,
    observer_algorithm: 'ssh-ed25519',
    ce_algorithm: 'rsa-sha2-512',
  });
  return Object.freeze({ binding, commandsAuthorized: false as const, guestAcceptanceComplete: false as const });
}
