import {join} from 'node:path';

export const ATLAS_FIXTURE_ROOT = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'atlas-mini',
);

export const V90_LIST_SHA256 =
  'efbbfa80dc39bf85141bfbb8d380128330b8221bb2b389f7014a58defc5bc5cd';

export const FIXTURE_PRIVATE_VALUES = [
  'Fixture.Show.S01E01.1080p.WEB-FAKE.mkv',
  'Fixture.Film.2019.1080p.mp4',
  'Fixture.Show.S01E01.1080p.WEB-FAKE',
  '0123456789abcdef',
  'fedcba9876543210',
];
