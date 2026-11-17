import {groupBy} from 'es-toolkit';

export function toOptionSections(options) {
  return Object.entries(groupBy(options, option => option.group ?? '')).map(
    ([key, items]) => ({key, items}),
  );
}
