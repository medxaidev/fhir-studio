/**
 * OAuth2 UserInfo Endpoint
 *
 * Implements `GET/POST /oauth2/userinfo` — OpenID Connect UserInfo.
 *
 * Returns claims about the authenticated user based on the access token.
 *
 * @module fhir-server/auth
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository } from "@medxai/fhir-persistence";
import { requireAuth } from "./middleware.js";

/**
 * Register OAuth2 UserInfo routes.
 */
export function registerUserInfoRoutes(app: FastifyInstance, systemRepo: ResourceRepository): void {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authState = request.authState;
      if (!authState) {
        reply.status(401).header("content-type", "application/json").send({
          error: "invalid_token",
          error_description: "Access token is required",
        });
        return;
      }

      // Get user reference from the Login resource
      const loginContent = authState.login as Record<string, unknown>;
      const userRef = (loginContent.user as { reference?: string })?.reference;

      if (!userRef) {
        reply.status(401).header("content-type", "application/json").send({
          error: "invalid_token",
          error_description: "No user associated with this token",
        });
        return;
      }

      // Parse "User/uuid" reference
      const [userType, userId] = userRef.split("/");
      if (userType !== "User" || !userId) {
        reply.status(500).header("content-type", "application/json").send({
          error: "server_error",
          error_description: "Invalid user reference",
        });
        return;
      }

      const user = await systemRepo.readResource("User", userId);
      const userContent = user as Record<string, unknown>;

      // Build OpenID Connect UserInfo response
      const claims: Record<string, unknown> = {
        sub: userId,
      };

      if (userContent.email) claims.email = userContent.email;
      if (userContent.firstName) claims.given_name = userContent.firstName;
      if (userContent.lastName) claims.family_name = userContent.lastName;
      if (userContent.firstName || userContent.lastName) {
        claims.name = [userContent.firstName, userContent.lastName].filter(Boolean).join(" ");
      }

      // Include project
      claims.project = authState.project.id;

      reply.header("content-type", "application/json").send(claims);
    } catch (err) {
      reply.status(500).header("content-type", "application/json").send({
        error: "server_error",
        error_description: err instanceof Error ? err.message : "Internal error",
      });
    }
  };

  app.get("/oauth2/userinfo", { preHandler: requireAuth }, handler);
  app.post("/oauth2/userinfo", { preHandler: requireAuth }, handler);
}
