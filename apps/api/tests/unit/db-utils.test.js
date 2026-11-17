import {describe, expect, it} from 'vitest';
import {DataTypes, Op} from 'sequelize';
import {sequelize} from '../../src/db/index.js';
import {dbUtils} from '../../src/db/utils.js';
import {isValidUuid} from '../../src/lib/common.js';
import {
  FixtureRecord,
  FixtureRecordTag,
  FixtureTag,
} from '../helpers/fixture-models.js';

describe('uuidPrimaryKey', () => {
  it('generates a valid, distinct key per row', () => {
    const {defaultValue} = dbUtils.uuidPrimaryKey();
    const first = defaultValue();
    const second = defaultValue();
    expect(isValidUuid(first)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('is time-ordered, so insertion order is recoverable', () => {
    const {defaultValue} = dbUtils.uuidPrimaryKey();
    const keys = Array.from({length: 5}, () => defaultValue());
    expect(keys).toEqual([...keys].sort());
  });

  it('draws every key from the generator it is handed', () => {
    let count = 0;
    const {defaultValue} = dbUtils.uuidPrimaryKey(() => `key-${++count}`);
    expect([defaultValue(), defaultValue()]).toEqual(['key-1', 'key-2']);
  });
});

describe('asNumber', () => {
  const value = raw =>
    dbUtils.asNumber('price').call({getDataValue: () => raw});

  it('coerces the string PostgreSQL hands back to a number', () => {
    expect(value('3.50')).toBe(3.5);
  });

  it('keeps null as null rather than coercing it to zero', () => {
    expect(value(null)).toBeNull();
  });
});

describe('getPlain', () => {
  it('returns null for an absent row rather than an empty object', () => {
    expect(dbUtils.getPlain(null)).toBeNull();
    expect(dbUtils.getPlain(undefined)).toBeNull();
  });

  it('copies a raw row so a caller may assign onto it', () => {
    const source = {id: 'a'};
    const copy = dbUtils.getPlain(source);
    copy.extra = true;
    expect(source).not.toHaveProperty('extra');
  });

  it('unwraps a model instance', () => {
    const instance = FixtureRecord.build({
      name: 'someone@example.com',
      secret: 'x',
    });
    expect(dbUtils.getPlain(instance).name).toBe('someone@example.com');
  });
});

describe('iLike', () => {
  it('wraps the term for a contains match', () => {
    expect(dbUtils.iLike('abc')[Op.iLike]).toBe('%abc%');
  });

  it.each([
    ['percent', '50%', '%50\\%%'],
    ['underscore', 'a_b', '%a\\_b%'],
    ['backslash', 'a\\b', '%a\\\\b%'],
  ])(
    'neutralises a %s so a search term cannot widen its own match',
    (_label, term, expected) => {
      expect(dbUtils.iLike(term)[Op.iLike]).toBe(expected);
    },
  );
});

describe('anyOf', () => {
  it('passes a scalar through as equality', () => {
    expect(dbUtils.anyOf('a')).toBe('a');
  });

  it('turns a list into a set membership test', () => {
    expect(dbUtils.anyOf(['a', 'b'])[Op.in]).toEqual(['a', 'b']);
  });
});

describe('nullState', () => {
  it('asks for the null side and the non-null side', () => {
    expect(dbUtils.nullState([true])[Op.not]).toBeNull();
    expect(dbUtils.nullState([false])[Op.is]).toBeNull();
  });

  it('declines to filter when both states are wanted, or neither', () => {
    expect(dbUtils.nullState([true, false])).toBeUndefined();
    expect(dbUtils.nullState([])).toBeUndefined();
  });
});

describe('getIds', () => {
  it('projects the identifiers', () => {
    expect(dbUtils.getIds([{id: 'a'}, {id: 'b'}])).toEqual(['a', 'b']);
  });
});

describe('relatedTo', () => {
  const build = values =>
    dbUtils.relatedTo(
      {
        through: FixtureRecordTag,
        foreignKey: 'recordId',
        otherKey: 'tagId',
        values,
      },
      FixtureRecord,
    ).val;

  it('names the physical columns rather than the attribute names', () => {
    const sql = build(['a']);
    expect(sql).toContain('"record_id"');
    expect(sql).toContain('"tag_id"');
    expect(sql).toContain('"fixture_record_tags"');
  });

  it('escapes every value, so a filter cannot break out of the clause', () => {
    const sql = build(["' OR 1=1 --"]);
    expect(sql).toContain("'' OR 1=1 --");
    expect(sql).not.toMatch(/IN \('' OR 1=1 --'\)\s*\)$/);
    expect(sql.split("'").length % 2).toBe(1);
  });
});

describe('relatedMaxAtMost', () => {
  const build = limit =>
    dbUtils.relatedMaxAtMost(
      {
        through: FixtureRecordTag,
        foreignKey: 'recordId',
        otherKey: 'tagId',
        target: FixtureTag,
        attribute: 'rank',
        limit,
      },
      FixtureRecord,
    ).val;

  it('passes a row by proving no related row rises above the limit', () => {
    const sql = build(1000);
    expect(sql.startsWith('NOT EXISTS')).toBe(true);
    expect(sql).toContain('"rank" > 1000');
  });

  it('names the physical columns and joins the target on its own key', () => {
    const sql = build(0);
    expect(sql).toContain('"fixture_tags"');
    expect(sql).toContain('"tag_id"');
    expect(sql).toContain('"record_id"');
  });

  it('escapes the limit, so a value cannot break out of the clause', () => {
    const sql = build("' OR 1=1 --");
    expect(sql).toContain("'' OR 1=1 --");
    expect(sql.split("'").length % 2).toBe(1);
  });
});

describe('relatedCount', () => {
  it('counts related rows as an integer, correlated on the physical keys', () => {
    const sql = dbUtils.relatedCount(
      {target: FixtureRecordTag, foreignKey: 'recordId'},
      FixtureRecord,
    ).val;
    expect(sql).toContain('SELECT COUNT(*)::int');
    expect(sql).toContain('"fixture_record_tags"');
    expect(sql).toContain('rel."record_id" = "FixtureRecord"."id"');
  });
});

describe('relatedNone', () => {
  it('passes a row only while no related row points at it, correlated on the physical keys', () => {
    const sql = dbUtils.relatedNone(
      {target: FixtureRecordTag, foreignKey: 'recordId'},
      FixtureRecord,
    ).val;
    expect(sql).toBe(
      'NOT EXISTS (SELECT 1 FROM "fixture_record_tags" rel WHERE rel."record_id" = "FixtureRecord"."id")',
    );
  });
});

describe('relatedSum', () => {
  const Charge = sequelize.define(
    'Charge',
    {recordId: DataTypes.UUID, amountDue: DataTypes.DECIMAL},
    {tableName: 'charges'},
  );
  const sql = dbUtils.relatedSum(
    {target: Charge, foreignKey: 'recordId', attribute: 'amountDue'},
    FixtureRecord,
  ).val;

  it('sums the physical column, correlated on the physical keys', () => {
    expect(sql).toContain('SUM(rel."amount_due")');
    expect(sql).toContain('"charges"');
    expect(sql).toContain('rel."record_id" = "FixtureRecord"."id"');
  });

  it('answers zero rather than null when nothing is related', () => {
    expect(sql).toMatch(/^\(SELECT COALESCE\(SUM\(.+\), 0\)/);
  });
});

describe('caseMap', () => {
  it('falls back to the plain column when there is nothing to map', () => {
    const literal = dbUtils.caseMap(
      {keyAttribute: 'id', valueAttribute: 'rank', rows: []},
      FixtureTag,
    );
    expect(literal.val).toBe('"rank"');
  });

  it('builds one branch per row, escaping both sides', () => {
    const literal = dbUtils.caseMap(
      {
        keyAttribute: 'id',
        valueAttribute: 'rank',
        rows: [
          {id: 'a', rank: 1000},
          {id: "b'--", rank: 2000},
        ],
      },
      FixtureTag,
    );
    expect(literal.val).toContain("WHEN 'a' THEN 1000");
    expect(literal.val).toContain("WHEN 'b''--' THEN 2000");
    expect(literal.val).toContain('ELSE "rank" END');
  });
});
