import {ExpectedClass} from '../constants/expected-class.js';
import {getContentGroups} from '../corpus/content-groups.js';
import {readCorpus} from '../corpus/read-corpus.js';

const UNCLASSED_LABEL = 'unclassed';

export const runInspect = async ({atlasRoot, codenames, writeLine}) => {
  const evalCases = await readCorpus({atlasRoot, codenames});
  const contentGroups = evalCases.flatMap(getContentGroups);
  const contentGroupsByClass = Map.groupBy(
    contentGroups,
    contentGroup => contentGroup.groupClass ?? UNCLASSED_LABEL,
  );
  const classLabels = new Set([
    ...ExpectedClass.toList().map(({value: groupClass}) => groupClass),
    UNCLASSED_LABEL,
    ...contentGroupsByClass.keys(),
  ]);
  const classTotals = [...classLabels].map(
    classLabel =>
      `${classLabel} ${contentGroupsByClass.get(classLabel)?.length ?? 0}`,
  );
  writeLine(`cases: ${evalCases.length}`);
  writeLine(
    `candidates: ${evalCases.flatMap(evalCase => evalCase.candidates).length}`,
  );
  writeLine(`content groups: ${contentGroups.length}`);
  writeLine(`classes: ${classTotals.join(', ')}`);
};
