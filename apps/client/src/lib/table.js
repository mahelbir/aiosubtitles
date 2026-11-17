export function sortingToQuery(sorting) {
  return sorting.map(({id, desc}) => (desc ? `-${id}` : id));
}

export function queryToSorting(sort = []) {
  return sort.map(field =>
    field.startsWith('-')
      ? {id: field.slice(1), desc: true}
      : {id: field, desc: false},
  );
}
