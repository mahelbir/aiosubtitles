import {describe, expect, it} from 'vitest';
import {QueryTypes, UniqueConstraintError, ValidationError} from 'sequelize';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {sequelize} from '../../src/db/index.js';
import {Subtitle} from '../../src/db/models/subtitle.js';
import {SubtitleReferenceComparison} from '../../src/db/models/subtitle-reference-comparison.js';
import {UserConfig} from '../../src/db/models/user-config.js';
import {UserConfigCredential} from '../../src/db/models/user-config-credential.js';
import {VideoVariant} from '../../src/db/models/video-variant.js';
import {createSubtitle, createUserConfig} from '../helpers/factories.js';
import {
  roundTripMigration,
  withMigrationRolledBack,
} from '../helpers/migrations.js';

const VIDEO_SIZE_ABOVE_INT32 = 5368709120;
const HOUR_IN_MS = 3600000;

const MIGRATED_TABLES = [
  ['create-user-configs', 'user_configs'],
  ['create-user-config-credentials', 'user_config_credentials'],
  ['create-subtitles', 'subtitles'],
  ['create-subtitle-video-bindings', 'subtitle_video_bindings'],
  ['create-subtitle-aliases', 'subtitle_aliases'],
  ['create-subtitle-files', 'subtitle_files'],
  ['create-video-variants', 'video_variants'],
  ['create-subtitle-video-candidates', 'subtitle_video_candidates'],
  ['create-subtitle-hash-matches', 'subtitle_hash_matches'],
  ['create-subtitle-reference-comparisons', 'subtitle_reference_comparisons'],
];

const hasTable = async tableName => {
  const {relation} = await sequelize.query(
    'SELECT to_regclass(:tableName) AS relation',
    {replacements: {tableName}, type: QueryTypes.SELECT, plain: true},
  );
  return relation !== null;
};

describe('a user configuration', () => {
  it('stores a configuration id as a v4 UUID', async () => {
    const {userConfig} = await createUserConfig();

    expect(userConfig.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
  });

  it('deletes credentials with their configuration', async () => {
    const {userConfig} = await createUserConfig({
      credentials: [
        {
          subtitleSource: SubtitleSource.SUBSOURCE,
          credentialKind: CredentialKind.API_KEY,
          credentialSecret: {apiKey: 'first-api-key'},
        },
        {
          subtitleSource: SubtitleSource.SUBSOURCE,
          credentialKind: CredentialKind.API_KEY,
          credentialSecret: {apiKey: 'second-api-key'},
        },
      ],
    });

    await sequelize.query('DELETE FROM user_configs WHERE id = :id', {
      replacements: {id: userConfig.id},
    });

    expect(
      await UserConfigCredential.count({
        where: {userConfigId: userConfig.id},
      }),
    ).toBe(0);
  });

  it('moves updatedAt on an update and leaves createdAt alone', async () => {
    const {userConfig} = await createUserConfig();
    const {createdAt, updatedAt} = userConfig;

    await sequelize.query(
      "UPDATE user_configs SET created_at = created_at - interval '1 hour', updated_at = updated_at - interval '1 hour' WHERE id = :id",
      {replacements: {id: userConfig.id}},
    );
    const stale = await UserConfig.findByPk(userConfig.id, {
      attributes: ['id', 'createdAt', 'updatedAt'],
    });
    await stale.update({subtitleLanguageLimit: 5});

    const stored = await UserConfig.findByPk(userConfig.id, {
      attributes: ['createdAt', 'updatedAt'],
    });
    expect(stored.createdAt.getTime()).toBe(createdAt.getTime() - HOUR_IN_MS);
    expect(stored.updatedAt.getTime()).toBeGreaterThan(
      updatedAt.getTime() - HOUR_IN_MS,
    );
  });

  it('moves updatedAt on a bulk update', async () => {
    const {userConfig} = await createUserConfig();
    await sequelize.query(
      "UPDATE user_configs SET updated_at = updated_at - interval '1 hour' WHERE id = :id",
      {replacements: {id: userConfig.id}},
    );

    await UserConfig.update(
      {subtitleLanguageLimit: 5},
      {where: {id: userConfig.id}},
    );

    const stored = await UserConfig.findByPk(userConfig.id, {
      attributes: ['updatedAt'],
    });
    expect(stored.updatedAt.getTime()).toBeGreaterThan(
      userConfig.updatedAt.getTime() - HOUR_IN_MS,
    );
  });
});

describe('the user data migrations', () => {
  it('refuse to roll back while a configuration is stored', async () => {
    await createUserConfig();

    await expect(
      withMigrationRolledBack('create-user-configs', async () => {}),
    ).rejects.toThrow(
      'Refusing to roll back: 1 row(s) hold a user configuration.',
    );
    expect(await hasTable('user_configs')).toBe(true);
  });

  it('refuse to roll back while a credential is stored', async () => {
    await createUserConfig({
      credentials: [
        {
          subtitleSource: SubtitleSource.SUBSOURCE,
          credentialKind: CredentialKind.API_KEY,
          credentialSecret: {apiKey: 'stored-api-key'},
        },
      ],
    });

    await expect(
      withMigrationRolledBack('create-user-config-credentials', async () => {}),
    ).rejects.toThrow(
      'Refusing to roll back: 1 row(s) hold a user credential.',
    );
    expect(await hasTable('user_config_credentials')).toBe(true);
  });

  it('names the credential index within the PostgreSQL identifier limit', async () => {
    const indexNames = await sequelize.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'user_config_credentials' AND indexdef LIKE '%credential_position%'",
      {type: QueryTypes.SELECT},
    );

    expect(indexNames).toEqual([
      {indexname: 'user_config_credentials_position_index'},
    ]);
  });
});

describe('a subtitle', () => {
  it('rejects a second subtitles row for the same site file and entry', async () => {
    await createSubtitle({siteFileId: 'site-file-duplicate'});

    await expect(
      createSubtitle({siteFileId: 'site-file-duplicate'}),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it('allows the same site file with another archive entry', async () => {
    await createSubtitle({siteFileId: 'site-file-pack'});
    await createSubtitle({
      siteFileId: 'site-file-pack',
      archiveEntryPath: 'Season 1/S01E01.srt',
    });

    const rows = await Subtitle.findAll({
      where: {siteFileId: 'site-file-pack'},
      attributes: ['archiveEntryPath'],
      order: [['archiveEntryPath', 'ASC']],
      raw: true,
    });
    expect(rows.map(row => row.archiveEntryPath)).toEqual([
      '',
      'Season 1/S01E01.srt',
    ]);
  });

  it('is not a site pack unless the site marks it', async () => {
    const subtitle = await createSubtitle();

    const stored = await Subtitle.findByPk(subtitle.id, {
      attributes: ['isSitePack'],
    });
    expect(stored.isSitePack).toBe(false);
  });

  it('refuses a file extension the subtitle core does not know', async () => {
    await expect(createSubtitle({fileExtension: 'sub'})).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('a video variant', () => {
  it('returns video sizes above 2^31 as numbers', async () => {
    const variant = await VideoVariant.create({
      videoId: 'tt0111161',
      videoHash: '0123456789abcdef',
      videoSizeBytes: VIDEO_SIZE_ABOVE_INT32,
      firstSeenAt: new Date(),
    });

    const stored = await VideoVariant.findByPk(variant.id, {
      attributes: ['videoSizeBytes'],
    });
    expect(stored.videoSizeBytes).toBe(VIDEO_SIZE_ABOVE_INT32);
  });
});

describe('a reference comparison', () => {
  it('stores NULL offset and ratio for a different time family', async () => {
    const [candidate, reference] = await Promise.all([
      createSubtitle(),
      createSubtitle(),
    ]);

    await SubtitleReferenceComparison.create({
      candidateSubtitleId: candidate.id,
      referenceSubtitleId: reference.id,
      isSameTimeFamily: false,
      timingOffsetMs: null,
      timingFpsRatio: null,
      matchedCueShare: 0.12,
      comparisonMethodVersion: 1,
      comparedAt: new Date(),
    });

    const stored = await SubtitleReferenceComparison.findOne({
      where: {candidateSubtitleId: candidate.id},
      attributes: ['timingOffsetMs', 'timingFpsRatio', 'matchedCueShare'],
    });
    expect(stored.timingOffsetMs).toBeNull();
    expect(stored.timingFpsRatio).toBeNull();
    expect(stored.matchedCueShare).toBe(0.12);
  });
});

describe('the data model migrations', () => {
  it.each(MIGRATED_TABLES)(
    'drops what %s builds on the way down and builds it again on the way up',
    async (migrationName, tableName) => {
      await withMigrationRolledBack(migrationName, async () => {
        expect(await hasTable(tableName)).toBe(false);
      });
      await roundTripMigration(migrationName);

      expect(await hasTable(tableName)).toBe(true);
    },
  );
});
