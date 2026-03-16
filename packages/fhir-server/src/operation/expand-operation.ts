/**
 * $expand Operation
 *
 * Implements FHIR ValueSet/$expand.
 * Delegates to engine for terminology expansion.
 *
 * @module fhir-server/operation
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import { FHIR_JSON } from "../error/response.js";
import { operationOutcome } from "../error/outcomes.js";

/**
 * GET/POST /ValueSet/$expand or /ValueSet/:id/$expand
 */
export async function handleExpand(
  engine: FhirEngine,
  request: FastifyRequest,
  reply: FastifyReply,
  valueSetId?: string,
): Promise<void> {
  try {
    const query = request.query as Record<string, string | undefined>;
    const url = query.url;
    const filter = query.filter;

    // Resolve the ValueSet
    let valueSetUrl = url;
    if (valueSetId && !valueSetUrl) {
      const vs = engine.definitions.getValueSet(valueSetId);
      if (!vs) {
        reply.status(404).header("content-type", FHIR_JSON).send(
          operationOutcome("error", "not-found", `ValueSet/${valueSetId} not found`),
        );
        return;
      }
      valueSetUrl = (vs as Record<string, unknown>).url as string | undefined;
    }

    if (!valueSetUrl) {
      reply.status(400).header("content-type", FHIR_JSON).send(
        operationOutcome("error", "invalid", "url parameter or ValueSet ID is required"),
      );
      return;
    }

    // Delegate to engine — for v0.1.0, return a stub response
    // Full terminology service integration is deferred to v0.2.0
    reply.status(200).header("content-type", FHIR_JSON).send({
      resourceType: "ValueSet",
      url: valueSetUrl,
      expansion: {
        timestamp: new Date().toISOString(),
        total: 0,
        contains: [],
        ...(filter ? { parameter: [{ name: "filter", valueString: filter }] } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "$expand failed";
    reply.status(500).header("content-type", FHIR_JSON).send(
      operationOutcome("error", "exception", message),
    );
  }
}
