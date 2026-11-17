import {z} from 'zod';
import {getCrossFieldCheck} from '../schemas/common.js';
import {toPatchSchema} from './schema.js';

/**
 * @template {import('zod').ZodRawShape} E
 * @template {import('zod').ZodRawShape} [S={}]
 * @param {object} options
 * @param {E} options.editableFields
 * @param {S} [options.serverFields]
 * @param {{keys: string[], check: import('zod').core.$ZodCheck<any>}[]} [options.rules]
 * @returns {Readonly<{
 *   editableSchema: import('zod').ZodObject<import('zod').core.util.Writeable<E>>,
 *   schema: import('zod').ZodObject<import('zod').core.util.Extend<
 *     import('zod').core.util.Writeable<E>,
 *     import('zod').core.util.Writeable<S>
 *   >>,
 *   updateSchema: import('zod').ZodObject<import('zod').ZodRawShape, import('zod').core.$strict>,
 *   getChecksWithin: (keys?: string[]) => import('zod').core.$ZodCheck<any>[],
 * }>}
 */
export function defineSettings({
  editableFields,
  serverFields = /** @type {S} */ ({}),
  rules = [],
}) {
  const editableSchema = z.object(editableFields);
  const editableKeys = Object.keys(editableFields);

  return Object.freeze({
    editableSchema,
    schema: editableSchema
      .extend(serverFields)
      .check(...rules.map(rule => rule.check)),
    updateSchema: toPatchSchema(editableSchema),
    getChecksWithin: (keys = editableKeys) =>
      rules
        .filter(rule => rule.keys.every(key => keys.includes(key)))
        .map(rule => rule.check),
  });
}

export function getSettingsRule(keys, isSatisfied, params) {
  return Object.freeze({
    keys,
    check: getCrossFieldCheck(keys, isSatisfied, params),
  });
}
