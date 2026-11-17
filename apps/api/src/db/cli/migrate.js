import {dbCli} from './runner.js';
import {createMigrator, runCli} from './umzug.js';

await dbCli.run(() => runCli(createMigrator(dbCli.log)));
