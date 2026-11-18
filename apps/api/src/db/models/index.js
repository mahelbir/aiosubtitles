import {Subtitle} from './subtitle.js';
import {SubtitleAlias} from './subtitle-alias.js';
import {SubtitleFile} from './subtitle-file.js';
import {SubtitleHashMatch} from './subtitle-hash-match.js';
import {SubtitleReferenceComparison} from './subtitle-reference-comparison.js';
import {SubtitleVideoBinding} from './subtitle-video-binding.js';
import {SubtitleVideoCandidate} from './subtitle-video-candidate.js';
import {UserConfig} from './user-config.js';
import {UserConfigCredential} from './user-config-credential.js';
import {VideoVariant} from './video-variant.js';

export function applyScopes() {
  UserConfig.addScope('withCredentials', {
    attributes: {exclude: UserConfig.sensitiveAttributes},
    include: [UserConfig.credentialsInclude],
    order: [
      [UserConfig.credentialsInclude.association, 'credentialPosition', 'ASC'],
    ],
  });
  Subtitle.addScope('withStoredFile', {
    attributes: Subtitle.downloadAttributes,
    include: [Subtitle.subtitleFileInclude],
  });
  Subtitle.addScope('withFileFacts', {
    attributes: Subtitle.candidateAttributes,
    include: [Subtitle.fileFactsInclude],
  });
  SubtitleFile.addScope('cueSource', {
    attributes: SubtitleFile.cueSourceAttributes,
  });
  SubtitleVideoCandidate.addScope('link', {
    attributes: SubtitleVideoCandidate.linkAttributes,
  });
  SubtitleAlias.addScope('link', {attributes: SubtitleAlias.linkAttributes});
  SubtitleHashMatch.addScope('link', {
    attributes: SubtitleHashMatch.linkAttributes,
  });
  SubtitleVideoBinding.addScope('binding', {
    attributes: SubtitleVideoBinding.bindingAttributes,
  });
  SubtitleReferenceComparison.addScope('timeFamily', {
    attributes: SubtitleReferenceComparison.familyAttributes,
  });
  VideoVariant.addScope('play', {attributes: VideoVariant.playAttributes});
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
