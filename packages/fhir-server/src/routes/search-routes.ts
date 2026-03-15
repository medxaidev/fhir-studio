/**
 * FHIR Search Route Handlers
 *
 * Implements FHIR search interactions:
 * - GET /:resourceType (search via query string)
 * - POST /:resourceType/_search (search via form-encoded body)
 *
 * @module fhir-server/routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  ResourceRepository,
  SearchParameterRegistry,
  SearchRequest,
} from "@medxai/fhir-persistence";
import {
  parseSearchRequest,
  buildSearchBundle,
  buildSelfLink,
  buildNextLink,
  buildPaginationContext,
  DEFAULT_SEARCH_COUNT,
} from "@medxai/fhir-persistence";
import { FHIR_JSON } from "../fhir/response.js";
import { errorToOutcome } from "../fhir/outcomes.js";
import { getOperationContext } from "../auth/middleware.js";
import { getSearchCriteria, parseAccessPolicy } from "../auth/access-policy.js";

// =============================================================================
// Section 1: Route Parameter Types
// =============================================================================

interface ResourceTypeParams {
  resourceType: string;
}

interface CompartmentSearchParams {
  compartmentType: string;
  compartmentId: string;
  resourceType: string;
}

// =============================================================================
// Section 2: Route Registration
// =============================================================================

/**
 * Register FHIR search routes on a Fastify instance.
 *
 * Expects:
 * - `fastify.repo` — ResourceRepository
 * - `fastify.searchRegistry` — SearchParameterRegistry
 * - `fastify.baseUrl` — Base URL string
 */
export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = (fastify as any).repo as ResourceRepository;
  const registry = (fastify as any).searchRegistry as SearchParameterRegistry;
  const serverBaseUrl = (fastify as any).baseUrl as string;

  // ── GET /:resourceType (search via query string) ─────────────────────────
  fastify.get<{ Params: ResourceTypeParams; Querystring: Record<string, string> }>(
    "/:resourceType",
    async (request, reply) => {
      const { resourceType } = request.params;
      const queryParams = request.query;

      try {
        return await handleSearch(
          repo,
          registry,
          resourceType,
          queryParams,
          request,
          reply,
          serverBaseUrl,
        );
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        reply.status(status).header("content-type", FHIR_JSON);
        return outcome;
      }
    },
  );

  // ── POST /:resourceType/_search (search via form body) ───────────────────
  fastify.post<{ Params: ResourceTypeParams; Body: Record<string, string> }>(
    "/:resourceType/_search",
    async (request, reply) => {
      const { resourceType } = request.params;
      const bodyParams = (request.body ?? {}) as Record<string, string>;

      try {
        return await handleSearch(
          repo,
          registry,
          resourceType,
          bodyParams,
          request,
          reply,
          serverBaseUrl,
        );
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        reply.status(status).header("content-type", FHIR_JSON);
        return outcome;
      }
    },
  );

  // ── GET /:compartmentType/:compartmentId/:resourceType (compartment search) ─
  fastify.get<{ Params: CompartmentSearchParams; Querystring: Record<string, string> }>(
    "/:compartmentType/:compartmentId/:resourceType",
    async (request, reply) => {
      const { compartmentType, compartmentId, resourceType } = request.params;
      const queryParams = request.query;

      try {
        return await handleCompartmentSearch(
          repo,
          registry,
          compartmentType,
          compartmentId,
          resourceType,
          queryParams,
          request,
          reply,
          serverBaseUrl,
        );
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        reply.status(status).header("content-type", FHIR_JSON);
        return outcome;
      }
    },
  );
}

// =============================================================================
// Section 3: Search Handler
// =============================================================================

/**
 * Shared search handler for both GET and POST search routes.
 */
async function handleSearch(
  repo: ResourceRepository,
  registry: SearchParameterRegistry,
  resourceType: string,
  queryParams: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  serverBaseUrl: string,
): Promise<unknown> {
  // Parse the search request
  const searchRequest: SearchRequest = parseSearchRequest(
    resourceType,
    queryParams,
    registry,
  );

  // Extract auth context for project scoping
  const context = getOperationContext(request);

  // Layer 3: Inject AccessPolicy criteria into search
  if (context?.accessPolicy) {
    try {
      const policyResource = await repo.readResource("AccessPolicy", context.accessPolicy);
      const parsed = parseAccessPolicy(policyResource);
      if (parsed) {
        const criteriaParams = getSearchCriteria(resourceType, context, parsed);
        searchRequest.params.push(...criteriaParams);
      }
    } catch {
      // AccessPolicy not found or unreadable — proceed without criteria
    }
  }

  // Execute search
  const result = await repo.searchResources(searchRequest, {
    total: searchRequest.total,
  }, context);

  // Build pagination context
  const baseUrl = serverBaseUrl || getBaseUrl(request);
  const count = searchRequest.count ?? DEFAULT_SEARCH_COUNT;
  const offset = searchRequest.offset ?? 0;

  const paginationCtx = buildPaginationContext(
    baseUrl,
    resourceType,
    queryParams,
    count,
    offset,
    result.resources.length,
  );

  // Build Bundle
  const bundle = buildSearchBundle(result.resources, {
    baseUrl,
    total: result.total,
    selfUrl: buildSelfLink(paginationCtx),
    nextUrl: buildNextLink(paginationCtx),
    included: result.included,
  });

  reply.header("content-type", FHIR_JSON);
  return bundle;
}

// =============================================================================
// Section 3b: Compartment Search Handler
// =============================================================================

/**
 * Handle compartment search: GET /:compartmentType/:compartmentId/:resourceType
 *
 * Example: GET /Patient/123/Observation
 * → Search Observations where compartments array contains Patient 123's UUID.
 *
 * Adds a synthetic `_compartment` search parameter that filters on
 * the `compartments` UUID[] column.
 */
async function handleCompartmentSearch(
  repo: ResourceRepository,
  registry: SearchParameterRegistry,
  compartmentType: string,
  compartmentId: string,
  resourceType: string,
  queryParams: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  serverBaseUrl: string,
): Promise<unknown> {
  // Parse the search request (additional filters from query string)
  const searchRequest: SearchRequest = parseSearchRequest(
    resourceType,
    queryParams,
    registry,
  );

  // Add compartment filter: compartments @> ARRAY[compartmentId]::uuid[]
  searchRequest.compartment = {
    resourceType: compartmentType,
    id: compartmentId,
  };

  // Extract auth context for project scoping
  const context = getOperationContext(request);

  // Execute search
  const result = await repo.searchResources(searchRequest, {
    total: searchRequest.total,
  }, context);

  // Build pagination context
  const baseUrl = serverBaseUrl || getBaseUrl(request);

  // Build compartment-aware self URL
  const selfBase = `${baseUrl}/${compartmentType}/${compartmentId}/${resourceType}`;
  const qsParts: string[] = [];
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== '') {
      qsParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  const selfUrl = qsParts.length > 0 ? `${selfBase}?${qsParts.join('&')}` : selfBase;

  // Build Bundle
  const bundle = buildSearchBundle(result.resources, {
    baseUrl,
    total: result.total,
    selfUrl,
    included: result.included,
  });

  reply.header("content-type", FHIR_JSON);
  return bundle;
}

// =============================================================================
// Section 4: Helpers
// =============================================================================

/**
 * Extract the base URL from a Fastify request.
 */
function getBaseUrl(request: FastifyRequest): string {
  const protocol = request.protocol;
  const host = request.hostname;
  return `${protocol}://${host}`;
}
