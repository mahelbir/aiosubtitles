import {StatusCodes} from 'http-status-codes';
import {errorEnvelope, successEnvelope, toFailure} from '../lib/response.js';

export function ackSuccess(data = null, message = null) {
  return {...successEnvelope(data, message), statusCode: StatusCodes.OK};
}

/**
 * @param {{statusCode?: number, message?: string, errorCode?: string}} err
 * @returns {import('../lib/response.js').Failure & {success: false}}
 */
export function ackFailure(err) {
  const failure = toFailure(err);
  return {
    ...errorEnvelope(failure.data, failure.message),
    statusCode: failure.statusCode,
  };
}

/**
 * @param {{statusCode?: number, message?: string}} err
 * @returns {Error}
 */
export function toHandshakeError(err) {
  const envelope = ackFailure(err);
  const error = new Error(envelope.message);
  error.data = envelope;
  return error;
}
