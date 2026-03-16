/**
 * Bundle Controller
 *
 * Handles FHIR Bundle operations (transaction and batch).
 * Delegates to engine.persistence.processBundle().
 *
 * @module fhir-server/controller
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import type { Bundle } from "../types/fhir.js";
import { FHIR_JSON } from "../error/response.js";
import { errorToOutcome } from "../error/outcomes.js";

// =============================================================================
// Bundle
// =============================================================================

/**
 * POST / → Process a Bundle (transaction or batch).
 */
export async function handleBundle(
  engine: FhirEngine,
  baseUrl: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = request.body as Bundle | undefined;

    if (!body || typeof body !== "object" || body.resourceType !== "Bundle") {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "Request body must be a Bundle resource" }],
      });
      return;
    }

    if (!body.type || !["transaction", "batch"].includes(body.type)) {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "Bundle.type must be 'transaction' or 'batch'" }],
      });
      return;
    }

    // v0.1.0: fhir-engine does not expose processBundle().
    // Batch/transaction support is deferred to v0.2.0.
    // For now, return 501 Not Implemented.
    void engine; // suppress unused-var lint
    reply.status(501).header("content-type", FHIR_JSON).send({
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "not-supported", diagnostics: "Bundle processing is not yet supported (planned for v0.2.0)" }],
    });
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}
