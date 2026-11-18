import {Enum} from 'enum-plus';

export const ComparisonOutcome = Enum({
  WIN: {value: 'win', label: 'win'},
  LOSS: {value: 'loss', label: 'loss'},
  TIE: {value: 'tie', label: 'tie'},
});
