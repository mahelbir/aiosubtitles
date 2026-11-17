import {dbCli} from '../../src/db/cli/runner.js';
import {
  DB_CLI_FIXTURE_CLEANUP_LOG,
  DB_CLI_FIXTURE_FAILING_CACHE,
  DB_CLI_FIXTURE_FAILING_TASK,
  DB_CLI_FIXTURE_TASK_LOG,
  DB_CLI_FIXTURE_WITHOUT_CLEANUP,
} from './cli.js';

const [scenario] = process.argv.slice(2);

const options = {
  cleanup: () =>
    dbCli.dropCaches([
      async () => {
        throwOn(DB_CLI_FIXTURE_FAILING_CACHE);
        dbCli.log.info(DB_CLI_FIXTURE_CLEANUP_LOG);
      },
    ]),
};

await dbCli.run(
  async () => {
    dbCli.log.info(DB_CLI_FIXTURE_TASK_LOG);
    throwOn(DB_CLI_FIXTURE_FAILING_TASK);
  },
  scenario === DB_CLI_FIXTURE_WITHOUT_CLEANUP ? undefined : options,
);

function throwOn(stage) {
  if (scenario === stage) {
    throw new Error(`Fixture ${stage} failed.`);
  }
}
