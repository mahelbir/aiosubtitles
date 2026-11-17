import {describe, expect, it, vi} from 'vitest';
import {QueryTypes} from 'sequelize';
import {ROLE_POSITION_STEP} from '@repo/shared/constants/role.js';
import {LOCALE_COLLATION} from '../../src/db/collation.js';
import {sequelize} from '../../src/db/index.js';
import {createMigrator, createSeeder} from '../../src/db/cli/umzug.js';
import * as roleSeeder from '../../src/db/seeders/00001-roles.js';
import * as userSeeder from '../../src/db/seeders/00002-users.js';
import {Role} from '../../src/db/models/role.js';
import {createRole} from '../helpers/factories.js';
import {
  insertLegacyRow,
  roundTripMigration,
  silentLogger,
  withMigrationRolledBack,
} from '../helpers/migrations.js';

const POSITION_MIGRATION = 'role-position-levels';
const COLLATION_MIGRATION = 'text-collations';

const context = () => sequelize.getQueryInterface();

const query = sql => sequelize.query(sql, {type: QueryTypes.SELECT});

const roster = () =>
  Role.findAll({
    attributes: ['slug', 'position'],
    order: [
      ['position', 'DESC'],
      ['id', 'ASC'],
    ],
    raw: true,
  });

describe('seeder rollback', () => {
  it('removes the seeded account and its assignment', async () => {
    await userSeeder.down({context: context()});

    const [users] = await query(
      `SELECT count(*)::int AS total FROM users WHERE email = '${userSeeder.ADMIN_EMAIL}'`,
    );
    const [links] = await query(
      'SELECT count(*)::int AS total FROM user_roles',
    );
    expect(users.total).toBe(0);
    expect(links.total).toBe(0);
  });

  it('puts the account back on the way up', async () => {
    await userSeeder.down({context: context()});
    await userSeeder.up({context: context()});

    const [users] = await query(
      `SELECT count(*)::int AS total FROM users WHERE email = '${userSeeder.ADMIN_EMAIL}'`,
    );
    const [links] = await query(
      'SELECT count(*)::int AS total FROM user_roles',
    );
    expect(users.total).toBe(1);
    expect(links.total).toBe(1);
  });

  it('tolerates an account that is already gone, and says so', async () => {
    await userSeeder.down({context: context()});

    /* The seeder warns rather than throwing — asserting it keeps the message
       out of the run's output and pins the behaviour at the same time. */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(
        userSeeder.down({context: context()}),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('SEED_DOWN'));
    } finally {
      warn.mockRestore();
    }
  });

  it('removes the seeded role together with its permissions', async () => {
    await userSeeder.down({context: context()});
    await roleSeeder.down({context: context()});

    const [roles] = await query(
      "SELECT count(*)::int AS total FROM roles WHERE slug = 'admin'",
    );
    const [grants] = await query(
      'SELECT count(*)::int AS total FROM role_permissions',
    );
    expect(roles.total).toBe(0);
    expect(grants.total).toBe(0);
  });

  it('tolerates a role that is already gone', async () => {
    await userSeeder.down({context: context()});
    await roleSeeder.down({context: context()});
    await expect(
      roleSeeder.down({context: context()}),
    ).resolves.toBeUndefined();
  });

  it('refuses to drop a role that still has holders', async () => {
    await expect(roleSeeder.down({context: context()})).rejects.toThrow();
  });
});

describe('the position migration', () => {
  it('renumbers downward while preserving the order', async () => {
    await createRole({slug: 'lower', position: 2000});
    await createRole({slug: 'middle', position: 3000});
    await createRole({slug: 'upper', position: 4000});
    const before = (await roster()).map(role => role.slug);

    await withMigrationRolledBack(POSITION_MIGRATION, async () => {
      const after = await roster();
      expect(after.map(role => role.slug)).toEqual(before);
      for (const role of after) {
        expect(role.position).toBeLessThan(ROLE_POSITION_STEP);
      }
    });
  });

  it('narrows the column, which is what the step spacing was buying room for', async () => {
    await withMigrationRolledBack(POSITION_MIGRATION, async () => {
      const [column] = await query(
        `SELECT data_type FROM information_schema.columns
          WHERE table_name = 'roles' AND column_name = 'position'`,
      );
      expect(column.data_type).toBe('smallint');
    });
  });

  it('restores whole-step spacing and the wider column on the way up', async () => {
    await createRole({slug: 'lower', position: 2000});
    await createRole({slug: 'upper', position: 3000});
    const before = (await roster()).map(role => role.slug);

    await roundTripMigration(POSITION_MIGRATION);

    const after = await roster();
    expect(after.map(role => role.slug)).toEqual(before);
    for (const role of after) {
      expect(role.position % ROLE_POSITION_STEP).toBe(0);
    }

    const [column] = await query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'roles' AND column_name = 'position'`,
    );
    expect(column.data_type).toBe('integer');
  });

  it('collapses a shared level to a single rank and back', async () => {
    await createRole({slug: 'twin-a', position: 2000});
    await createRole({slug: 'twin-b', position: 2000});

    await withMigrationRolledBack(POSITION_MIGRATION, async () => {
      const rows = await roster();
      const twins = rows.filter(role => role.slug.startsWith('twin-'));
      expect(twins[0].position).toBe(twins[1].position);
    });

    const restored = await roster();
    const twins = restored.filter(role => role.slug.startsWith('twin-'));
    expect(twins[0].position).toBe(twins[1].position);
  });
});

describe('the text collation migration', () => {
  const collatedColumns = () =>
    query(
      `SELECT table_name, column_name, collation_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND collation_name IS NOT NULL
        ORDER BY table_name, column_name`,
    );

  const hasLocaleCollation = async () => {
    const rows = await sequelize.query(
      'SELECT 1 FROM pg_collation WHERE collname = :name',
      {replacements: {name: LOCALE_COLLATION}, type: QueryTypes.SELECT},
    );
    return rows.length > 0;
  };

  it('returns every column to the server default and drops the collation, keeping the rows', async () => {
    await createRole({
      slug: 'keeper',
      label: 'Isparta Şube Sorumlusu',
      position: 600,
    });

    await withMigrationRolledBack(COLLATION_MIGRATION, async () => {
      expect(await collatedColumns()).toEqual([]);
      expect(await hasLocaleCollation()).toBe(false);
      expect(
        await query(`SELECT label FROM roles WHERE slug = 'keeper'`),
      ).toEqual([{label: 'Isparta Şube Sorumlusu'}]);
    });
  });

  it('collates every column again on the way up', async () => {
    const before = await collatedColumns();

    await roundTripMigration(COLLATION_MIGRATION);

    expect(before).not.toEqual([]);
    expect(await collatedColumns()).toEqual(before);
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
  const tableCount = async () => {
    const [row] = await query(
      `SELECT count(*)::int AS total FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'roles', 'role_permissions', 'user_roles')`,
    );
    return row.total;
  };

  it('tears down to nothing and builds back', async () => {
    const migrator = createMigrator(silentLogger);
    expect(await tableCount()).toBe(4);

    try {
      await migrator.down({to: 0});
      expect(await tableCount()).toBe(0);
    } finally {
      await migrator.up();
    }

    expect(await tableCount()).toBe(4);
    expect(await migrator.pending()).toEqual([]);
  });

  it('leaves none of its statements behind when a migration fails partway', async () => {
    await withMigrationRolledBack('create-roles', async migrator => {
      await sequelize.query('CREATE TABLE user_roles (blocker int)');
      try {
        await expect(migrator.up()).rejects.toThrow();
        expect(await tableCount()).toBe(2);
      } finally {
        await sequelize.query('DROP TABLE user_roles');
      }
    });

    expect(await tableCount()).toBe(4);
  });

  it('refuses a rollback that names no executed migration and rolls nothing back', async () => {
    await expect(roundTripMigration('no-such-migration')).rejects.toThrow(
      /No executed migration/,
    );

    expect(await tableCount()).toBe(4);
    expect(await createMigrator(silentLogger).pending()).toEqual([]);
  });

  it('exposes the seeders as their own namespace, separate from the migrations', async () => {
    const seeders = await createSeeder(silentLogger).pending();
    const migrations = await createMigrator(silentLogger).executed();

    expect(seeders.length).toBeGreaterThan(0);
    for (const entry of seeders) {
      expect(entry.name.startsWith('seeder:')).toBe(true);
    }
    for (const entry of migrations) {
      expect(entry.name.startsWith('migration:')).toBe(true);
    }
  });
});
