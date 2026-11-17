'use client';

import {isPlainObject} from 'es-toolkit';

export function FixtureState({value}) {
  return (
    <pre
      data-testid="fixture-state"
      className="overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-xs"
    >
      {JSON.stringify(value, sortKeys, 2)}
    </pre>
  );
}

function sortKeys(key, value) {
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map(name => [name, value[name]]),
  );
}
