import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {ForeignKeyConstraintError, UniqueConstraintError} from 'sequelize';
import {BaseModel} from '../../src/db/base-model.js';
import {mapDbError} from '../../src/db/errors.js';

describe('mapDbError', () => {
  it('words a duplicate with the shared fallback when no column names it', () => {
    expect(mapDbError(new UniqueConstraintError({}))).toEqual({
      message: BaseModel.duplicateMessage,
      statusCode: StatusCodes.CONFLICT,
    });
  });

  it.each(['parent', 'child', undefined])(
    'answers every foreign-key violation with one shared message (%s)',
    reltype => {
      const err = new ForeignKeyConstraintError({table: 'roles', reltype});
      expect(mapDbError(err)).toEqual({
        message: BaseModel.foreignKeyMessage,
        statusCode: StatusCodes.CONFLICT,
      });
    },
  );

  it('leaves an error it does not own to the next mapper', () => {
    expect(mapDbError(new Error('boom'))).toBeNull();
  });
});
