import {describe, expect, it} from 'vitest';
import {DataTypes, Op} from 'sequelize';
import {sequelize} from '../../src/db/index.js';
import {dbUtils} from '../../src/db/utils.js';
import {isValidUuid} from '../../src/lib/common.js';
import {User} from '../../src/db/models/user.js';
import {UserRole} from '../../src/db/models/user-role.js';
import {Role} from '../../src/db/models/role.js';

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
    const instance = User.build({email: 'someone@example.com', password: 'x'});
    expect(dbUtils.getPlain(instance).email).toBe('someone@example.com');
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
        through: UserRole,
        foreignKey: 'userId',
        otherKey: 'roleId',
        values,
      },
      User,
    ).val;

  it('names the physical columns rather than the attribute names', () => {
    const sql = build(['a']);
    expect(sql).toContain('"user_id"');
    expect(sql).toContain('"role_id"');
    expect(sql).toContain('"user_roles"');
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
        through: UserRole,
        foreignKey: 'userId',
        otherKey: 'roleId',
        target: Role,
        attribute: 'position',
        limit,
      },
      User,
    ).val;

  it('passes a row by proving no related row rises above the limit', () => {
    const sql = build(1000);
    expect(sql.startsWith('NOT EXISTS')).toBe(true);
    expect(sql).toContain('"position" > 1000');
  });

  it('names the physical columns and joins the target on its own key', () => {
    const sql = build(0);
    expect(sql).toContain('"roles"');
    expect(sql).toContain('"role_id"');
    expect(sql).toContain('"user_id"');
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
      {target: UserRole, foreignKey: 'userId'},
      User,
    ).val;
    expect(sql).toContain('SELECT COUNT(*)::int');
    expect(sql).toContain('"user_roles"');
    expect(sql).toContain('rel."user_id" = "User"."id"');
  });
});

describe('relatedNone', () => {
  it('passes a row only while no related row points at it, correlated on the physical keys', () => {
    const sql = dbUtils.relatedNone(
      {target: UserRole, foreignKey: 'userId'},
      User,
    ).val;
    expect(sql).toBe(
      'NOT EXISTS (SELECT 1 FROM "user_roles" rel WHERE rel."user_id" = "User"."id")',
    );
  });
});

describe('relatedSum', () => {
  const Charge = sequelize.define(
    'Charge',
    {userId: DataTypes.UUID, amountDue: DataTypes.DECIMAL},
    {tableName: 'charges'},
  );
  const sql = dbUtils.relatedSum(
    {target: Charge, foreignKey: 'userId', attribute: 'amountDue'},
    User,
  ).val;

  it('sums the physical column, correlated on the physical keys', () => {
    expect(sql).toContain('SUM(rel."amount_due")');
    expect(sql).toContain('"charges"');
    expect(sql).toContain('rel."user_id" = "User"."id"');
  });

  it('answers zero rather than null when nothing is related', () => {
    expect(sql).toMatch(/^\(SELECT COALESCE\(SUM\(.+\), 0\)/);
  });
});

describe('caseMap', () => {
  it('falls back to the plain column when there is nothing to map', () => {
    const literal = dbUtils.caseMap(
      {keyAttribute: 'id', valueAttribute: 'position', rows: []},
      Role,
    );
    expect(literal.val).toBe('"position"');
  });

  it('builds one branch per row, escaping both sides', () => {
    const literal = dbUtils.caseMap(
      {
        keyAttribute: 'id',
        valueAttribute: 'position',
        rows: [
          {id: 'a', position: 1000},
          {id: "b'--", position: 2000},
        ],
      },
      Role,
    );
    expect(literal.val).toContain("WHEN 'a' THEN 1000");
    expect(literal.val).toContain("WHEN 'b''--' THEN 2000");
    expect(literal.val).toContain('ELSE "position" END');
  });
});
