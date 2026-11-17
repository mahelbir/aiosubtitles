import {describe, expect, it} from 'vitest';
import {QueryTypes} from 'sequelize';
import {LOCALE_COLLATION} from '../../src/db/collation.js';
import {sequelize} from '../../src/db/index.js';
import {createMigrator} from '../../src/db/cli/umzug.js';
import {
  insertLegacyRow,
  roundTripMigration,
  silentLogger,
  withMigrationRolledBack,
} from '../helpers/migrations.js';

const COLLATION_MIGRATION = 'create-locale-collation';

const query = sql => sequelize.query(sql, {type: QueryTypes.SELECT});

const hasLocaleCollation = async () => {
  const rows = await sequelize.query(
    'SELECT 1 FROM pg_collation WHERE collname = :name',
    {replacements: {name: LOCALE_COLLATION}, type: QueryTypes.SELECT},
  );
  return rows.length > 0;
};

describe('the locale collation migration', () => {
  it('drops the collation on the way down', async () => {
    await withMigrationRolledBack(COLLATION_MIGRATION, async () => {
      expect(await hasLocaleCollation()).toBe(false);
    });
  });

  it('builds the collation again on the way up', async () => {
    await roundTripMigration(COLLATION_MIGRATION);

    expect(await hasLocaleCollation()).toBe(true);
  });
});

describe('a legacy row', () => {
  const withLegacyTable = async (columns, assertions) => {
    await sequelize.query(`CREATE TABLE legacy_rows (${columns})`);
    try {
      await assertions();
    } finally {
      await sequelize.query('DROP TABLE legacy_rows');
    }
  };

  it('lands under the columns the models would name, its JSON values serialised, under a new id', async () => {
    await withLegacyTable(
      'id uuid PRIMARY KEY, display_name text, address2 text, sha256_hash text, settings jsonb',
      async () => {
        const id = await insertLegacyRow('legacy_rows', {
          displayName: 'Eski',
          address2: 'Kat 2',
          sha256Hash: 'abc',
          settings: {isOn: true, tags: ['a']},
        });

        expect(
          await query(
            'SELECT id, display_name, address2, sha256_hash, settings FROM legacy_rows',
          ),
        ).toEqual([
          {
            id,
            display_name: 'Eski',
            address2: 'Kat 2',
            sha256_hash: 'abc',
            settings: {isOn: true, tags: ['a']},
          },
        ]);
      },
    );
  });

  it('keeps a list a list for an array column, and JSON for a JSON one', async () => {
    await withLegacyTable(
      'id uuid PRIMARY KEY, tags text[], history jsonb',
      async () => {
        await insertLegacyRow('legacy_rows', {
          tags: ['a', 'b'],
          history: ['c'],
        });

        expect(await query('SELECT tags, history FROM legacy_rows')).toEqual([
          {tags: ['a', 'b'], history: ['c']},
        ]);
      },
    );
  });

  it('keeps the id it is given', async () => {
    await withLegacyTable('id uuid PRIMARY KEY', async () => {
      const id = '01900000-0000-7000-8000-000000000001';

      expect(await insertLegacyRow('legacy_rows', {id})).toBe(id);
      expect(await query('SELECT id FROM legacy_rows')).toEqual([{id}]);
    });
  });

  it('adds no id to a table keyed by its columns alone', async () => {
    await withLegacyTable(
      'owner_id uuid, target_id uuid, PRIMARY KEY (owner_id, target_id)',
      async () => {
        const row = {
          ownerId: '01900000-0000-7000-8000-000000000001',
          targetId: '01900000-0000-7000-8000-000000000002',
        };

        expect(await insertLegacyRow('legacy_rows', row)).toBeUndefined();
        expect(
          await query('SELECT owner_id, target_id FROM legacy_rows'),
        ).toEqual([{owner_id: row.ownerId, target_id: row.targetId}]);
      },
    );
  });
});

describe('the whole schema', () => {
  it('tears down to nothing and builds back', async () => {
    const migrator = createMigrator(silentLogger);
    expect(await hasLocaleCollation()).toBe(true);

    try {
      await migrator.down({to: 0});
      expect(await migrator.executed()).toEqual([]);
      expect(await hasLocaleCollation()).toBe(false);
    } finally {
      await migrator.up();
    }

    expect(await hasLocaleCollation()).toBe(true);
    expect(await migrator.pending()).toEqual([]);
  });

  it('refuses a rollback that names no executed migration and rolls nothing back', async () => {
    await expect(roundTripMigration('no-such-migration')).rejects.toThrow(
      /No executed migration/,
    );

    expect(await hasLocaleCollation()).toBe(true);
    expect(await createMigrator(silentLogger).pending()).toEqual([]);
  });

  it('names every migration in its own namespace', async () => {
    const migrations = await createMigrator(silentLogger).executed();

    expect(migrations.length).toBeGreaterThan(0);
    for (const entry of migrations) {
      expect(entry.name.startsWith('migration:')).toBe(true);
    }
  });
});
