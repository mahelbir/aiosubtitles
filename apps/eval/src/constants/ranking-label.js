import {Enum} from 'enum-plus';
import {ExpectedClass} from './expected-class.js';

export const RankingLabel = Enum({
  Y1: {
    value: 'Y1',
    positiveClasses: [ExpectedClass.FITS],
    negativeClasses: [ExpectedClass.WRONG],
  },
  Y2: {
    value: 'Y2',
    positiveClasses: [ExpectedClass.FITS, ExpectedClass.CONSTANT],
    negativeClasses: [ExpectedClass.WRONG],
  },
});
