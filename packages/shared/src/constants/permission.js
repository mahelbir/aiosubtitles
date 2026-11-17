import {Enum} from 'enum-plus';

const Group = Enum({
  GENERAL: {
    value: 'Genel',
  },

  USERS: {
    value: 'Kullanıcılar',
  },
});

export const Permission = Enum({
  ADMIN: {
    value: 'admin',
    label: 'Yönetim paneli',
    group: Group.GENERAL,
  },

  USER_MANAGE_PEER: {
    value: 'user:manage-peer',
    label: 'Kendi seviyesindeki kullanıcıları yönet',
    group: Group.USERS,
  },
});

export const PERMISSION_MAX_LENGTH = 100;
