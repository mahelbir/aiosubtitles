import {Enum} from 'enum-plus';

export const ROLE_SLUG_MIN_LENGTH = 2;
export const ROLE_SLUG_MAX_LENGTH = 50;
export const ROLE_LABEL_MIN_LENGTH = 2;
export const ROLE_LABEL_MAX_LENGTH = 100;
export const ROLE_POSITION_MIN = 1;
export const ROLE_POSITION_MAX = 1000000;
export const ROLE_POSITION_STEP = 1000;

export const RolePlacement = Enum({
  ABOVE: {value: 'above', label: 'Üstüne'},
  SAME: {value: 'same', label: 'Aynı seviyeye'},
  BELOW: {value: 'below', label: 'Altına'},
});

export const RoleDirection = Enum({
  UP: {value: 'up', label: 'Yukarı taşı'},
  DOWN: {value: 'down', label: 'Aşağı taşı'},
});
