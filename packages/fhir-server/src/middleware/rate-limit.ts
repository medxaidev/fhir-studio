/**
 * Rate Limiting Middleware
 *
 * Registers @fastify/rate-limit with configurable limits.
 *
 * @module fhir-server/middleware
 */

import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { RateLimitConfig } from "../types/config.js";
import { FHIR_JSON } from "../error/response.js";

/**
 * Register rate limiting via @fastify/rate-limit.
 *
 * Default: 100 requests per minute per IP.
 * Returns a FHIR OperationOutcome when limit is exceeded.
 */
export async function registerRateLimit(
  app: FastifyInstance,
  config?: RateLimitConfig,
): Promise<void> {
  if (config?.enabled === false) {
    return;
  }

  await app.register(rateLimit, {
    max: config?.max ?? 100,
    timeWindow: config?.timeWindow ?? 60_000,
    errorResponseBuilder: (_request, context) => {
      return {
        statusCode: 429,
        error: "Too Many Requests",
        message: `Rate limit exceeded. Retry after ${Math.ceil((context.ttl ?? 60000) / 1000)} seconds`,
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "throttled",
            diagnostics: `Rate limit exceeded (${context.max} requests per ${Math.ceil((context.ttl ?? 60000) / 1000)}s). Retry after ${Math.ceil((context.ttl ?? 60000) / 1000)} seconds.`,
          },
        ],
      };
    },
    keyGenerator: (request) => {
      return request.ip;
    },
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
  });

  // Override content-type for rate limit responses to FHIR JSON
  app.addHook("onSend", async (_request, reply, payload) => {
    if (reply.statusCode === 429) {
      reply.header("content-type", FHIR_JSON);
    }
    return payload;
  });
}
