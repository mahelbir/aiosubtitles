import {Enum} from 'enum-plus';

export const ExpectedClass = Enum({
  FITS: {value: 'fits', label: 'fits'},
  CONSTANT: {value: 'constant', label: 'constant'},
  DRIFT: {value: 'drift', label: 'drift'},
  STEPS: {value: 'steps', label: 'steps'},
  RECAP: {value: 'recap', label: 'recap'},
  WRONG: {value: 'wrong', label: 'wrong'},
});
