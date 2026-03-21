/**
 * Search Controller
 *
 * Handles FHIR search operations (GET and POST _search).
 * Builds a FHIR searchset Bundle from engine.persistence.searchResources().
 *
 * @module fhir-server/controller
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import type { Bundle, BundleEntry } from "../types/fhir.js";
import { FHIR_JSON } from "../error/response.js";
import { errorToOutcome } from "../error/outcomes.js";

// =============================================================================
// Search
// =============================================================================

/**
 * GET /:resourceType or POST /:resourceType/_search → Search resources.
 */
export async function handleSearch(
  engine: FhirEngine,
  baseUrl: string,
  resourceType: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // Extract search params from query string (GET) or body (POST _search)
    const params = extractSearchParams(request);

    // Use engine.search() high-level API (handles _count, _offset, etc. internally)
    const result = await engine.search(resourceType, params, { total: "accurate" });

    // Build searchset Bundle
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const selfUrl = `${base}/${resourceType}?${buildQueryString(params)}`;

    const entries: BundleEntry[] = result.resources.map((resource) => ({
      fullUrl: `${base}/${resource.resourceType}/${resource.id}`,
      resource,
      search: { mode: "match" as const },
    }));

    // Add included resources
    if (result.included && result.included.length > 0) {
      for (const inc of result.included) {
        entries.push({
          fullUrl: `${base}/${inc.resourceType}/${inc.id}`,
          resource: inc,
          search: { mode: "include" as const },
        });
      }
    }

    const bundle: Bundle = {
      resourceType: "Bundle",
      type: "searchset",
      total: result.total,
      link: [
        { relation: "self", url: selfUrl },
      ],
      entry: entries,
    };

    // Add next link if there are more results
    const count = parseInt(params._count ?? "20", 10);
    const offset = parseInt(params._offset ?? "0", 10);
    if (result.total !== undefined && offset + count < result.total) {
      const nextParams = { ...params, _offset: String(offset + count) };
      bundle.link!.push({
        relation: "next",
        url: `${base}/${resourceType}?${buildQueryString(nextParams)}`,
      });
    }

    reply.status(200).header("content-type", FHIR_JSON).send(bundle);
  } catch (err) {
    // Unknown search parameter errors → 400 Bad Request (not 500)
    if (err instanceof Error && err.message.includes("Unknown search parameter")) {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "not-supported", diagnostics: err.message }],
      });
      return;
    }
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract search parameters from request (query for GET, body for POST).
 */
function extractSearchParams(request: FastifyRequest): Record<string, string> {
  const params: Record<string, string> = {};

  // Query string params (always available)
  const query = request.query as Record<string, string | string[] | undefined>;
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params[key] = Array.isArray(value) ? value.join(",") : value;
    }
  }

  // POST body params (for _search)
  if (request.method === "POST" && request.body && typeof request.body === "object") {
    const body = request.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") {
        params[key] = value;
      }
    }
  }

  return params;
}

/**
 * Build a query string from params.
 */
function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}
