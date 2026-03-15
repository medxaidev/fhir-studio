/**
 * OAuth2 Logout Endpoint
 *
 * Implements `GET/POST /oauth2/logout` — revokes the current Login session.
 *
 * @module fhir-server/auth
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository } from "@medxai/fhir-persistence";
import { requireAuth } from "./middleware.js";

/**
 * Register OAuth2 logout routes.
 */
export function registerLogoutRoutes(app: FastifyInstance, systemRepo: ResourceRepository): void {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authState = request.authState;
      if (!authState) {
        reply.status(401).send();
        return;
      }

      // Revoke the Login resource
      await systemRepo.updateResource({
        ...authState.login,
        revoked: true,
      } as any);

      reply.header("content-type", "application/json").send({
        ok: true,
        message: "Session revoked",
      });
    } catch (err) {
      reply.status(500).header("content-type", "application/fhir+json").send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "exception", diagnostics: err instanceof Error ? err.message : "Logout failed" }],
      });
    }
  };

  app.get("/oauth2/logout", { preHandler: requireAuth }, handler);
  app.post("/oauth2/logout", { preHandler: requireAuth }, handler);
}
