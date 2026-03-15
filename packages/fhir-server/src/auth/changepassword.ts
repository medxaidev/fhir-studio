/**
 * Auth Change Password Endpoint
 *
 * Implements `POST /auth/changepassword` — authenticated password change.
 *
 * @module fhir-server/auth
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository } from "@medxai/fhir-persistence";
import { compare, hash } from "bcryptjs";
import { requireAuth } from "./middleware.js";

// =============================================================================
// Types
// =============================================================================

interface ChangePasswordBody {
  oldPassword: string;
  newPassword: string;
}

// =============================================================================
// Route
// =============================================================================

/**
 * Register the /auth/changepassword route.
 */
export function registerChangePasswordRoute(app: FastifyInstance, systemRepo: ResourceRepository): void {
  app.post(
    "/auth/changepassword",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as ChangePasswordBody | undefined;

      if (!body?.oldPassword || !body?.newPassword) {
        reply.status(400).header("content-type", "application/fhir+json").send({
          resourceType: "OperationOutcome",
          issue: [{ severity: "error", code: "invalid", diagnostics: "oldPassword and newPassword are required" }],
        });
        return;
      }

      if (body.newPassword.length < 8) {
        reply.status(400).header("content-type", "application/fhir+json").send({
          resourceType: "OperationOutcome",
          issue: [{ severity: "error", code: "invalid", diagnostics: "New password must be at least 8 characters" }],
        });
        return;
      }

      try {
        const authState = request.authState;
        if (!authState) {
          reply.status(401).send();
          return;
        }

        // Get user reference from Login
        const loginContent = authState.login as Record<string, unknown>;
        const userRef = (loginContent.user as { reference?: string })?.reference;
        if (!userRef) {
          reply.status(400).header("content-type", "application/fhir+json").send({
            resourceType: "OperationOutcome",
            issue: [{ severity: "error", code: "invalid", diagnostics: "No user associated with this session" }],
          });
          return;
        }

        const [, userId] = userRef.split("/");
        if (!userId) {
          reply.status(500).send();
          return;
        }

        // Read user to verify old password
        const user = await systemRepo.readResource("User", userId);
        const userContent = user as Record<string, unknown>;
        const currentHash = userContent.passwordHash as string | undefined;

        if (!currentHash) {
          reply.status(400).header("content-type", "application/fhir+json").send({
            resourceType: "OperationOutcome",
            issue: [{ severity: "error", code: "invalid", diagnostics: "User has no password set" }],
          });
          return;
        }

        // Verify old password
        const valid = await compare(body.oldPassword, currentHash);
        if (!valid) {
          reply.status(401).header("content-type", "application/fhir+json").send({
            resourceType: "OperationOutcome",
            issue: [{ severity: "error", code: "login", diagnostics: "Current password is incorrect" }],
          });
          return;
        }

        // Hash new password and update
        const newHash = await hash(body.newPassword, 10);
        await systemRepo.updateResource({
          ...user,
          passwordHash: newHash,
        } as any);

        reply.header("content-type", "application/fhir+json").send({
          resourceType: "OperationOutcome",
          issue: [{ severity: "information", code: "informational", diagnostics: "Password changed successfully" }],
        });
      } catch (err) {
        reply.status(500).header("content-type", "application/fhir+json").send({
          resourceType: "OperationOutcome",
          issue: [{ severity: "error", code: "exception", diagnostics: err instanceof Error ? err.message : "Password change failed" }],
        });
      }
    },
  );
}
