import {appendFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Enum} from 'enum-plus';

export const LiveStatus = Enum({
  VERIFIED: {value: 'verified'},
  NOT_VERIFIED_LIVE: {value: 'not-verified-live'},
  FAILED: {value: 'failed'},
});

const SECRET_MISSING_NOTE = 'Secret missing.';
const LIVE_REPORT_DIR = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '.out',
  'live',
);

async function prepareLiveReportPath(reportName) {
  await mkdir(LIVE_REPORT_DIR, {recursive: true});
  return path.join(
    LIVE_REPORT_DIR,
    `${new Date().toISOString().slice(0, 10)}-${reportName}.md`,
  );
}

export async function recordLiveResult({serviceName, liveStatus, liveNote}) {
  await appendFile(
    await prepareLiveReportPath('live'),
    `- ${new Date().toISOString().slice(11, 19)} | ${serviceName} | ${liveStatus} | ${liveNote}\n`,
    'utf8',
  );
}

export async function writeLiveReport(reportName, reportText) {
  await writeFile(await prepareLiveReportPath(reportName), reportText, 'utf8');
}

export function listMissingSecretNames(liveSecrets, secretNames) {
  return secretNames.filter(secretName => !liveSecrets[secretName]);
}

export async function runLiveCase(
  {serviceName, liveNote, missingSecretNames = []},
  {skip},
  liveCall,
) {
  let isSkipped = false;
  const skipLive = async skipNote => {
    isSkipped = true;
    await recordLiveResult({
      serviceName,
      liveStatus: LiveStatus.NOT_VERIFIED_LIVE,
      liveNote: `${liveNote} ${skipNote}`,
    });
    skip(skipNote);
  };
  if (missingSecretNames.length > 0) {
    await skipLive(SECRET_MISSING_NOTE);
  }
  try {
    await liveCall({skipLive});
  } catch (error) {
    if (!isSkipped) {
      await recordLiveResult({
        serviceName,
        liveStatus: LiveStatus.FAILED,
        liveNote,
      });
    }
    throw error;
  }
  await recordLiveResult({
    serviceName,
    liveStatus: LiveStatus.VERIFIED,
    liveNote,
  });
}
