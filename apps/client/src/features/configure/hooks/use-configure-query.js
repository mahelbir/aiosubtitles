'use client';

import {parseAsString, parseAsStringLiteral, useQueryStates} from 'nuqs';

export const CONFIGURE_PATH = '/configure';

export const SIGN_IN_VIEW = 'sign-in';

const configureQueryParsers = {
  userConfigId: parseAsString,
  view: parseAsStringLiteral([SIGN_IN_VIEW]),
};

export function useConfigureQuery() {
  return useQueryStates(configureQueryParsers);
}
