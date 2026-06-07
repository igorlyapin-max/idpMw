export interface PayloadTemplate {
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

const userBase = {
  username: 'jdoe',
  email: 'jdoe@example.com',
  firstName: 'John',
  lastName: 'Doe',
};

export const PAYLOAD_TEMPLATES: Record<string, PayloadTemplate> = {
  'user.create': { data: { ...userBase } },
  'user.update': {
    data: { email: 'jdoe-new@example.com' },
    params: { id: 'user-1' },
  },
  'user.delete': { params: { id: 'user-1' } },
  'user.get': { params: { id: 'user-1' } },
  'user.search': { params: { filter: '', limit: 20, offset: 0 } },
  'user.enable': { params: { id: 'user-1' } },
  'user.disable': { params: { id: 'user-1' } },
  'user.lock': { params: { id: 'user-1' } },
  'user.unlock': { params: { id: 'user-1' } },
  'user.resolve': { data: { username: 'jdoe' } },
  'user.addAttributes': {
    data: { groups: ['group-2'] },
    params: { id: 'user-1' },
  },
  'user.removeAttributes': {
    data: { groups: ['group-1'] },
    params: { id: 'user-1' },
  },

  'group.create': {
    data: { name: 'Admins', description: 'Administrator group' },
  },
  'group.update': {
    data: { description: 'Updated description' },
    params: { id: 'group-1' },
  },
  'group.delete': { params: { id: 'group-1' } },
  'group.get': { params: { id: 'group-1' } },
  'group.search': { params: { filter: '', limit: 20, offset: 0 } },
  'group.addMember': { data: { userId: 'user-1' }, params: { id: 'group-1' } },
  'group.removeMember': {
    data: { userId: 'user-1' },
    params: { id: 'group-1' },
  },

  'system.test': {},
  'schema.get': {},
  'sync.full': { params: { objectClass: 'user' } },
  'sync.incremental': {
    params: { objectClass: 'user', marker: 'last-sync-marker' },
  },
};

export function getPayloadTemplate(operation: string): PayloadTemplate {
  return PAYLOAD_TEMPLATES[operation] ?? {};
}
