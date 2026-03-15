/**
 * Platform Admin Route Handlers
 *
 * Provides management endpoints for platform resources:
 * - POST /admin/projects — Create a new Project
 * - GET /admin/projects/:id — Get Project details
 * - POST /admin/projects/:id/invite — Invite user to project (create ProjectMembership)
 * - GET /admin/projects/:id/members — List project members
 * - POST /admin/clients — Register a new ClientApplication
 * - GET /admin/clients/:id — Get ClientApplication details
 *
 * All routes require authentication. Project creation requires superAdmin.
 * Other routes require project admin or superAdmin.
 *
 * @module fhir-server/routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository } from "@medxai/fhir-persistence";
import { parseSearchRequest } from "@medxai/fhir-persistence";
import type { SearchParameterRegistry } from "@medxai/fhir-persistence";
import { generateSecret } from "../auth/keys.js";
import { FHIR_JSON } from "../fhir/response.js";
import { badRequest, errorToOutcome } from "../fhir/outcomes.js";
import { getOperationContext, requireAuth } from "../auth/middleware.js";

// =============================================================================
// Section 1: Route Registration
// =============================================================================

/**
 * Register admin routes on a Fastify instance.
 *
 * Expects:
 * - `fastify.repo` — ResourceRepository (system-level for admin ops)
 * - `fastify.searchRegistry` — SearchParameterRegistry (for member search)
 *
 * All routes use requireAuth preHandler.
 */
export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = (fastify as any).repo as ResourceRepository;
  const systemRepo = ((fastify as any).systemRepo ?? repo) as ResourceRepository;
  const registry = (fastify as any).searchRegistry as SearchParameterRegistry | null;

  // ── POST /admin/projects — Create Project ─────────────────────────────
  fastify.post(
    "/admin/projects",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = getOperationContext(request);

      // Only superAdmin can create projects
      if (!context?.superAdmin) {
        return sendForbidden(reply, "Only superAdmin can create projects");
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body || !body.name) {
        return sendOutcome(reply, 400, badRequest("Project name is required"));
      }

      try {
        const project = await systemRepo.createResource({
          resourceType: "Project",
          name: body.name,
          description: body.description,
          ...(body.superAdmin === true ? { superAdmin: true } : {}),
        } as any);

        reply.status(201).header("content-type", FHIR_JSON);
        return project;
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );

  // ── GET /admin/projects/:id — Get Project details ─────────────────────
  fastify.get<{ Params: { id: string } }>(
    "/admin/projects/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params;
      const context = getOperationContext(request);

      if (!context?.superAdmin && context?.project !== id) {
        return sendForbidden(reply, "Access denied to this project");
      }

      try {
        const project = await systemRepo.readResource("Project", id);
        reply.header("content-type", FHIR_JSON);
        return project;
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );

  // ── POST /admin/projects/:id/invite — Invite user to project ──────────
  fastify.post<{ Params: { id: string } }>(
    "/admin/projects/:id/invite",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params;
      const context = getOperationContext(request);

      // Must be superAdmin or admin of the target project
      if (!context?.superAdmin && context?.project !== projectId) {
        return sendForbidden(reply, "Must be project admin or superAdmin");
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body || !body.userId) {
        return sendOutcome(reply, 400, badRequest("userId is required"));
      }

      try {
        // Verify project exists
        await systemRepo.readResource("Project", projectId);

        // Verify user exists
        const userId = body.userId as string;
        await systemRepo.readResource("User", userId);

        // Create ProjectMembership
        const membership = await systemRepo.createResource({
          resourceType: "ProjectMembership",
          project: { reference: `Project/${projectId}` },
          user: { reference: `User/${userId}` },
          profile: { reference: `User/${userId}` },
          admin: body.admin === true,
          active: true,
          userName: (body.userName as string) ?? "",
        } as any);

        reply.status(201).header("content-type", FHIR_JSON);
        return membership;
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );

  // ── GET /admin/projects/:id/members — List project members ────────────
  fastify.get<{ Params: { id: string } }>(
    "/admin/projects/:id/members",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params;
      const context = getOperationContext(request);

      if (!context?.superAdmin && context?.project !== projectId) {
        return sendForbidden(reply, "Access denied to this project's members");
      }

      try {
        if (!registry) {
          return sendOutcome(reply, 500, badRequest("Search not configured"));
        }

        const searchRequest = parseSearchRequest(
          "ProjectMembership",
          { project: `Project/${projectId}` },
          registry,
        );

        const result = await systemRepo.searchResources(searchRequest, { total: "accurate" });

        const bundle = {
          resourceType: "Bundle",
          type: "searchset",
          total: result.total ?? result.resources.length,
          entry: result.resources.map((r: any) => ({
            resource: r,
          })),
        };

        reply.header("content-type", FHIR_JSON);
        return bundle;
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );

  // ── POST /admin/clients — Register ClientApplication ──────────────────
  fastify.post(
    "/admin/clients",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = getOperationContext(request);

      if (!context?.superAdmin) {
        return sendForbidden(reply, "Only superAdmin can register clients");
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body || !body.name) {
        return sendOutcome(reply, 400, badRequest("Client name is required"));
      }

      try {
        const clientSecret = generateSecret(32);

        const client = await systemRepo.createResource({
          resourceType: "ClientApplication",
          name: body.name,
          description: body.description ?? "",
          status: "active",
          secret: clientSecret,
          ...(body.redirectUri ? { redirectUri: body.redirectUri } : {}),
        } as any);

        // Return client with secret (only time secret is visible)
        reply.status(201).header("content-type", FHIR_JSON);
        return {
          ...client,
          secret: clientSecret,
        };
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );

  // ── GET /admin/clients/:id — Get ClientApplication details ────────────
  fastify.get<{ Params: { id: string } }>(
    "/admin/clients/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params;
      const context = getOperationContext(request);

      if (!context?.superAdmin) {
        return sendForbidden(reply, "Only superAdmin can view client details");
      }

      try {
        const client = await systemRepo.readResource("ClientApplication", id);
        reply.header("content-type", FHIR_JSON);
        // Redact secret
        const result = { ...(client as Record<string, unknown>) };
        delete result.secret;
        return result;
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );
}

// =============================================================================
// Section 2: Helpers
// =============================================================================

function sendOutcome(
  reply: FastifyReply,
  status: number,
  outcome: { resourceType: string; issue: unknown[] },
): { resourceType: string; issue: unknown[] } {
  reply.status(status).header("content-type", FHIR_JSON);
  return outcome;
}

function sendForbidden(
  reply: FastifyReply,
  diagnostics: string,
): { resourceType: string; issue: unknown[] } {
  return sendOutcome(reply, 403, {
    resourceType: "OperationOutcome",
    issue: [
      {
        severity: "error",
        code: "forbidden",
        diagnostics,
      },
    ],
  });
}
