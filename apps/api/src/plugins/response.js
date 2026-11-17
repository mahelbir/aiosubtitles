import fp from 'fastify-plugin';
import {StatusCodes} from 'http-status-codes';
import {hasZodFastifySchemaValidationErrors} from '@fastify/type-provider-zod';
import {throwIfDenied} from '../lib/errors.js';
import {
  errorEnvelope,
  successEnvelope,
  toFailure,
  toValidationFailure,
} from '../lib/response.js';

export default fp(
  async function responsePlugin(fastify) {
    fastify.decorateReply(
      'success',
      function (data = null, message = null, statusCode = StatusCodes.OK) {
        return this.code(statusCode).send(successEnvelope(data, message));
      },
    );

    fastify.decorateReply(
      'error',
      function (
        data = null,
        message = null,
        statusCode = StatusCodes.BAD_REQUEST,
      ) {
        return this.code(statusCode).send(errorEnvelope(data, message));
      },
    );

    fastify.decorateReply(
      'respond',
      function ({statusCode, data = null, message = null}) {
        const isSuccess =
          statusCode >= StatusCodes.OK &&
          statusCode < StatusCodes.MULTIPLE_CHOICES;
        return isSuccess
          ? this.success(data, message, statusCode)
          : this.error(data, message, statusCode);
      },
    );

    fastify.decorateReply('abort', function (denied) {
      throwIfDenied(denied);
    });

    fastify.decorateReply(
      'validationError',
      function (
        zodError,
        message = null,
        statusCode = StatusCodes.UNPROCESSABLE_ENTITY,
      ) {
        const failure = toValidationFailure(zodError);
        return this.code(statusCode).send(
          errorEnvelope(failure.data, message || failure.message),
        );
      },
    );

    fastify.setNotFoundHandler((request, reply) => {
      reply.error(null, 'Page not found.', StatusCodes.NOT_FOUND);
    });

    fastify.setErrorHandler((err, request, reply) => {
      if (hasZodFastifySchemaValidationErrors(err)) {
        const issues = err.validation.map(v => ({
          // "/nested/age" -> ["nested","age"]; only misparses if a schema key itself contains "/"
          path: v.instancePath.split('/').slice(1),
          message: v.message,
        }));
        return reply.validationError({issues});
      }
      // Known client errors keep their status and message; only the rest are logged.
      const failure = toFailure(err);
      if (failure.statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
        request.log.error(err);
      }
      return reply.respond(failure);
    });
  },
  {name: 'response'},
);
