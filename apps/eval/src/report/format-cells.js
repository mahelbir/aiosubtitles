const SCORE_DIGITS = 3;

export const MISSING_CELL = '—';

export const formatScore = scoreValue =>
  scoreValue === null ? MISSING_CELL : scoreValue.toFixed(SCORE_DIGITS);

export const formatSpread = ({pointEstimate, lowerBound, upperBound}) =>
  `${formatScore(pointEstimate)} [${formatScore(lowerBound)}, ${formatScore(upperBound)}]`;

export const formatTableRow = cells => `| ${cells.join(' | ')} |`;

export const formatTableRule = columnCount =>
  formatTableRow(Array.from({length: columnCount}, () => '---'));
