import {Enum} from 'enum-plus';

export const MonitorLevel = Enum({
  DEBUG: {value: 'debug'},
  INFO: {value: 'info'},
  SECONDARY: {value: 'secondary'},
  PRIMARY: {value: 'primary'},
  SUCCESS: {value: 'success'},
  WARN: {value: 'warn'},
  ERROR: {value: 'error'},
});
