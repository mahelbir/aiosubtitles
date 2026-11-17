import {mapValues, omit} from 'es-toolkit';
import {z} from 'zod';

// Recursive schemas are unsupported: walking their shape never ends.
export function toPatchSchema(schema) {
  return z.strictObject(
    mapValues(schema.shape, field => toPatchField(field).optional()),
  );
}

function toPatchField(field) {
  const patched = toBarePatchField(field);
  const meta = z.globalRegistry.get(field);
  return meta && patched !== field ? patched.meta(omit(meta, ['id'])) : patched;
}

function toBarePatchField(field) {
  if (
    field instanceof z.ZodDefault ||
    field instanceof z.ZodPrefault ||
    field instanceof z.ZodCatch ||
    field instanceof z.ZodReadonly ||
    field instanceof z.ZodLazy
  ) {
    return toPatchField(field.unwrap());
  }
  if (field instanceof z.ZodOptional) {
    return toPatchField(field.unwrap()).optional();
  }
  if (field instanceof z.ZodNullable) {
    return toPatchField(field.unwrap()).nullable();
  }
  if (field instanceof z.ZodPipe) {
    const input = toPatchField(field.in);
    return input === field.in ? field : input;
  }
  return field instanceof z.ZodObject ? toPatchSchema(field) : field;
}
