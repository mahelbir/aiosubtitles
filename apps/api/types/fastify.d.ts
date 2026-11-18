import 'fastify';
import type {ZodError} from 'zod';

type RateLimitSkippedIdentity = null;

type RateLimitDefaultIdentity = undefined;

type RateLimitIdentify = (
  request: import('fastify').FastifyRequest,
) =>
  | string
  | RateLimitSkippedIdentity
  | RateLimitDefaultIdentity
  | Promise<string | RateLimitSkippedIdentity | RateLimitDefaultIdentity>;

declare module 'fastify' {
  interface FastifyInstance {
    issueUserConfigSession(userConfigId: string): Promise<string>;

    verifyUserConfigSession(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void>;

    guardSubtree(
      guards: ((request: FastifyRequest, reply: FastifyReply) => unknown)[],
    ): void;

    startRunner(runner: {
      name: string;
      runningJobs: Record<string | number, unknown>;
      executeJobs(pollIntervalMs?: number): Promise<void>;
      disableJob(id: string | number): void;
    }): void;

    resolveClientIp(peer: {
      remoteAddress?: string;
      headers: import('node:http').IncomingHttpHeaders;
    }): string;

    rateLimiter(options: {
      max: number;
      timeWindow: number;
      key?: string;
      scope?: string;
      identify?: RateLimitIdentify;
      penalty?: string;
    }): ReturnType<FastifyInstance['createRateLimit']> & {
      reset(request: FastifyRequest): Promise<number>;
      refund(request: FastifyRequest): Promise<void>;
    };

    settings: typeof import('../src/lib/settings.js').settings;

    settingsDefinition: typeof import('@repo/shared/schemas/setting.js').settingsDefinition;
  }

  interface FastifyRequest {
    readonly clientIp: string;

    rateLimit: Awaited<
      ReturnType<ReturnType<FastifyInstance['createRateLimit']>>
    > | null;
  }

  interface FastifyReply {
    respond(options: {
      statusCode: number;
      data?: unknown;
      message?: string | null;
    }): FastifyReply;

    abort(denied?: {message: string; statusCode: number} | null): void;

    success(
      data?: unknown,
      message?: string | null,
      statusCode?: number,
    ): FastifyReply;

    error(
      data?: {errorCode?: string; [key: string]: unknown} | null,
      message?: string | null,
      statusCode?: number,
    ): FastifyReply;

    validationError(
      zodError: ZodError,
      message?: string | null,
      statusCode?: number,
    ): FastifyReply;
  }

  interface FastifyContextConfig {
    rateLimits?: {
      max: number;
      timeWindow: number;
      key?: string;
      identify?: RateLimitIdentify;
      penalty?: string;
    }[];
    rateLimitGroup?: string;
    exclusiveRateLimits?: boolean;
    skipRateLimit?: (request: FastifyRequest) => boolean | Promise<boolean>;
    skipGlobalRateLimit?: (
      request: FastifyRequest,
    ) => boolean | Promise<boolean>;
    onRateLimited?: (
      request: FastifyRequest,
      result: Awaited<
        ReturnType<ReturnType<FastifyInstance['createRateLimit']>>
      >,
      reply: FastifyReply,
    ) => void | FastifyReply | Promise<void | FastifyReply>;
    isAddonRoute?: boolean;
    replyAddonFallback?: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => FastifyReply;
  }
}
