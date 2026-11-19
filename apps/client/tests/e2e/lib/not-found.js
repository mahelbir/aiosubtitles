import {StatusCodes} from 'http-status-codes';
import {getFailedRequestPattern} from './api.js';

export const MISSING_RECORD_ID = '00000000-0000-4000-8000-000000000000';

export const MALFORMED_RECORD_ID = 'abc';

export const MISSING_PAGE_PATH = '/e2e-missing-page';

export function getMissingRecordPattern(collectionPath) {
  return getFailedRequestPattern({
    [`${collectionPath}/${MISSING_RECORD_ID}`]: [StatusCodes.NOT_FOUND],
    [`${collectionPath}/${MALFORMED_RECORD_ID}`]: [
      StatusCodes.UNPROCESSABLE_ENTITY,
    ],
  });
}
