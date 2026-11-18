import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {UserConfigCredential} from '../../src/db/models/user-config-credential.js';

export async function readCredentialStatuses(credentialIds) {
  const credentials = await UserConfigCredential.findAll({
    attributes: ['id', 'credentialStatus'],
    where: {id: credentialIds},
    raw: true,
  });
  return Object.fromEntries(
    credentials.map(({id, credentialStatus}) => [id, credentialStatus]),
  );
}

export function makeSwitchStatesOnly(subtitleSources) {
  return Object.fromEntries(
    SubtitleSource.values.map(subtitleSource => [
      subtitleSource,
      subtitleSources.includes(subtitleSource),
    ]),
  );
}
