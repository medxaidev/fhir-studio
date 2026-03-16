/**
 * $lookup Operation
 *
 * Implements FHIR CodeSystem/$lookup.
 *
 * @module fhir-server/operation
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import { FHIR_JSON } from "../error/response.js";
import { operationOutcome } from "../error/outcomes.js";

/**
 * GET /CodeSystem/$lookup
 */
export async function handleLookup(
  engine: FhirEngine,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as Record<string, string | undefined>;
    const system = query.system;
    const code = query.code;

    if (!code) {
      reply.status(400).header("content-type", FHIR_JSON).send(
        operationOutcome("error", "invalid", "code parameter is required"),
      );
      return;
    }

    // For v0.1.0, return a minimal stub — full terminology in v0.2.0
    reply.status(200).header("content-type", FHIR_JSON).send({
      resourceType: "Parameters",
      parameter: [
        { name: "name", valueString: code },
        ...(system ? [{ name: "system", valueUri: system }] : []),
        { name: "display", valueString: code },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "$lookup failed";
    reply.status(500).header("content-type", FHIR_JSON).send(
      operationOutcome("error", "exception", message),
    );
  }
}
