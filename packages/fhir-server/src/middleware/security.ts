/**
 * Security Headers Middleware
 *
 * Registers @fastify/helmet for HTTP security headers
 * (HSTS, CSP, X-Content-Type-Options, etc.).
 *
 * @module fhir-server/middleware
 */

import type { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";

/**
 * Register security headers via @fastify/helmet.
 *
 * Defaults are tuned for a FHIR REST API (no browser HTML rendering).
 */
export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    // FHIR servers serve JSON, not HTML — relax CSP
    contentSecurityPolicy: false,
    // Prevent MIME sniffing
    xContentTypeOptions: true,
    // Disable X-Powered-By
    hidePoweredBy: true,
    // HSTS: enforce HTTPS (1 year)
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  });
}
