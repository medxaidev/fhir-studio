/**
 * FhirServer Configuration Types
 *
 * Configuration interfaces for the FHIR server, based on
 * ARCHITECTURE-fhir-server.md §10.1.
 *
 * @module fhir-server/types
 */

import type { FhirEngine } from "./engine.js";

// =============================================================================
// Section 1: Server Options
// =============================================================================

/**
 * Options for creating a FhirServer instance.
 */
export interface FhirServerOptions {
  /** FhirEngine instance (required). */
  engine: FhirEngine;
  /** HTTP port. Default: 8080. */
  port?: number;
  /** Bind host. Default: '0.0.0.0'. */
  host?: string;
  /** Base URL for Location headers, Bundle links, etc. */
  baseUrl?: string;
  /** Authentication configuration. */
  auth?: AuthConfig;
  /** CORS configuration. */
  cors?: CorsConfig;
  /** Rate limiting configuration. */
  rateLimit?: RateLimitConfig;
  /** Enable Fastify logger. Default: false. */
  logger?: boolean;
  /** Body size limit in bytes. Default: 16MB. */
  bodyLimit?: number;
}

// =============================================================================
// Section 2: Auth Config
// =============================================================================

/**
 * Authentication configuration for the server.
 */
export interface AuthConfig {
  /** Enable authentication. Default: false. */
  enabled?: boolean;
  /** JWT signing secret (HS256). */
  jwtSecret?: string;
  /** JWT public key (ES256/RS256). */
  jwtPublicKey?: string;
  /** Allow anonymous access (no auth required). Default: false. */
  anonymous?: boolean;
}

// =============================================================================
// Section 3: CORS Config
// =============================================================================

/**
 * CORS configuration.
 */
export interface CorsConfig {
  /** Allowed origins. Default: '*'. */
  origin?: string | string[] | boolean;
  /** Allowed methods. */
  methods?: string[];
  /** Allowed headers. */
  allowedHeaders?: string[];
  /** Exposed headers. */
  exposedHeaders?: string[];
  /** Allow credentials. */
  credentials?: boolean;
  /** Max age for preflight cache (seconds). */
  maxAge?: number;
}

// =============================================================================
// Section 4: Rate Limit Config
// =============================================================================

/**
 * Rate limiting configuration.
 */
export interface RateLimitConfig {
  /** Enable rate limiting. Default: false. */
  enabled?: boolean;
  /** Maximum requests per window. Default: 100. */
  max?: number;
  /** Time window in milliseconds. Default: 60000 (1 minute). */
  timeWindow?: number;
}
