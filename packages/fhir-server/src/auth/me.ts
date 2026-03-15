/**
 * Auth Me Endpoint
 *
 * Implements `GET /auth/me` — returns current session details.
 *
 * @module fhir-server/auth
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository } from "@medxai/fhir-persistence";
import { requireAuth } from "./middleware.js";

/**
 * Register the /auth/me route.
 */
export function registerMeRoute(app: FastifyInstance, systemRepo: ResourceRepository): void {
  app.get("/auth/me", { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authState = request.authState;
      if (!authState) {
        reply.status(401).header("content-type", "application/json").send({
          resourceType: "OperationOutcome",
          issue: [{ severity: "error", code: "login", diagnostics: "Authentication required" }],
        });
        return;
      }

      const loginContent = authState.login as Record<string, unknown>;
      const membershipContent = authState.membership as Record<string, unknown>;
      const projectContent = authState.project as Record<string, unknown>;

      // Get user reference
      const userRef = (loginContent.user as { reference?: string })?.reference;
      let userProfile: Record<string, unknown> | undefined;
      if (userRef) {
        const [, userId] = userRef.split("/");
        if (userId) {
          try {
            const user = await systemRepo.readResource("User", userId);
            userProfile = user as Record<string, unknown>;
          } catch {
            // User not found — continue without profile
          }
        }
      }

      // Build session details response
      const result: Record<string, unknown> = {
        login: authState.login.id,
        project: {
          id: authState.project.id,
          name: projectContent.name,
          reference: `Project/${authState.project.id}`,
        },
        membership: {
          id: authState.membership.id,
          profile: membershipContent.profile,
          admin: membershipContent.admin ?? false,
        },
      };

      if (userProfile) {
        result.user = {
          id: userProfile.id,
          email: userProfile.email,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          reference: `User/${userProfile.id}`,
        };
      }

      reply.header("content-type", "application/json").send(result);
    } catch (err) {
      reply.status(500).header("content-type", "application/fhir+json").send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "exception", diagnostics: err instanceof Error ? err.message : "Internal error" }],
      });
    }
  });
}
