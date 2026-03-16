/**
 * $validate Operation
 *
 * Implements FHIR $validate at system, type, and instance levels.
 * Delegates to engine.runtime.validate().
 *
 * @module fhir-server/operation
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import type { Resource } from "../types/fhir.js";
import { FHIR_JSON } from "../error/response.js";
import { operationOutcome } from "../error/outcomes.js";

/**
 * POST /$validate or POST /:resourceType/$validate or POST /:resourceType/:id/$validate
 */
export async function handleValidate(
  engine: FhirEngine,
  request: FastifyRequest,
  reply: FastifyReply,
  resourceType?: string,
): Promise<void> {
  try {
    const body = request.body as Resource | undefined;
    if (!body || typeof body !== "object" || !body.resourceType) {
      reply.status(400).header("content-type", FHIR_JSON).send(
        operationOutcome("error", "invalid", "Request body must be a FHIR resource with resourceType"),
      );
      return;
    }

    // Extract profile from query params
    const query = request.query as Record<string, string | undefined>;
    const profileUrl = query.profile;

    // Validate resourceType matches if specified in URL
    if (resourceType && body.resourceType !== resourceType) {
      reply.status(400).header("content-type", FHIR_JSON).send(
        operationOutcome("error", "invalid", `Resource type '${body.resourceType}' does not match URL type '${resourceType}'`),
      );
      return;
    }

    const result = await engine.runtime.validate(body, profileUrl);

    if (result.valid) {
      reply.status(200).header("content-type", FHIR_JSON).send(
        operationOutcome("information", "informational", "Validation successful"),
      );
    } else {
      reply.status(200).header("content-type", FHIR_JSON).send(result.outcome);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Validation failed";
    reply.status(500).header("content-type", FHIR_JSON).send(
      operationOutcome("error", "exception", message),
    );
  }
}
