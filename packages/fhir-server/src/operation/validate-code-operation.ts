/**
 * $validate-code Operation
 *
 * Implements FHIR ValueSet/$validate-code.
 *
 * @module fhir-server/operation
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import { FHIR_JSON } from "../error/response.js";
import { operationOutcome } from "../error/outcomes.js";

/**
 * GET /ValueSet/$validate-code
 */
export async function handleValidateCode(
  engine: FhirEngine,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as Record<string, string | undefined>;
    const url = query.url;
    const code = query.code;
    const system = query.system;

    if (!code) {
      reply.status(400).header("content-type", FHIR_JSON).send(
        operationOutcome("error", "invalid", "code parameter is required"),
      );
      return;
    }

    // For v0.1.0, return a stub — full terminology in v0.2.0
    reply.status(200).header("content-type", FHIR_JSON).send({
      resourceType: "Parameters",
      parameter: [
        { name: "result", valueBoolean: true },
        ...(system ? [{ name: "system", valueUri: system }] : []),
        { name: "code", valueCode: code },
        ...(url ? [{ name: "url", valueUri: url }] : []),
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "$validate-code failed";
    reply.status(500).header("content-type", FHIR_JSON).send(
      operationOutcome("error", "exception", message),
    );
  }
}
