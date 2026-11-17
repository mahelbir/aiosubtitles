import 'fastify';
import type {ZodError} from 'zod';

declare module 'fastify' {
  interface FastifyInstance {
    startRunner(runner: {
      name: string;
      runningJobs: Record<string | number, unknown>;
      executeJobs(pollIntervalMs?: number): Promise<void>;
      disableJob(id: string | number): void;
    }): void;

    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;

    requirePermission(
      required: string,
    ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;

    requirePermissions(
      required: string[],
    ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;

    requireAnyPermission(
      required: string[],
    ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;

    resolveClientIp(peer: {
      remoteAddress?: string;
      headers: import('node:http').IncomingHttpHeaders;
    }): string;

    rateLimiter(options: {
      max: number;
      timeWindow: number;
      key?: string;
      scope?: string;
      identify?: (request: FastifyRequest) => string | undefined;
      penalty?: string;
    }): ReturnType<FastifyInstance['createRateLimit']> & {
      reset(request: FastifyRequest): Promise<number>;
      refund(request: FastifyRequest): Promise<void>;
    };

    guardSubtree(
      guards: ((
        request: FastifyRequest,
        reply: FastifyReply,
      ) => Promise<void> | void)[],
    ): void;

    requireSecurityKey(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void>;

    settings: typeof import('../src/lib/settings.js').settings;

    settingsDefinition: typeof import('@repo/shared/schemas/setting.js').settingsDefinition;
  }

  interface FastifyRequest {
    readonly clientIp: string;

    auth: {
      id: string;
      email: string;
      roles: {
        id: string;
        label: string;
        position: number;
      }[];
      permissions: string[];
    } | null;

    rateLimit: Awaited<
      ReturnType<ReturnType<FastifyInstance['createRateLimit']>>
    > | null;

    roleMap: Record<string, string[]> | null;
    userPolicy: import('../src/lib/auth/user-policy.js').UserPolicy | null;
    rolePolicy: import('../src/lib/auth/role-policy.js').RolePolicy | null;
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
    ) => void | Promise<void>;
  }
}
