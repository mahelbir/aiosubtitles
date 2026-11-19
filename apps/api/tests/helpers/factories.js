import crypto from 'node:crypto';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {Subtitle} from '../../src/db/models/subtitle.js';
import {UserConfigCredential} from '../../src/db/models/user-config-credential.js';
import {UserConfig} from '../../src/db/models/user-config.js';
import {sealCredentialSecret} from '../../src/lib/credential-secret.js';
import {hashPassword} from '../../src/lib/crypto.js';
import {FixtureRecord, FixtureTag} from './fixture-models.js';

export const EMAIL_DOMAIN = 'example.com';
export const DEFAULT_USER_CONFIG_PASSWORD = 'test-password';
export const DEFAULT_LANGUAGE_CODES = ['tur', 'eng'];

let sequence = 0;

function nextName(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function toEmail(name) {
  return `${name}@${EMAIL_DOMAIN}`;
}

export async function createFixtureTag({rank, ...values} = {}) {
  return FixtureTag.create({label: values.label ?? nextName('tag'), rank});
}

export async function createFixtureRecord({tags = [], ...values} = {}) {
  const record = await FixtureRecord.create({
    name: values.name ?? toEmail(nextName('record')),
    secret: values.secret ?? null,
    disabledAt: values.disabledAt ?? null,
  });
  if (tags.length > 0) {
    await record.addTags(tags.map(tag => tag.id));
  }
  return record;
}

export async function createUserConfig({credentials = [], ...values} = {}) {
  const userConfig = await UserConfig.create({
    passwordHash: hashPassword(values.password ?? DEFAULT_USER_CONFIG_PASSWORD),
    languageCodes: values.languageCodes ?? DEFAULT_LANGUAGE_CODES,
    subtitleSourceSwitchStates: values.subtitleSourceSwitchStates ?? {},
    listImprovementSwitchStates: values.listImprovementSwitchStates ?? {},
    ...(values.subtitleLanguageLimit !== undefined && {
      subtitleLanguageLimit: values.subtitleLanguageLimit,
    }),
  });
  const userConfigCredentials = await Promise.all(
    credentials.map(
      (
        {subtitleSource, credentialKind, credentialSecret},
        credentialPosition,
      ) =>
        UserConfigCredential.create({
          userConfigId: userConfig.id,
          subtitleSource,
          credentialKind,
          credentialSecret: sealCredentialSecret({
            userConfigId: userConfig.id,
            subtitleSource,
            credentialSecret,
          }),
          credentialPosition,
        }),
    ),
  );
  return {userConfig, userConfigCredentials};
}

export function toUrlCode(name) {
  return crypto.createHash('sha256').update(name).digest('hex');
}

export async function createSubtitle(values = {}) {
  const seenAt = new Date();
  return Subtitle.create({
    urlCode: toUrlCode(nextName('subtitle')),
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    siteFileId: nextName('site-file'),
    fileExtension: SubtitleFileExtension.SRT,
    siteLanguageCode: 'tur',
    releaseNames: [],
    siteMetadataUpdatedAt: seenAt,
    firstSeenAt: seenAt,
    ...values,
  });
}
