/**
 * Admin IG Routes (Task 4.2)
 *
 * Provides IG administration APIs under the `/_admin/ig` prefix:
 * - POST /_admin/ig/import — Import a FHIR Bundle as an IG
 * - GET  /_admin/ig/list   — List all imported IGs
 *
 * All import logic is delegated to engine.conformance (IGImportOrchestrator).
 * fhir-server does NOT implement the 6-step import pipeline directly.
 *
 * @module fhir-server/ig
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import { FHIR_JSON } from "../error/response.js";
import { errorToOutcome, badRequest } from "../error/outcomes.js";

// =============================================================================
// Section 1: Types
// =============================================================================

interface ImportRequestBody {
  igId?: string;
  bundle?: Record<string, unknown>;
}

export interface AdminIGRouterOptions {
  engine: FhirEngine;
}

// =============================================================================
// Section 2: Route Registration
// =============================================================================

export async function adminIGRoutes(
  app: FastifyInstance,
  options: AdminIGRouterOptions,
): Promise<void> {
  const { engine } = options;

  // ── POST /_admin/ig/import ────────────────────────────────────────────────
  app.post("/import", async (
    request: FastifyRequest<{ Body: ImportRequestBody }>,
    reply: FastifyReply,
  ) => {
    try {
      const conformance = engine.conformance;
      if (!conformance) {
        reply.status(501).header("content-type", FHIR_JSON).send(
          badRequest("Conformance module not available"),
        );
        return;
      }

      const body = request.body as ImportRequestBody | undefined;
      if (!body?.igId || !body?.bundle) {
        reply.status(400).header("content-type", FHIR_JSON).send(
          badRequest("Request body must contain 'igId' (string) and 'bundle' (FHIR Bundle)"),
        );
        return;
      }

      const { igId, bundle } = body;

      if (bundle.resourceType !== "Bundle") {
        reply.status(400).header("content-type", FHIR_JSON).send(
          badRequest("'bundle' must be a FHIR Bundle resource (resourceType: 'Bundle')"),
        );
        return;
      }

      const result = await conformance.importIG(igId, bundle);

      reply.status(200).header("content-type", "application/json").send(result);
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });

  // ── GET /_admin/ig/list ───────────────────────────────────────────────────
  app.get("/list", async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    try {
      const conformance = engine.conformance;
      if (!conformance) {
        reply.status(501).header("content-type", FHIR_JSON).send(
          badRequest("Conformance module not available"),
        );
        return;
      }

      const igs = conformance.listIGs ? await conformance.listIGs() : [];
      reply.status(200).header("content-type", "application/json").send({ igs });
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });
}
