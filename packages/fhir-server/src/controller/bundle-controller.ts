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

    const result = await engine.persistence.processBundle(body);

    reply.status(200).header("content-type", FHIR_JSON).send(result);
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}
