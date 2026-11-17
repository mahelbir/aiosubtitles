import {BaseModel} from '../../src/db/base-model.js';
import {sequelize} from '../../src/db/index.js';

export function getAppModels() {
  const models = Object.values(sequelize.models).filter(
    model => model.prototype instanceof BaseModel,
  );
  if (models.length === 0) {
    throw new Error('No model is registered yet: boot the app first.');
  }
  return models;
}
