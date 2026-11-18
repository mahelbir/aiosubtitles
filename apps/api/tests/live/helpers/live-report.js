import {appendFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {Enum} from 'enum-plus';
import {dt} from '../../../src/lib/datetime.js';

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

export async function recordLiveResult({serviceName, liveStatus, liveNote}) {
  await mkdir(LIVE_REPORT_DIR, {recursive: true});
  await appendFile(
    path.join(LIVE_REPORT_DIR, `${dt().format('YYYY-MM-DD')}-live.md`),
    `- ${dt().format('HH:mm:ss')} | ${serviceName} | ${liveStatus} | ${liveNote}\n`,
    'utf8',
  );
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
