import {cp, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
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

const FIXTURE_CASE_CODES = ['V90', 'V92'];

export const copyAtlasFixture = async () => {
  const atlasRoot = await mkdtemp(join(tmpdir(), 'eval-atlas-'));
  await cp(ATLAS_FIXTURE_ROOT, atlasRoot, {recursive: true});
  return atlasRoot;
};

export const changeLocalJson = async (atlasRoot, caseCode, change) => {
  const localPath = join(
    atlasRoot,
    'eval',
    'cache',
    'corpus',
    caseCode,
    'local.json',
  );
  const localJson = JSON.parse(await readFile(localPath, 'utf8'));
  change(localJson);
  await writeFile(localPath, JSON.stringify(localJson));
};

export const renamePoolList = (atlasRoot, poolListName) =>
  Promise.all(
    FIXTURE_CASE_CODES.map(caseCode =>
      changeLocalJson(atlasRoot, caseCode, localJson => {
        const {orion: poolList, ...otherLists} = localJson.lists;
        localJson.lists = {...otherLists, [poolListName]: poolList};
      }),
    ),
  );
