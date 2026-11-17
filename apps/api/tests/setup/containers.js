import {startInfrastructure} from '../helpers/infrastructure.js';

export default async function setup() {
  const {teardown} = await startInfrastructure({env: {API_BASE_PATH: ''}});
  const {sequelize} = await import('../../src/db/index.js');
  await sequelize.close();
  return teardown;
}
