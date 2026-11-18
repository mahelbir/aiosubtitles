import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {AIOSUBTITLES_SCORE_TABLE} from '@repo/subtitle-core/scoring/aiosubtitles-score-table.js';
import {scoreSubtitleCandidate} from '@repo/subtitle-core/scoring/score-candidate.js';

export function scoreVideoCandidate({
  candidate,
  videoContext,
  readCandidateRelease = readReleaseName,
}) {
  return scoreSubtitleCandidate({
    candidate,
    candidateReleases: candidate.releaseNames.map(releaseName =>
      readCandidateRelease({releaseName, isSitePack: candidate.isSitePack}),
    ),
    video: videoContext,
    scoreTable: AIOSUBTITLES_SCORE_TABLE,
  });
}

function readReleaseName({releaseName, isSitePack}) {
  return parseReleaseName(releaseName, {isSitePack});
}
