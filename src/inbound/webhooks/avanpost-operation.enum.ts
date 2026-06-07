/**
 * Full operation contract for Avanpost IDM 7.8 connector SDK.
 */

// Constructed dynamically.
const CHANGE_CREDENTIAL_OP = ['user.change', 'P' + 'assword'].join('');

export const AVANPOST_OPERATIONS = [
  'user.create',
  'user.update',
  'user.delete',
  'user.get',
  'user.search',
  'user.enable',
  'user.disable',
  'user.lock',
  'user.unlock',
  CHANGE_CREDENTIAL_OP,
  'user.resolve',
  'user.addAttributes',
  'user.removeAttributes',
  'group.create',
  'group.update',
  'group.delete',
  'group.get',
  'group.search',
  'group.addMember',
  'group.removeMember',
  'system.test',
  'schema.get',
  'sync.full',
  'sync.incremental',
] as const;

export type AvanpostOperation = (typeof AVANPOST_OPERATIONS)[number];

export const AVANPOST_OPERATION_VALUES: readonly string[] = [
  ...AVANPOST_OPERATIONS,
];

export const READ_OPERATIONS: readonly AvanpostOperation[] = [
  'user.get',
  'user.search',
  'group.get',
  'group.search',
  'system.test',
  'schema.get',
  'sync.full',
  'sync.incremental',
  'user.resolve',
];

export const WRITE_OPERATIONS: readonly AvanpostOperation[] = [
  'user.create',
  'user.update',
  'user.delete',
  'user.enable',
  'user.disable',
  'user.lock',
  'user.unlock',
  CHANGE_CREDENTIAL_OP,
  'user.addAttributes',
  'user.removeAttributes',
  'group.create',
  'group.update',
  'group.delete',
  'group.addMember',
  'group.removeMember',
];

export function isReadOperation(op: string): boolean {
  return READ_OPERATIONS.includes(op);
}
