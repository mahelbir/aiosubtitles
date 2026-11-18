import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {readOwnNames} from '../../src/parser-test/datasets/own-names.js';
import {ParserLabelError} from '../../src/parser-test/own-labels.js';
import {
  exportParserNames,
  exportPendingItems,
  GuessitOutputError,
  parseGuessitOutput,
  readLibraryReadings,
  runParserTest,
} from '../../src/parser-test/run-parser-test.js';
import {ATLAS_FIXTURE_ROOT} from '../support/atlas-fixture.js';

const REFERENCE_FIXTURE_ROOT = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'reference-mini',
);
const REFERENCE_COMMITS = {
  guessit: 'a'.repeat(40),
  Sonarr: 'b'.repeat(40),
  PTT: 'c'.repeat(40),
  'go-ptt': 'd'.repeat(40),
};

const buildGuessitOutput = releaseNames => ({
  guessitVersion: '4.5.1',
  parsedByName: Object.fromEntries(
    releaseNames.map(releaseName => [
      releaseName,
      {title: releaseName.split('.')[0], type: 'movie'},
    ]),
  ),
});

describe('parseGuessitOutput', () => {
  it('reads a dump of the pinned version that covers every name', () => {
    const guessitOutput = buildGuessitOutput(['A.Name', 'B.Name']);
    expect(
      parseGuessitOutput(JSON.stringify(guessitOutput), ['A.Name', 'B.Name']),
    ).toEqual(guessitOutput);
  });

  it('refuses a dump from another guessit version', () => {
    expect(() =>
      parseGuessitOutput(
        JSON.stringify({
          ...buildGuessitOutput(['A.Name']),
          guessitVersion: '3.8.0',
        }),
        ['A.Name'],
      ),
    ).toThrow('The guessit output must come from guessit 4.5.1.');
  });

  it('refuses a dump that misses names, without naming them', () => {
    expect(() =>
      parseGuessitOutput(JSON.stringify(buildGuessitOutput(['A.Name'])), [
        'A.Name',
        'Private.Missing.Name',
      ]),
    ).toThrow('The guessit output misses 1 release names.');
  });

  it('counts every name as missing from a dump without readings', () => {
    expect(() =>
      parseGuessitOutput(JSON.stringify({guessitVersion: '4.5.1'}), ['A.Name']),
    ).toThrow('The guessit output misses 1 release names.');
  });

  it('refuses text that is not JSON without quoting it', () => {
    expect(() => parseGuessitOutput('{"parsedByName": Private', [])).toThrow(
      GuessitOutputError,
    );
  });
});

describe('exportParserNames', () => {
  it('lists the own names and every external name once, sorted', async () => {
    const {releaseNames, nameCountByDataset} = await exportParserNames({
      atlasRoot: ATLAS_FIXTURE_ROOT,
      referenceRoot: REFERENCE_FIXTURE_ROOT,
    });
    expect(nameCountByDataset).toEqual({
      own: 13,
      guessit: 3,
      sonarr: 11,
      ptt: 5,
    });
    expect(releaseNames).toEqual([...new Set(releaseNames)].toSorted());
    expect(releaseNames).toHaveLength(32);
    expect(releaseNames).toContain('Fixture Unreferenced Film (12)');
    expect(releaseNames).toContain('Ref.Sports.2020.720p.HDTV-GRP');
  });
});

describe('the scored run', () => {
  let workRoot;
  let guessitOutput;
  let pendingExport;
  let outcome;

  const labelPendingItems = ({pendingItems, labelLibrary}) => {
    const readingsByLibrary = readLibraryReadings({
      releaseNames: [...new Set(pendingItems.map(item => item.releaseName))],
      guessitOutput,
    });
    return {
      labels: pendingItems.map(({releaseName, fieldName}) => ({
        releaseName,
        fieldName,
        expectedValue: readingsByLibrary.get(labelLibrary).get(releaseName)[
          fieldName
        ],
      })),
    };
  };

  beforeAll(async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'eval-parser-run-'));
    const {releaseNames} = await exportParserNames({
      atlasRoot: ATLAS_FIXTURE_ROOT,
      referenceRoot: REFERENCE_FIXTURE_ROOT,
    });
    guessitOutput = buildGuessitOutput(releaseNames);
    pendingExport = await exportPendingItems({
      atlasRoot: ATLAS_FIXTURE_ROOT,
      guessitOutput,
    });
    await Promise.all([
      writeFile(
        join(workRoot, 'guessit-output.json'),
        JSON.stringify(guessitOutput),
      ),
      writeFile(
        join(workRoot, 'labels.json'),
        JSON.stringify(
          labelPendingItems({
            pendingItems: pendingExport.pendingItems,
            labelLibrary: 'release-parser',
          }),
        ),
      ),
      writeFile(
        join(workRoot, 'partial-labels.json'),
        JSON.stringify(
          labelPendingItems({
            pendingItems: pendingExport.pendingItems.slice(1),
            labelLibrary: 'release-parser',
          }),
        ),
      ),
    ]);
    outcome = await runParserTest({
      atlasRoot: ATLAS_FIXTURE_ROOT,
      parserLabelsPath: join(workRoot, 'labels.json'),
      guessitOutputPath: join(workRoot, 'guessit-output.json'),
      referenceRoot: REFERENCE_FIXTURE_ROOT,
      referenceCommits: REFERENCE_COMMITS,
    });
  }, 120_000);

  afterAll(async () => {
    await rm(workRoot, {recursive: true, force: true});
  });

  it('exports pending own items with no library reading or agreement mark', async () => {
    expect(pendingExport.ownNameCount).toBe(
      (await readOwnNames({atlasRoot: ATLAS_FIXTURE_ROOT})).length,
    );
    expect(pendingExport.ownItemCount).toBe(pendingExport.ownNameCount * 8);
    expect(pendingExport.pendingItems.length).toBeGreaterThan(0);
    expect(
      pendingExport.pendingItems.every(
        pendingItem =>
          Object.keys(pendingItem).toSorted().join() ===
          'fieldName,releaseName',
      ),
    ).toBe(true);
  });

  it('scores every library on every data set outside its lineage', () => {
    expect(
      outcome.libraryResults
        .map(({library, datasetName}) => `${library}:${datasetName}`)
        .toSorted(),
    ).toEqual(
      [
        'guessit:own',
        'guessit:sonarr',
        'guessit:ptt',
        'release-parser:own',
        'release-parser:guessit',
        'release-parser:sonarr',
        'video-filename-parser:own',
        'video-filename-parser:guessit',
        'video-filename-parser:ptt',
        'parsium:own',
        'parsium:guessit',
        'parsium:sonarr',
        'parsium:ptt',
      ].toSorted(),
    );
  });

  it('scores own names on all eight fields against the labels', () => {
    const releaseParserOwn = outcome.libraryResults.find(
      ({library, datasetName}) =>
        library === 'release-parser' && datasetName === 'own',
    );
    expect(releaseParserOwn.libraryScore.pointEstimate).toBe(1);
    expect(
      Object.values(releaseParserOwn.fieldAccuracy).every(
        ({itemCount}) => itemCount === outcome.ownNameCount,
      ),
    ).toBe(true);
  });

  it('names the fields without items for an external set', () => {
    const sonarrResult = outcome.libraryResults.find(
      ({library, datasetName}) =>
        library === 'parsium' && datasetName === 'sonarr',
    );
    expect(sonarrResult.emptyFieldNames).toEqual([
      'streamingService',
      'releaseEdition',
    ]);
  });

  it('counts the own names by source and the dropped edition items', () => {
    expect(outcome.ownNameCountBySource).toEqual({
      subtitleReleaseNames: 9,
      videoFilenames: 4,
    });
    expect(outcome.droppedEditionCountByDataset).toEqual({
      guessit: 1,
      sonarr: 0,
      ptt: 0,
    });
  });

  it('reports the agreed-sample check, the labels digest and the versions', () => {
    expect(outcome.ownTruth.sampleErrorCount).toBe(0);
    expect(outcome.ownTruth.pendingItemCount).toBe(
      pendingExport.pendingItems.length,
    );
    expect(outcome.labelsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(outcome.guessitVersion).toBe('4.5.1');
    expect(Object.keys(outcome.libraryVersions).toSorted()).toEqual([
      '@aiostreams/release-parser',
      '@ctrl/video-filename-parser',
      'parsium-media',
    ]);
    expect(outcome.referenceCommits).toEqual(REFERENCE_COMMITS);
  });

  it('compares the six pairs and ends in one decision line', () => {
    expect(outcome.pairComparisons).toHaveLength(12);
    expect(outcome.decision.decisionLine).toMatch(
      /^Decision: (use \S+|port guessit)$/,
    );
  });

  it('refuses to score while a pending item has no label', async () => {
    await expect(
      runParserTest({
        atlasRoot: ATLAS_FIXTURE_ROOT,
        parserLabelsPath: join(workRoot, 'partial-labels.json'),
        guessitOutputPath: join(workRoot, 'guessit-output.json'),
        referenceRoot: REFERENCE_FIXTURE_ROOT,
        referenceCommits: REFERENCE_COMMITS,
      }),
    ).rejects.toThrow(ParserLabelError);
  });
});
