/**
 * Request Logger Middleware
 *
 * Structured request logging hook for Fastify.
 * Logs method, url, statusCode, and responseTime.
 *
 * @module fhir-server/middleware
 */

import type { FastifyInstance } from "fastify";

/**
 * Structured log entry for a completed request.
 */
export interface RequestLogEntry {
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  requestId?: string;
  ip?: string;
}

/**
 * Logger function type — can be replaced with any structured logger.
 */
export type RequestLoggerFn = (entry: RequestLogEntry) => void;

/**
 * Default console logger.
 */
const defaultLogger: RequestLoggerFn = (entry) => {
  const { method, url, statusCode, responseTime, requestId } = entry;
  const rid = requestId ? ` [${requestId}]` : "";
  console.log(`${method} ${url} → ${statusCode} (${responseTime.toFixed(1)}ms)${rid}`);
};

/**
 * Register structured request logging.
 *
 * Attaches `onResponse` hook that logs method, url, statusCode,
 * and responseTime for every request.
 */
export function registerRequestLogger(
  app: FastifyInstance,
  logger?: RequestLoggerFn,
): void {
  const log = logger ?? defaultLogger;

  app.addHook("onResponse", async (request, reply) => {
    log({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
      requestId: request.id as string | undefined,
      ip: request.ip,
    });
  });
}
