/**
 * Request Context Middleware
 *
 * Injects requestId and registers FHIR content-type parsers
 * (application/fhir+json, application/json-patch+json,
 * application/x-www-form-urlencoded).
 *
 * Adapted from medxai/fhir-server app.ts content-type parsers.
 *
 * @module fhir-server/middleware
 */

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

/**
 * Register request context enrichment and content-type parsers.
 *
 * - Injects `x-request-id` header (generated if not present)
 * - Parses `application/fhir+json` as JSON
 * - Parses `application/json-patch+json` as JSON
 * - Parses `application/x-www-form-urlencoded` as key-value pairs
 */
export function registerRequestContext(app: FastifyInstance): void {
  // ── Request ID injection ──────────────────────────────────────────────────
  app.addHook("onRequest", async (request, reply) => {
    const existingId = request.headers["x-request-id"];
    const requestId = (typeof existingId === "string" && existingId) ? existingId : randomUUID();
    reply.header("x-request-id", requestId);
  });

  // ── Content-Type: application/fhir+json ──────────────────────────────────
  app.addContentTypeParser(
    "application/fhir+json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const str = body as string;
        if (!str || str.trim() === "") {
          done(null, undefined);
          return;
        }
        const json = JSON.parse(str);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ── Content-Type: application/json-patch+json ────────────────────────────
  app.addContentTypeParser(
    "application/json-patch+json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const str = body as string;
        if (!str || str.trim() === "") {
          done(null, undefined);
          return;
        }
        const json = JSON.parse(str);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ── Content-Type: application/x-www-form-urlencoded ──────────────────────
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const params: Record<string, string> = {};
        const pairs = (body as string).split("&");
        for (const pair of pairs) {
          const [key, value] = pair.split("=").map(decodeURIComponent);
          if (key) params[key] = value ?? "";
        }
        done(null, params);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
}
