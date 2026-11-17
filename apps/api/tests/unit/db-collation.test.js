import {describe, expect, it} from 'vitest';
import {DataTypes, QueryTypes} from 'sequelize';
import {
  IDENTIFIER_COLLATION,
  LOCALE_COLLATION,
  collateColumn,
  foldIdentifier,
  withCollation,
} from '../../src/db/collation.js';

const stubQueryInterface = rows => {
  const queries = [];
  return {
    queries,
    sequelize: {
      query: async (sql, options) => {
        queries.push({sql, options});
        return options.type === QueryTypes.SELECT ? rows : undefined;
      },
    },
  };
};

describe('withCollation', () => {
  it('appends the quoted collation to the column type', () => {
    expect(withCollation(DataTypes.STRING(100), LOCALE_COLLATION)).toBe(
      `VARCHAR(100) COLLATE "${LOCALE_COLLATION}"`,
    );
  });

  it('accepts a bare type the way a model attribute does', () => {
    expect(withCollation(DataTypes.TEXT, IDENTIFIER_COLLATION)).toBe(
      'TEXT COLLATE "C"',
    );
  });
});

describe('foldIdentifier', () => {
  it.each([
    ['a dotted capital', 'İBRAHİM'],
    ['a dotless capital', 'IBRAHIM'],
    ['a dotless small letter', 'ıbrahım'],
  ])('folds %s to the ASCII i an identifier is stored with', (_label, term) => {
    expect(foldIdentifier(term)).toBe('ibrahim');
  });

  it('lowercases the rest without touching other characters', () => {
    expect(foldIdentifier('Ops-Team_2@Example.com')).toBe(
      'ops-team_2@example.com',
    );
  });
});

describe('collateColumn', () => {
  it('keeps the stored type and quotes a mixed-case table in both statements', async () => {
    const queryInterface = stubQueryInterface([
      {type: 'character varying(80)'},
    ]);
    const transaction = {};

    await collateColumn(
      {
        table: 'AuditLog',
        column: 'Note',
        collation: LOCALE_COLLATION,
        transaction,
      },
      queryInterface,
    );

    const [lookup, alter] = queryInterface.queries;
    expect(lookup.options.replacements).toEqual({
      relation: '"AuditLog"',
      column: 'Note',
    });
    expect(alter.sql).toBe(
      `ALTER TABLE "AuditLog" ALTER COLUMN "Note" TYPE character varying(80) COLLATE "${LOCALE_COLLATION}"`,
    );
    expect(lookup.options.transaction).toBe(transaction);
    expect(alter.options.transaction).toBe(transaction);
  });

  it('names the missing column and alters nothing', async () => {
    const queryInterface = stubQueryInterface([]);

    await expect(
      collateColumn(
        {table: 'users', column: 'nickname', collation: IDENTIFIER_COLLATION},
        queryInterface,
      ),
    ).rejects.toThrow('No column users.nickname to collate.');
    expect(queryInterface.queries).toHaveLength(1);
  });
});
