/**
 * FhirServer — Core Service Class
 *
 * Creates and manages the Fastify HTTP server instance with all
 * FHIR REST routes, middleware, and auth configured.
 *
 * Usage:
 * ```typescript
 * const server = new FhirServer({ engine, port: 8080 });
 * await server.start();
 * // ... server running ...
 * await server.stop();
 * ```
 *
 * @module fhir-server/server
 */

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { FhirServerOptions } from "../types/config.js";
import { fhirErrorHandler } from "../error/error-handler.js";
import { registerSecurityHeaders } from "../middleware/security.js";
import { registerCors } from "../middleware/cors.js";
import { registerRateLimit } from "../middleware/rate-limit.js";
import { registerRequestLogger } from "../middleware/request-logger.js";
import { registerRequestContext } from "../middleware/context.js";
import { fhirRouter } from "../router/fhir-router.js";
import {
  generateCapabilityStatement,
  cacheCapabilityStatement,
} from "../capability/index.js";

// =============================================================================
// Section 1: FhirServer Class
// =============================================================================

/**
 * FhirServer — the main entry point for the FHIR REST API server.
 */
export class FhirServer {
  private readonly options: Required<Pick<FhirServerOptions, "engine">> & FhirServerOptions;
  private app: FastifyInstance | undefined;
  private address: string | undefined;

  constructor(options: FhirServerOptions) {
    this.options = options;
  }

  /**
   * Start the HTTP server.
   *
   * 1. Creates Fastify instance
   * 2. Registers all middleware (security, CORS, rate limit, logger, context)
   * 3. Sets global error handler
   * 4. Registers FHIR routes
   * 5. Generates and caches CapabilityStatement
   * 6. Starts listening on the configured port
   */
  async start(): Promise<void> {
    const {
      engine,
      port = 8080,
      host = "0.0.0.0",
      baseUrl,
      auth,
      cors,
      rateLimit,
      logger = false,
      bodyLimit = 16_777_216,
    } = this.options;

    const resolvedBaseUrl = baseUrl ?? `http://localhost:${port}`;

    // Create Fastify instance
    this.app = Fastify({ logger, bodyLimit });

    // Global error handler
    this.app.setErrorHandler(fhirErrorHandler);

    // Middleware
    await registerSecurityHeaders(this.app);
    await registerCors(this.app, cors);
    await registerRateLimit(this.app, rateLimit);
    registerRequestLogger(this.app);
    registerRequestContext(this.app);

    // FHIR routes
    await this.app.register(fhirRouter, { engine, baseUrl: resolvedBaseUrl });

    // Generate and cache CapabilityStatement
    const cs = generateCapabilityStatement({
      engine,
      baseUrl: resolvedBaseUrl,
      auth,
    });
    cacheCapabilityStatement(cs);

    // Graceful shutdown
    const shutdown = async () => {
      await this.stop();
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    // Start listening
    this.address = await this.app.listen({ port, host });
  }

  /**
   * Stop the HTTP server.
   */
  async stop(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = undefined;
      this.address = undefined;
    }
  }

  /**
   * Get the address the server is listening on.
   */
  getAddress(): string | undefined {
    return this.address;
  }

  /**
   * Get the underlying Fastify instance (for testing or advanced usage).
   */
  getApp(): FastifyInstance | undefined {
    return this.app;
  }
}
