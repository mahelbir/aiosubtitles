import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {Settings} from '@mahelbir/settings';
import {limitAsync, noop} from 'es-toolkit';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {settingsDefinition} from '@repo/shared/schemas/setting.js';
import {getMainCheckoutPath} from '@repo/tooling/git.js';
import {assertPrivateOutputPath} from '@repo/tooling/private-output.js';
import {loadLiveSecrets} from './lib/live-secrets.js';
import {makeVideoSearchQuery} from './lib/video-search-query.js';

const SEARCHED_LANGUAGE_CODES = ['tur', 'eng'];
const SEARCH_CONCURRENCY = 1;
const JSON_INDENT = 2;
const PATH_OPTION_NAMES = ['identities', 'output'];
const PRIVATE_FOLDER_PARTS = ['apps', 'api', '.out', 'eval-private'];
const PARENT_SEGMENT = '..';

async function enrichCase({caseCode, video, searchCase}) {
  const hits = await searchCase(
    makeVideoSearchQuery({
      videoId: video.catalogId,
      languageCodes: SEARCHED_LANGUAGE_CODES,
      videoHash: video.osHash,
    }),
  );
  const caseHash = video.osHash.toLowerCase();
  const hashMatchSiteFileIds = hits
    .filter(hit => hit.hashMatchVideoHashes.includes(caseHash))
    .map(hit => hit.siteFileId);
  return {
    caseCode,
    searchedLanguageCodes: SEARCHED_LANGUAGE_CODES,
    hitCount: hits.length,
    hashMatchCount: hashMatchSiteFileIds.length,
    hashMatchSiteFileIds,
  };
}

export function runMoviehashEnrichment({identities, searchCase}) {
  return Promise.all(
    Object.entries(identities.videos)
      .filter(([, video]) => Boolean(video.osHash))
      .toSorted(([leftCode], [rightCode]) => leftCode.localeCompare(rightCode))
      .map(([caseCode, video]) => enrichCase({caseCode, video, searchCase})),
  );
}

function getEvalPrivateRoot() {
  return path.join(
    getMainCheckoutPath(import.meta.dirname),
    ...PRIVATE_FOLDER_PARTS,
  );
}

function isInsideFolder(folderPath, filePath) {
  const relativePath = path.relative(folderPath, filePath);
  return (
    relativePath !== '' &&
    !path.isAbsolute(relativePath) &&
    relativePath.split(path.sep)[0] !== PARENT_SEGMENT
  );
}

export function parseEnrichmentArgs(
  argv,
  {privateRoot = getEvalPrivateRoot()} = {},
) {
  const {values: scriptOptions} = parseArgs({
    args: argv,
    options: {identities: {type: 'string'}, output: {type: 'string'}},
    strict: true,
    allowPositionals: false,
  });
  for (const optionName of PATH_OPTION_NAMES) {
    if (!path.isAbsolute(scriptOptions[optionName] ?? '')) {
      throw new Error(`--${optionName} must be an absolute path.`);
    }
  }
  if (!isInsideFolder(privateRoot, scriptOptions.output)) {
    throw new Error('--output must lie inside the private eval folder.');
  }
  assertPrivateOutputPath(scriptOptions.output);
  return {identities: scriptOptions.identities, output: scriptOptions.output};
}

export async function readIdentities(identitiesPath) {
  const identitiesText = await readFile(identitiesPath, 'utf8');
  try {
    return JSON.parse(identitiesText);
  } catch {
    throw new SyntaxError('The identities file is not valid JSON.');
  }
}

export function createGuardedSearch(search) {
  let hasSearchFailed = false;
  return limitAsync(async searchQuery => {
    if (hasSearchFailed) {
      throw new Error('An earlier search failed.');
    }
    try {
      return await search(searchQuery);
    } catch (error) {
      hasSearchFailed = true;
      throw error;
    }
  }, SEARCH_CONCURRENCY);
}

export async function createSearchCase({loadSecrets = loadLiveSecrets} = {}) {
  const {OPENSUBTITLES_API_KEY: apiKey} = loadSecrets();
  if (!apiKey) {
    throw new Error('OPENSUBTITLES_API_KEY is missing from the secrets file.');
  }
  const [
    {createOpensubtitlesClient},
    {createSharedCredentialPool},
    {requestSubtitleSource},
  ] = await Promise.all([
    import('../src/lib/subtitle-sources/opensubtitles/opensubtitles-client.js'),
    import('../src/lib/subtitle-sources/shared-credential-pool.js'),
    import('../src/lib/subtitle-sources/subtitle-source-request.js'),
  ]);
  const opensubtitlesClient = createOpensubtitlesClient({
    requestSubtitleSource,
    sharedCredentialPool: createSharedCredentialPool({
      settings: new Settings({
        store: {
          read: async () => ({
            sharedCredentials: {[SubtitleSource.OPENSUBTITLES]: [apiKey]},
          }),
          update: noop,
        },
        schema: settingsDefinition.schema,
        onError: null,
      }),
    }),
  });
  return createGuardedSearch(searchQuery =>
    opensubtitlesClient.searchSubtitles(searchQuery, null),
  );
}

async function runScript(argv) {
  const {identities: identitiesPath, output: outputPath} =
    parseEnrichmentArgs(argv);
  const [identities, searchCase] = await Promise.all([
    readIdentities(identitiesPath),
    createSearchCase(),
  ]);
  const enrichmentCases = await runMoviehashEnrichment({
    identities,
    searchCase,
  });
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(
    outputPath,
    `${JSON.stringify(enrichmentCases, null, JSON_INDENT)}\n`,
    'utf8',
  );
  process.stdout.write(
    `Searched ${enrichmentCases.length} hashed cases into ${outputPath}.\n`,
  );
}

if (import.meta.main) {
  try {
    await runScript(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.name}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
