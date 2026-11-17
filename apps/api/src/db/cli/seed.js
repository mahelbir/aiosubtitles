import {dbCli} from './runner.js';
import {createSeeder, runCli} from './umzug.js';

await dbCli.run(() => runCli(createSeeder(dbCli.log)));
