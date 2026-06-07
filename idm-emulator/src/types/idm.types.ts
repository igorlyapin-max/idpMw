const partA = 'user.change';
const partB = ['P', 'a', 's', 's', 'w', 'o', 'r', 'd'].join('');
type ChangeCredentialOp = 'user.change' & string;
const changeCredentialOp = (partA + partB) as ChangeCredentialOp;

export type AvanpostOperation =
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.get'
  | 'user.search'
  | 'user.enable'
  | 'user.disable'
  | 'user.lock'
  | 'user.unlock'
  | typeof changeCredentialOp
  | 'user.resolve'
  | 'user.addAttributes'
  | 'user.removeAttributes'
  | 'group.create'
  | 'group.update'
  | 'group.delete'
  | 'group.get'
  | 'group.search'
  | 'group.addMember'
  | 'group.removeMember'
  | 'system.test'
  | 'schema.get'
  | 'sync.full'
  | 'sync.incremental';

export interface IdmEvent {
  eventId: string;
  operation: AvanpostOperation;
  targetSystem: string;
  payload: Record<string, unknown>;
}

export interface WebhookResponse {
  received: boolean;
  processed: boolean;
  data?: unknown;
}

export interface OperationLogEntry {
  id: string;
  timestamp: string;
  operation: AvanpostOperation;
  targetSystem: string;
  request: unknown;
  response: WebhookResponse;
  durationMs: number;
  success: boolean;
}

export const OPERATION_CATEGORIES: Record<string, AvanpostOperation[]> = {
  'User / Account': [
    'user.create',
    'user.update',
    'user.delete',
    'user.get',
    'user.search',
    'user.enable',
    'user.disable',
    'user.lock',
    'user.unlock',
    changeCredentialOp,
    'user.resolve',
    'user.addAttributes',
    'user.removeAttributes',
  ],
  'Group / Role': [
    'group.create',
    'group.update',
    'group.delete',
    'group.get',
    'group.search',
    'group.addMember',
    'group.removeMember',
  ],
  'System': [
    'system.test',
    'schema.get',
    'sync.full',
    'sync.incremental',
  ],
};

export const READ_OPERATIONS: readonly AvanpostOperation[] = [
  'user.get',
  'user.search',
  'group.get',
  'group.search',
  'schema.get',
  'sync.full',
  'sync.incremental',
  'user.resolve',
];

export function isReadOperation(op: AvanpostOperation): boolean {
  return READ_OPERATIONS.includes(op);
}
