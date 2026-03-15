/**
 * FHIR Metadata Route
 *
 * GET /metadata — returns the server's CapabilityStatement.
 *
 * @module fhir-server/routes
 */

import type { FastifyInstance } from "fastify";
import { buildCapabilityStatement } from "../fhir/metadata.js";
import { FHIR_JSON } from "../fhir/response.js";
import type { CapabilityStatementOptions } from "../fhir/metadata.js";

/**
 * Register the /metadata route.
 */
export async function metadataRoute(
  fastify: FastifyInstance,
  options?: CapabilityStatementOptions,
): Promise<void> {
  const capabilityStatement = buildCapabilityStatement(options);

  fastify.get("/metadata", async (_request, reply) => {
    reply.header("content-type", FHIR_JSON);
    return capabilityStatement;
  });
}
