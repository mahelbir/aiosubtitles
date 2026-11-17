import {Op} from 'sequelize';
import {toOffsetPagePayload} from '@repo/shared/lib/pagination.js';
import {
  OFFSET_PAGINATION_KEYS,
  toOffsetPageRequest,
} from '../lib/pagination.js';
import {dbUtils} from './utils.js';

export async function paginateByOffset(model, query = {}, options = {}) {
  if (!options.attributes && !model._scope?.attributes) {
    throw new Error(`${model.name} cannot be paged without named attributes`);
  }
  const findOptions = buildListQuery(model, query, options);
  const page = toOffsetPageRequest(query);

  const {rows: items, count: totalItemCount} = await model.findOffsetPage(
    page.offset,
    page.pageSize,
    findOptions,
  );

  return toOffsetPagePayload({...page, items, totalItemCount});
}

function resolveDirection(model, path, isDesc) {
  let target = model;
  for (const step of path.slice(0, -1)) {
    target = target?.associations?.[step]?.target;
  }
  const attribute = target?.getAttributes?.()[path.at(-1)];
  if (attribute?.primaryKey || attribute?.allowNull === false) {
    return isDesc ? 'DESC' : 'ASC';
  }
  /* A nullable sort key has no keyset comparison, so orders reaching here rule out cursor
     pagination. An index meant to serve this order must spell the same NULLS position —
     B-tree defaults to the opposite. */
  return isDesc ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'; // PostgreSQL-specific
}

function buildOrder(model, sort = [], fallback = []) {
  const order = [];
  const used = new Set();
  const push = (path, direction) => {
    const key = path.join('.');
    if (!used.has(key)) {
      used.add(key);
      order.push([...path, direction]);
    }
  };
  for (const field of sort) {
    const isDesc = field.startsWith('-');
    const path = (isDesc ? field.slice(1) : field).split('.');
    push(path, resolveDirection(model, path, isDesc));
  }
  for (const entry of [...fallback, ['id', 'DESC']]) {
    push(entry.slice(0, -1), entry.at(-1));
  }
  return order;
}

function isBlankFilter(value) {
  return (
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function buildListQuery(model, query = {}, options = {}) {
  const {filters = {}, order, where, include = [], ...findOptions} = options;
  const conditions = [];
  const includes = [...include];
  const attributes = model.getAttributes?.() ?? {};
  for (const [key, value] of Object.entries(query)) {
    const rule = Object.hasOwn(filters, key) ? filters[key] : undefined;
    if (rule === false || isBlankFilter(value)) {
      continue;
    }
    if (rule === undefined) {
      if (OFFSET_PAGINATION_KEYS.has(key) || !Object.hasOwn(attributes, key)) {
        continue;
      }
      conditions.push({[key]: dbUtils.anyOf(value)});
      continue;
    }
    const condition = rule(value, {include: includes});
    if (condition) {
      conditions.push(condition);
    }
  }
  if (where) {
    conditions.push(where);
  }
  return {
    ...findOptions,
    where:
      conditions.length > 1 ? {[Op.and]: conditions} : (conditions[0] ?? {}),
    include: includes,
    order: buildOrder(model, query.sort, order),
  };
}
