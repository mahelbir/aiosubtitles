import {sequelize} from '../../src/db/index.js';
import {redis} from '../../src/redis/index.js';

export async function recordQueries(run) {
  const statements = [];
  const previous = sequelize.options.logging;
  sequelize.options.logging = sql => statements.push(sql);
  try {
    await run();
  } finally {
    sequelize.options.logging = previous;
  }
  return statements;
}

export async function recordRedisCommands(run) {
  const commands = [];
  const original = redis.sendCommand;
  redis.sendCommand = function (command, ...rest) {
    commands.push(command.name);
    return original.call(this, command, ...rest);
  };
  try {
    await run();
  } finally {
    redis.sendCommand = original;
  }
  return commands;
}
