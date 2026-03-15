/**
 * Authentication Middleware
 *
 * Provides Fastify hooks for JWT-based authentication:
 * - `authenticateToken`: onRequest hook — parses Bearer token, builds AuthState
 * - `requireAuth`: preHandler hook — rejects unauthenticated requests with 401
 *
 * @module fhir-server/auth
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository, PersistedResource } from "@medxai/fhir-persistence";
import { verifyJwt } from "./keys.js";
import type { AccessTokenClaims } from "./keys.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * Operation context for multi-tenant scoping and authorization.
 * Mirrors the OperationContext from @medxai/fhir-persistence.
 */
export interface OperationContext {
  project?: string;
  author?: string;
  accessPolicy?: string;
  superAdmin?: boolean;
}

/**
 * Authentication state resolved from a verified JWT token.
 *
 * Contains the Login, Project, and ProjectMembership resources
 * needed to build an OperationContext for repository operations.
 */
export interface AuthState {
  /** The Login resource for this session. */
  login: PersistedResource;
  /** The Project this session is scoped to. */
  project: PersistedResource;
  /** The ProjectMembership binding user to project. */
  membership: PersistedResource;
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
 * Build the authenticateToken onRequest hook.
 *
 * This hook runs on every request and attempts to resolve a Bearer token
 * into an AuthState. It does NOT reject unauthenticated requests — that is
 * the job of `requireAuth`.
 *
 * @param systemRepo - A repository with no project/AccessPolicy restrictions.
 */
export function buildAuthenticateToken(
  systemRepo: ResourceRepository,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return; // No token — unauthenticated (ok, requireAuth will catch if needed)
    }

    const token = authHeader.slice(7);

    try {
      const { payload } = await verifyJwt(token);
      const claims = payload as unknown as AccessTokenClaims;

      if (!claims.login_id) {
        return; // Invalid claims
      }

      // Read Login resource
      const login = await systemRepo.readResource("Login", claims.login_id);
      const loginContent = login as Record<string, unknown>;

      // Check login is not revoked
      if (loginContent.revoked) {
        return;
      }

      // Check login has membership
      const membershipRef = loginContent.membership as { reference?: string } | undefined;
      if (!membershipRef?.reference) {
        return;
      }

      // Read ProjectMembership
      const membershipId = membershipRef.reference.split("/")[1];
      if (!membershipId) return;
      const membership = await systemRepo.readResource("ProjectMembership", membershipId);
      const membershipContent = membership as Record<string, unknown>;

      // Check membership is active
      if (membershipContent.active === false) {
        return;
      }

      // Read Project
      const projectRef = membershipContent.project as { reference?: string } | undefined;
      if (!projectRef?.reference) return;
      const projectId = projectRef.reference.split("/")[1];
      if (!projectId) return;
      const project = await systemRepo.readResource("Project", projectId);

      // Set auth state on request
      request.authState = { login, project, membership };
    } catch {
      // Token verification failed or resource not found — remain unauthenticated
      return;
    }
  };
}

/**
 * Fastify preHandler hook that requires authentication.
 *
 * If no AuthState is present on the request, responds with 401 Unauthorized.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.authState) {
    reply.status(401).header("content-type", "application/fhir+json").send({
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
 *
 * Extracts project, author, accessPolicy, and superAdmin from the
 * resolved authentication state.
 */
export function buildOperationContext(authState: AuthState): OperationContext {
  const membership = authState.membership as Record<string, unknown>;
  const project = authState.project as Record<string, unknown>;

  // Extract profile reference as author
  const profileRef = membership.profile as { reference?: string } | undefined;
  const author = profileRef?.reference;

  // Extract accessPolicy reference
  const accessPolicyRef = membership.accessPolicy as { reference?: string } | undefined;
  const accessPolicy = accessPolicyRef?.reference?.split("/")[1];

  // SuperAdmin check
  const superAdmin = (project.superAdmin === true) || false;

  return {
    project: authState.project.id,
    author,
    accessPolicy,
    superAdmin,
  };
}

/**
 * Convenience: extract OperationContext from a Fastify request.
 *
 * Returns undefined if the request is not authenticated.
 */
export function getOperationContext(request: FastifyRequest): OperationContext | undefined {
  if (!request.authState) return undefined;
  return buildOperationContext(request.authState);
}
