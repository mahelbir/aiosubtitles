import {EVAL_COMMANDS, parseEvalArgs} from './cli-args.js';
import {METRICS_LOCK_PATH, METRICS_PATH} from './eval-paths.js';
import {assertMetricsLock} from './metrics-lock.js';
import {redactReportText} from './report/redact.js';

export const runEvalCli = async ({argv, writeLine}) => {
  const {command, atlasRoot, commandOptions} = parseEvalArgs(argv);
  await assertMetricsLock({
    metricsPath: METRICS_PATH,
    lockPath: METRICS_LOCK_PATH,
  });
  await EVAL_COMMANDS[command].run({atlasRoot, commandOptions, writeLine});
};

if (import.meta.main) {
  try {
    await runEvalCli({
      argv: process.argv.slice(2),
      writeLine: line => process.stdout.write(`${line}\n`),
    });
  } catch (error) {
    process.stderr.write(`${redactReportText(error.message)}\n`);
    process.exitCode = 1;
  }
}
