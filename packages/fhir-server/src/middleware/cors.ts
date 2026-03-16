/**
 * CORS Middleware
 *
 * Registers @fastify/cors with configurable allowed origins.
 *
 * @module fhir-server/middleware
 */

import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { CorsConfig } from "../types/config.js";

/**
 * Register CORS via @fastify/cors.
 *
 * FHIR servers commonly need permissive CORS for browser-based clients
 * (e.g., SMART on FHIR apps, fhir-studio).
 */
export async function registerCors(
  app: FastifyInstance,
  config?: CorsConfig,
): Promise<void> {
  await app.register(cors, {
    origin: config?.origin ?? true,
    methods: config?.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: config?.allowedHeaders ?? [
      "Content-Type",
      "Authorization",
      "Accept",
      "If-Match",
      "If-None-Match",
      "If-Modified-Since",
      "Prefer",
      "X-Request-Id",
    ],
    exposedHeaders: config?.exposedHeaders ?? [
      "ETag",
      "Last-Modified",
      "Location",
      "Content-Location",
      "X-Request-Id",
    ],
    credentials: config?.credentials ?? true,
    maxAge: config?.maxAge ?? 86400,
  });
}
