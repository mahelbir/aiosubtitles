import {Subtitle} from './subtitle.js';
import {SubtitleAlias} from './subtitle-alias.js';
import {SubtitleFile} from './subtitle-file.js';
import {SubtitleHashMatch} from './subtitle-hash-match.js';
import './subtitle-reference-comparison.js';
import './subtitle-video-binding.js';
import './subtitle-video-candidate.js';
import {UserConfig} from './user-config.js';
import {UserConfigCredential} from './user-config-credential.js';
import './video-variant.js';

export function applyScopes() {
  UserConfig.addScope('withCredentials', {
    attributes: {exclude: UserConfig.sensitiveAttributes},
    include: [UserConfig.credentialsInclude],
    order: [
      [UserConfig.credentialsInclude.association, 'credentialPosition', 'ASC'],
    ],
  });
}

export function applyAssociations() {
  UserConfig.hasMany(UserConfigCredential, {
    foreignKey: 'userConfigId',
    as: 'credentials',
    onDelete: 'CASCADE',
  });
  UserConfigCredential.belongsTo(UserConfig, {foreignKey: 'userConfigId'});
  Subtitle.hasOne(SubtitleFile, {
    foreignKey: 'subtitleId',
    as: 'subtitleFile',
  });
  Subtitle.hasMany(SubtitleAlias, {
    foreignKey: 'subtitleId',
    as: 'subtitleAliases',
  });
  Subtitle.hasMany(SubtitleHashMatch, {
    foreignKey: 'subtitleId',
    as: 'hashMatches',
  });
}
