import {EmptyResultError, Model} from 'sequelize';
import {dbUtils} from './utils.js';

export class BaseModel extends Model {
  static notFoundMessage = 'Record not found.';
  static duplicateMessage = 'Record already exists.';
  static foreignKeyMessage =
    'The action could not be completed because related records exist.';

  static get notFound() {
    return new EmptyResultError(this.notFoundMessage);
  }

  static withScope(name, ...args) {
    const applied = [
      ...(Object.hasOwn(this, '_appliedScopes') ? this._appliedScopes : []),
      args.length > 0 ? {method: [name, ...args]} : name,
    ];
    const scoped = this.scope(applied);
    scoped._appliedScopes = applied;
    return scoped;
  }

  static async findAllLocked(options, transaction) {
    await this._lockRows(options.where, transaction);
    return this.findAll({...options, transaction});
  }

  static async findOneLocked(options, transaction) {
    await this._lockRows(options.where, transaction);
    return this.findOne({...options, transaction});
  }

  static _lockRows(where, transaction) {
    const model = this.unscoped();
    const keys = model.primaryKeyAttributes;
    return model.findAll({
      attributes: keys,
      where,
      order: keys.map(key => [key, 'ASC']),
      lock: dbUtils.lockOf(model, transaction),
      transaction,
      raw: true,
    });
  }

  static async findOneAndUpdate(
    findOptions = {},
    updateValues = {},
    useTransaction = false,
  ) {
    if (!useTransaction) {
      const row = await this.findOne(findOptions);
      if (!row) {
        return null;
      }
      row.set(updateValues);
      await row.save();
      return row;
    }
    return this.sequelize.transaction(async transaction => {
      const row = await this.findOne({
        ...findOptions,
        transaction,
        lock: transaction.LOCK.UPDATE,
        skipLocked: true,
      });
      if (!row) {
        return null;
      }
      row.set(updateValues);
      await row.save({transaction});
      return row;
    });
  }
}
