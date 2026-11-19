import {uniq} from 'es-toolkit';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  hasListImprovementSwitch,
  isListImprovementOn,
} from '@repo/shared/lib/list-improvement-switch.js';
import {groupDuplicates} from '@repo/subtitle-core/deduplication/group-duplicates.js';
import {
  COMPARISON_METHOD_VERSION,
  compareCueTimings,
} from '@repo/subtitle-core/timing/compare-cue-timings.js';
import {SubtitleHashMatch} from '../../db/models/subtitle-hash-match.js';
import {SubtitleReferenceComparison} from '../../db/models/subtitle-reference-comparison.js';
import {Subtitle} from '../../db/models/subtitle.js';
import {
  applyListImprovementSwitch,
  readDownloadCredentials,
  readUsableCredentials,
} from '../subtitle-source-credentials.js';
import {userConfigCache} from '../user-config-cache.js';
import {
  isHashMatchVerified,
  readCandidateCues,
} from '../subtitle-store/read-video-candidates.js';
import {
  downloadCandidate,
  isCandidateStored,
  isDownloadStored,
  limitPerLanguage,
  orderByNameScore,
} from './background-downloads.js';
import {enqueueBackgroundJob} from './background-queues.js';
import {
  combineSpendChecks,
  createListImprovementCheck,
  createViewerShareCheck,
  listVideoReferences,
  spendOpensubtitlesQuota,
} from './quota-spending.js';

const COMPARISON_UPDATED_FIELDS = [
  'isSameTimeFamily',
  'timingOffsetMs',
  'timingFpsRatio',
  'matchedCueShare',
  'comparisonMethodVersion',
  'comparedAt',
];

export function scheduleListBackgroundWork({
  cachedUserConfig,
  videoContext,
  candidates,
  credentialsBySource,
  subtitleSourceRegistry,
}) {
  const {languageCodes, subtitleSourceSwitchStates} = cachedUserConfig;
  const isSourceOn = subtitleSource =>
    subtitleSourceSwitchStates[subtitleSource] !== false;
  const enabledCandidates = candidates.filter(candidate =>
    isSourceOn(candidate.subtitleSource),
  );
  const references = listVideoReferences({
    candidates: enabledCandidates,
    videoContext,
  });
  const wantedCandidates = enabledCandidates.filter(
    candidate =>
      languageCodes.includes(candidate.languageCode) ||
      references.includes(candidate),
  );
  const unstoredCandidates = withoutStoredDuplicates(wantedCandidates);
  for (const client of subtitleSourceRegistry.listSubtitleSourceClients()) {
    const {subtitleSource} = client;
    const credentials = credentialsBySource[subtitleSource];
    const sourceCandidates = wantedCandidates.filter(
      candidate =>
        candidate.subtitleSource === subtitleSource &&
        (isCandidateStored(candidate) ||
          unstoredCandidates.includes(candidate)),
    );
    if (
      subtitleSource === SubtitleSource.OPENSUBTITLES ||
      !credentials?.length ||
      !sourceCandidates.some(candidate =>
        unstoredCandidates.includes(candidate),
      )
    ) {
      continue;
    }
    enqueueBackgroundJob({
      subtitleSource,
      jobKey: toJobKey({subtitleSource, cachedUserConfig, videoContext}),
      runJob: async ({signal}) => {
        const jobUserConfig = await readJobUserConfig(
          cachedUserConfig,
          subtitleSource,
        );
        if (!jobUserConfig) {
          return;
        }
        const downloadedIds = await downloadFreeCandidates({
          client,
          candidates: sourceCandidates,
          videoContext,
          credentials: await readDownloadCredentials({
            cachedUserConfig: jobUserConfig,
            client,
            isBackground: true,
          }),
          cachedUserConfig: jobUserConfig,
          subtitleSourceRegistry,
          signal,
        });
        await compareWithReferences({
          videoContext,
          candidateSubtitleIds: downloadedIds,
        });
      },
    });
  }
  const accounts = readOpensubtitlesAccounts(cachedUserConfig);
  if (
    !isSourceOn(SubtitleSource.OPENSUBTITLES) ||
    accounts.length === 0 ||
    references.length === 0
  ) {
    return;
  }
  enqueueBackgroundJob({
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    jobKey: toJobKey({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      cachedUserConfig,
      videoContext,
    }),
    runJob: async ({signal}) => {
      const jobUserConfig = await readJobUserConfig(
        cachedUserConfig,
        SubtitleSource.OPENSUBTITLES,
      );
      if (!jobUserConfig) {
        return;
      }
      const canSpendQuota = isListImprovementOn({
        listImprovementSwitchStates: jobUserConfig.listImprovementSwitchStates,
        subtitleSource: SubtitleSource.OPENSUBTITLES,
      });
      const downloadedIds = canSpendQuota
        ? await spendOpensubtitlesQuota({
            candidates: wantedCandidates,
            videoContext,
            accounts: readOpensubtitlesAccounts(jobUserConfig),
            cachedUserConfig: jobUserConfig,
            subtitleSourceRegistry,
            signal,
          })
        : [];
      await compareWithReferences({
        videoContext,
        candidateSubtitleIds: uniq([
          ...downloadedIds,
          ...wantedCandidates
            .map(({fileSubtitleId}) => fileSubtitleId)
            .filter(Boolean),
        ]),
      });
    },
  });
}

export async function downloadFreeCandidates({
  client,
  candidates,
  videoContext,
  credentials,
  cachedUserConfig,
  subtitleSourceRegistry,
  signal,
}) {
  const {subtitleSource} = client;
  const switchedCredentials = applyListImprovementSwitch({
    cachedUserConfig,
    subtitleSource,
    credentials,
  });
  if (
    switchedCredentials.length === 0 ||
    subtitleSource === SubtitleSource.OPENSUBTITLES
  ) {
    return [];
  }
  const canDownloadQuotaCostly =
    client.canUseSharedCredential === true ||
    isListImprovementOn({
      listImprovementSwitchStates: cachedUserConfig.listImprovementSwitchStates,
      subtitleSource,
    });
  const hasSwitch = hasListImprovementSwitch(subtitleSource);
  const userCredentials = switchedCredentials.filter(Boolean);
  const spendChecks = [
    ...(hasSwitch
      ? [
          createListImprovementCheck({
            userConfigId: cachedUserConfig.userConfigId,
            subtitleSource,
          }),
        ]
      : []),
    ...(client.readQuota &&
    client.canUseSharedCredential !== true &&
    userCredentials.length > 0
      ? [createViewerShareCheck({client, credentials: userCredentials, signal})]
      : []),
  ];
  const canSpendCredential =
    spendChecks.length > 0 ? combineSpendChecks(spendChecks) : undefined;
  const freeCandidates = candidates.filter(
    candidate =>
      candidate.subtitleSource === subtitleSource &&
      candidate.archiveEntryPath === '' &&
      (canDownloadQuotaCostly || candidate.isQuotaCostly !== true),
  );
  const groupIndexes = new Map();
  readDuplicateGroups(freeCandidates).forEach(({members}, groupIndex) => {
    for (const member of members) {
      groupIndexes.set(member, hasStoredMember(members) ? null : groupIndex);
    }
  });
  const pickedGroupIndexes = new Set();
  const uniqueTargets = orderByNameScore({
    candidates: freeCandidates,
    videoContext,
  }).filter(candidate => {
    const groupIndex = groupIndexes.get(candidate);
    if (groupIndex === null || pickedGroupIndexes.has(groupIndex)) {
      return false;
    }
    pickedGroupIndexes.add(groupIndex);
    return true;
  });
  const downloadTargets = hasSwitch
    ? limitPerLanguage(
        uniqueTargets,
        candidates.filter(
          candidate =>
            candidate.subtitleSource === subtitleSource &&
            isCandidateStored(candidate),
        ),
      )
    : uniqueTargets;
  const downloadedIds = [];
  for (const candidate of downloadTargets) {
    if (signal?.aborted) {
      break;
    }
    const subtitleDownload = await downloadCandidate({
      candidate,
      videoContext,
      cachedUserConfig,
      subtitleSourceRegistry,
      canSpendCredential,
    });
    if (subtitleDownload.isBudgetRefused) {
      break;
    }
    if (isDownloadStored(subtitleDownload) && !candidate.isSitePack) {
      downloadedIds.push(candidate.subtitleId);
    }
  }
  return downloadedIds;
}

function readOpensubtitlesAccounts(cachedUserConfig) {
  return readUsableCredentials({
    cachedUserConfig,
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    credentialKinds: [CredentialKind.ACCOUNT],
  });
}

async function readJobUserConfig({userConfigId}, subtitleSource) {
  const jobUserConfig = await userConfigCache.get(userConfigId);
  return jobUserConfig?.subtitleSourceSwitchStates[subtitleSource] === false
    ? null
    : jobUserConfig;
}

function withoutStoredDuplicates(candidates) {
  return readDuplicateGroups(candidates).flatMap(({members}) =>
    hasStoredMember(members) ? [] : members,
  );
}

function readDuplicateGroups(candidates) {
  return groupDuplicates({candidates, textSimilarityMin: Infinity});
}

function hasStoredMember(members) {
  return members.some(isCandidateStored);
}

function toJobKey({subtitleSource, cachedUserConfig, videoContext}) {
  return [
    subtitleSource,
    cachedUserConfig.userConfigId,
    videoContext.videoId,
    videoContext.catalogSeason,
    videoContext.catalogEpisode,
    videoContext.videoHash,
  ].join('\n');
}

export async function compareWithReferences({
  videoContext,
  candidateSubtitleIds,
}) {
  if (!videoContext.videoHash || candidateSubtitleIds.length === 0) {
    return;
  }
  const hashMatches = await SubtitleHashMatch.withScope('link').findAll({
    where: {videoHash: videoContext.videoHash},
    raw: true,
  });
  if (hashMatches.length === 0) {
    return;
  }
  const [referenceSubtitles, candidateSubtitles] = await Promise.all([
    readFileSubtitles(hashMatches.map(({subtitleId}) => subtitleId)),
    readFileSubtitles(candidateSubtitleIds),
  ]);
  const references = referenceSubtitles.filter(referenceSubtitle =>
    isHashMatchVerified(referenceSubtitle, videoContext),
  );
  if (references.length === 0 || candidateSubtitles.length === 0) {
    return;
  }
  const currentPairKeys = await readCurrentPairKeys({
    candidateSubtitleIds: candidateSubtitles.map(({id}) => id),
    referenceSubtitleIds: references.map(({id}) => id),
  });
  const pairs = candidateSubtitles.flatMap(candidateSubtitle =>
    references
      .filter(
        reference =>
          reference.id !== candidateSubtitle.id &&
          !currentPairKeys.has(toPairKey(candidateSubtitle.id, reference.id)),
      )
      .map(reference => ({candidateSubtitle, reference})),
  );
  if (pairs.length === 0) {
    return;
  }
  const cuesBySubtitleId = await readCandidateCues(
    uniq(
      pairs.flatMap(({candidateSubtitle, reference}) => [
        candidateSubtitle,
        reference,
      ]),
    ).map(({id, siteFps}) => ({fileSubtitleId: id, siteFps})),
  );
  const comparedAt = new Date();
  const comparisonRows = pairs.flatMap(({candidateSubtitle, reference}) => {
    const candidateCues = cuesBySubtitleId.get(candidateSubtitle.id);
    const referenceCues = cuesBySubtitleId.get(reference.id);
    if (!candidateCues || !referenceCues) {
      return [];
    }
    const {isSameTimeFamily, timingOffsetMs, timingFpsRatio, matchedCueShare} =
      compareCueTimings({candidateCues, referenceCues});
    return [
      {
        candidateSubtitleId: candidateSubtitle.id,
        referenceSubtitleId: reference.id,
        isSameTimeFamily,
        timingOffsetMs: isSameTimeFamily ? timingOffsetMs : null,
        timingFpsRatio: isSameTimeFamily ? timingFpsRatio : null,
        matchedCueShare,
        comparisonMethodVersion: COMPARISON_METHOD_VERSION,
        comparedAt,
      },
    ];
  });
  await SubtitleReferenceComparison.bulkCreate(comparisonRows, {
    updateOnDuplicate: COMPARISON_UPDATED_FIELDS,
  });
}

async function readFileSubtitles(subtitleIds) {
  const subtitles = await Subtitle.withScope('withFileFacts').findAll({
    where: {id: uniq(subtitleIds)},
  });
  return subtitles.filter(
    ({subtitleFile}) => subtitleFile?.isFileValid === true,
  );
}

async function readCurrentPairKeys({
  candidateSubtitleIds,
  referenceSubtitleIds,
}) {
  const comparisons = await SubtitleReferenceComparison.withScope(
    'comparisonMethod',
  ).findAll({
    where: {
      candidateSubtitleId: candidateSubtitleIds,
      referenceSubtitleId: referenceSubtitleIds,
    },
    raw: true,
  });
  return new Set(
    comparisons
      .filter(
        ({comparisonMethodVersion}) =>
          comparisonMethodVersion === COMPARISON_METHOD_VERSION,
      )
      .map(({candidateSubtitleId, referenceSubtitleId}) =>
        toPairKey(candidateSubtitleId, referenceSubtitleId),
      ),
  );
}

function toPairKey(candidateSubtitleId, referenceSubtitleId) {
  return `${candidateSubtitleId}\n${referenceSubtitleId}`;
}
