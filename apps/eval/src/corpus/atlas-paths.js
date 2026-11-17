import {join} from 'node:path';

const CANDIDATES_DATA_FILE_NAMES = [
  'candidates.json',
  'candidates-extra.json',
  'candidates-legacy.json',
];

export const atlasPaths = {
  corpusIndex: atlasRoot => join(atlasRoot, 'eval', 'corpus', 'index.json'),
  caseJson: (atlasRoot, caseCode) =>
    join(atlasRoot, 'eval', 'corpus', caseCode, 'case.json'),
  localJson: (atlasRoot, caseCode) =>
    join(atlasRoot, 'eval', 'cache', 'corpus', caseCode, 'local.json'),
  frozenBlob: (atlasRoot, sha256) =>
    join(
      atlasRoot,
      'eval',
      'cache',
      'frozen',
      'sha256',
      sha256.slice(0, 2),
      sha256,
    ),
  identities: atlasRoot =>
    join(atlasRoot, 'docs', 'research', 'private', 'identities.json'),
  candidatesData: atlasRoot =>
    CANDIDATES_DATA_FILE_NAMES.map(fileName =>
      join(
        atlasRoot,
        'docs',
        'research',
        '2026-11-16-eval-corpus-candidates-data',
        fileName,
      ),
    ),
};
