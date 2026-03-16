/**
 * Authentication Middleware
 *
 * Provides Fastify hooks for JWT-based authentication:
 * - Phase 1 (`onRequest`): best-effort JWT parse — failure does NOT block
 * - Phase 2 (`preHandler`): `requireAuth` — rejects unauthenticated with 401
 *
 * Adapted from medxai/fhir-server auth/middleware.ts — uses FhirEngine,
 * removes multi-tenant projectId scoping.
 *
 * @module fhir-server/auth
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirPersistence } from "../types/engine.js";
import type { PersistedResource } from "../types/fhir.js";
import { verifyJwt } from "./keys.js";
import type { AccessTokenClaims } from "./keys.js";
import { FHIR_JSON } from "../error/response.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * Authentication state resolved from a verified JWT token.
 *
 * Simplified from medxai version — no multi-tenant Project/ProjectMembership.
 */
export interface AuthState {
  /** The Login resource for this session. */
  login: PersistedResource;
  /** The authenticated user's reference (e.g. "Practitioner/123"). */
  profile?: string;
  /** The scope string from the token. */
  scope?: string;
  /** Whether this is a superAdmin session. */
  superAdmin?: boolean;
}

/**
 * Operation context for authorization.
 * Simplified — no multi-tenant projectId.
 */
export interface OperationContext {
  /** The authenticated user's reference. */
  author?: string;
  /** Whether this is a superAdmin operation. */
  superAdmin?: boolean;
  /** The scope string. */
  scope?: string;
}

// =============================================================================
// Section 2: Fastify Declaration Merging
// =============================================================================

declare module "fastify" {
  interface FastifyRequest {
    /** Authentication state — set by authenticateToken hook. */
    authState?: AuthState;
  }
}

// =============================================================================
// Section 3: Hooks
// =============================================================================

/**
 * Build the authenticateToken onRequest hook (Phase 1).
 *
 * Runs on every request. Attempts to resolve a Bearer token into AuthState.
 * Does NOT reject unauthenticated requests — that is `requireAuth`'s job.
 */
export function buildAuthenticateToken(
  persistence: FhirPersistence,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return;
    }

    const token = authHeader.slice(7);

    try {
      const { payload } = await verifyJwt(token);
      const claims = payload as unknown as AccessTokenClaims;

      if (!claims.login_id) {
        return;
      }

      // Read Login resource
      const login = await persistence.readResource("Login", claims.login_id);
      const loginContent = login as Record<string, unknown>;

      // Check login is not revoked
      if (loginContent.revoked) {
        return;
      }

      // Build AuthState
      request.authState = {
        login,
        profile: claims.profile,
        scope: claims.scope,
        superAdmin: (loginContent.superAdmin as boolean) ?? false,
      };
    } catch {
      // Token verification failed or resource not found — remain unauthenticated
      return;
    }
  };
}

/**
 * Fastify preHandler hook that requires authentication (Phase 2).
 *
 * If no AuthState is present on the request, responds with 401 Unauthorized.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.authState) {
    reply.status(401).header("content-type", FHIR_JSON).send({
      resourceType: "OperationOutcome",
      issue: [
        {
          severity: "error",
          code: "login",
          diagnostics: "Authentication required",
        },
      ],
    });
  }
}

// =============================================================================
// Section 4: Context Builders
// =============================================================================

/**
 * Build an OperationContext from an AuthState.
 */
export function buildOperationContext(authState: AuthState): OperationContext {
  return {
    author: authState.profile,
    superAdmin: authState.superAdmin,
    scope: authState.scope,
  };
}

/**
 * Convenience: extract OperationContext from a Fastify request.
 * Returns undefined if the request is not authenticated.
 */
export function getOperationContext(request: FastifyRequest): OperationContext | undefined {
  if (!request.authState) return undefined;
  return buildOperationContext(request.authState);
}
