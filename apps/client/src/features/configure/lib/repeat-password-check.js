import {getCrossFieldCheck} from '@repo/shared/schemas/common.js';

export function getRepeatPasswordCheck(passwordKey, repeatPasswordKey) {
  return getCrossFieldCheck(
    [passwordKey, repeatPasswordKey],
    values => values[passwordKey] === values[repeatPasswordKey],
    {message: 'Passwords do not match', path: [repeatPasswordKey]},
  );
}
