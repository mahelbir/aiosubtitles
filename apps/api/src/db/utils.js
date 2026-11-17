import {compact} from 'es-toolkit';
import {DataTypes, Op, QueryTypes} from 'sequelize';
import {uuidV7} from '../lib/common.js';
import {sequelize} from './index.js';

const quote = name => sequelize.getQueryInterface().quoteIdentifier(name);

const columnOf = (model, attribute) =>
  quote(model.getAttributes()[attribute].field);

const ownerCondition = (through, foreignKey, model) =>
  `rel.${columnOf(through, foreignKey)} = ${quote(model.name)}.${quote(model.primaryKeyField)}`;

const relatedExists = (
  {through, foreignKey, join = '', predicate, negate = false},
  model,
) =>
  sequelize.literal(
    `${negate ? 'NOT ' : ''}EXISTS (SELECT 1 FROM ${quote(through.tableName)} rel${join}` +
      ` WHERE ${compact([ownerCondition(through, foreignKey, model), predicate]).join(' AND ')})`,
  );

const relatedAggregate = ({target, foreignKey, select}, model) =>
  sequelize.literal(
    `(SELECT ${select} FROM ${quote(target.tableName)} rel` +
      ` WHERE ${ownerCondition(target, foreignKey, model)})`,
  );

export const dbUtils = {
  quoteIdentifier(name) {
    return quote(name);
  },

  uuidPrimaryKey(generateId = uuidV7) {
    return {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => generateId(),
    };
  },

  asNumber(field) {
    return function () {
      const value = this.getDataValue(field);
      return value == null ? value : Number(value);
    };
  },

  /* Always a fresh top-level object, so callers may assign onto it; nested values
     are shared, so rebuild a branch rather than mutating one. */
  getPlain(row) {
    if (row === null || row === undefined) {
      return null;
    }
    return typeof row.get === 'function' ? row.get({plain: true}) : {...row};
  },

  lockOf(model, transaction) {
    return {level: transaction.LOCK.UPDATE, of: model};
  },

  getIds(rows) {
    return rows.map(row => row.id);
  },

  iLikePattern(value) {
    return `%${value.replace(/[%_\\]/g, '\\$&')}%`;
  },

  iLike(value) {
    return {[Op.iLike]: dbUtils.iLikePattern(value)};
  },

  anyOf(value) {
    return Array.isArray(value) ? {[Op.in]: value} : value;
  },

  relatedTo({through, foreignKey, otherKey, values}, model) {
    const list = values.map(value => sequelize.escape(value)).join(', ');
    return relatedExists(
      {
        through,
        foreignKey,
        predicate: `rel.${columnOf(through, otherKey)} IN (${list})`,
      },
      model,
    );
  },

  relatedMaxAtMost(
    {through, foreignKey, otherKey, target, attribute, limit},
    model,
  ) {
    return relatedExists(
      {
        through,
        foreignKey,
        join:
          ` JOIN ${quote(target.tableName)} tgt` +
          ` ON tgt.${quote(target.primaryKeyField)} = rel.${columnOf(through, otherKey)}`,
        predicate: `tgt.${columnOf(target, attribute)} > ${sequelize.escape(limit)}`,
        negate: true,
      },
      model,
    );
  },

  relatedNone({target, foreignKey}, model) {
    return relatedExists({through: target, foreignKey, negate: true}, model);
  },

  relatedCount({target, foreignKey}, model) {
    return relatedAggregate(
      {target, foreignKey, select: 'COUNT(*)::int'},
      model,
    );
  },

  relatedSum({target, foreignKey, attribute}, model) {
    return relatedAggregate(
      {
        target,
        foreignKey,
        select: `COALESCE(SUM(rel.${columnOf(target, attribute)}), 0)::float8`,
      },
      model,
    );
  },

  caseMap({keyAttribute, valueAttribute, rows}, model) {
    const valueColumn = columnOf(model, valueAttribute);
    if (rows.length === 0) {
      return sequelize.literal(valueColumn);
    }
    const branches = rows.map(
      row =>
        `WHEN ${sequelize.escape(row[keyAttribute])}` +
        ` THEN ${sequelize.escape(row[valueAttribute])}`,
    );
    return sequelize.literal(
      `CASE ${columnOf(model, keyAttribute)} ${branches.join(' ')} ELSE ${valueColumn} END`,
    );
  },

  nullState(flags) {
    return flags.length === 1 ? {[flags[0] ? Op.not : Op.is]: null} : undefined;
  },

  async refuseRollbackIf(
    {query, replacements, reason, transaction},
    queryInterface,
  ) {
    const [{count}] = await queryInterface.sequelize.query(
      `SELECT COUNT(*)::int AS count FROM (${query}) blocking`,
      {replacements, transaction, type: QueryTypes.SELECT},
    );
    if (count > 0) {
      throw new Error(`Refusing to roll back: ${count} row(s) ${reason}.`);
    }
  },
};
