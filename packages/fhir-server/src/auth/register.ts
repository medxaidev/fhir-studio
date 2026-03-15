/**
 * Auth Register (New User) Endpoint
 *
 * Implements `POST /auth/newuser` — self-service user registration.
 *
 * Flow:
 * 1. Validate required fields (email, password, projectId)
 * 2. Check no existing User with same email
 * 3. Create User resource with hashed password
 * 4. Create ProjectMembership linking user to project
 * 5. Return { user, membership }
 *
 * @module fhir-server/auth
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository } from "@medxai/fhir-persistence";
import { hash } from "bcryptjs";

// =============================================================================
// Types
// =============================================================================

interface RegisterRequestBody {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  projectId: string;
}

// =============================================================================
// Route
// =============================================================================

/**
 * Register the /auth/newuser route.
 */
export function registerNewUserRoute(app: FastifyInstance, systemRepo: ResourceRepository): void {
  app.post("/auth/newuser", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as RegisterRequestBody | undefined;

    if (!body?.email || !body?.password || !body?.projectId) {
      reply.status(400).header("content-type", "application/fhir+json").send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "email, password, and projectId are required" }],
      });
      return;
    }

    try {
      // 1. Check project exists
      try {
        await systemRepo.readResource("Project", body.projectId);
      } catch {
        reply.status(404).header("content-type", "application/fhir+json").send({
          resourceType: "OperationOutcome",
          issue: [{ severity: "error", code: "not-found", diagnostics: `Project ${body.projectId} not found` }],
        });
        return;
      }

      // 2. Check no existing user with same email
      const existing = await systemRepo.searchResources({
        resourceType: "User",
        params: [{ code: "email", values: [body.email] }],
        count: 1,
      });

      if (existing.resources.length > 0) {
        reply.status(409).header("content-type", "application/fhir+json").send({
          resourceType: "OperationOutcome",
          issue: [{ severity: "error", code: "duplicate", diagnostics: "A user with this email already exists" }],
        });
        return;
      }

      // 3. Hash password and create User
      const passwordHash = await hash(body.password, 10);
      const user = await systemRepo.createResource({
        resourceType: "User",
        email: body.email,
        passwordHash,
        firstName: body.firstName,
        lastName: body.lastName,
        project: { reference: `Project/${body.projectId}` },
      } as any);

      // 4. Create ProjectMembership
      const membership = await systemRepo.createResource({
        resourceType: "ProjectMembership",
        project: { reference: `Project/${body.projectId}` },
        user: { reference: `User/${user.id}` },
        profile: { reference: `User/${user.id}` },
        admin: false,
      } as any);

      // 5. Return result
      reply.status(201).header("content-type", "application/json").send({
        user: {
          id: user.id,
          email: body.email,
          reference: `User/${user.id}`,
        },
        membership: {
          id: membership.id,
          reference: `ProjectMembership/${membership.id}`,
        },
        project: {
          id: body.projectId,
          reference: `Project/${body.projectId}`,
        },
      });
    } catch (err) {
      reply.status(500).header("content-type", "application/fhir+json").send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "exception", diagnostics: err instanceof Error ? err.message : "Registration failed" }],
      });
    }
  });
}
