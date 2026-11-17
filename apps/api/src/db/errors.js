import {StatusCodes} from 'http-status-codes';
import {
  EmptyResultError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
} from 'sequelize';
import {conflict} from '../lib/errors.js';
import {BaseModel} from './base-model.js';

function duplicateMessage(err) {
  const attributed =
    Object.keys(err.fields ?? {}).length > 0 &&
    err.message !== 'Validation error';
  return attributed ? err.message : BaseModel.duplicateMessage;
}

export function mapDbError(err) {
  if (err instanceof UniqueConstraintError) {
    return conflict(duplicateMessage(err));
  }
  if (err instanceof EmptyResultError) {
    return {
      message: err.message || BaseModel.notFoundMessage,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }
  if (err instanceof ForeignKeyConstraintError) {
    return conflict(BaseModel.foreignKeyMessage);
  }
  return null;
}
