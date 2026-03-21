/**
 * FHIR REST Router
 *
 * Registers all FHIR REST API routes on a Fastify instance.
 * Routes delegate to controller functions which call engine.persistence.
 *
 * Route map (FHIR R4):
 *   GET    /metadata                                → CapabilityStatement
 *   GET    /healthcheck                             → Health check
 *   POST   /                                        → Bundle (transaction/batch)
 *   GET    /_ig/:igId/index                         → IG content index
 *   GET    /_ig/:igId/structure/:sdId                → SD + dependencies
 *   POST   /_ig/:igId/bundle                        → Batch load resources
 *   POST   /_admin/ig/import                        → Import IG bundle
 *   GET    /_admin/ig/list                           → List imported IGs
 *   GET    /_terminology/codesystem/:id/tree         → CodeSystem concept tree
 *   GET    /:resourceType                           → Search
 *   POST   /:resourceType/_search                   → Search (POST)
 *   POST   /:resourceType                           → Create
 *   GET    /:resourceType/:id                       → Read
 *   PUT    /:resourceType/:id                       → Update
 *   DELETE /:resourceType/:id                       → Delete
 *   GET    /:resourceType/:id/_history              → History (instance)
 *   GET    /:resourceType/:id/_history/:vid         → VRead
 *
 * @module fhir-server/router
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import { FHIR_JSON } from "../error/response.js";
import {
  getCachedJson,
  getCachedETag,
  isNotModified,
} from "../capability/capability-cache.js";
import { handleCreate, handleRead, handleUpdate, handleDelete, handleVRead } from "../controller/crud-controller.js";
import { handleSearch } from "../controller/search-controller.js";
import { handleHistoryInstance } from "../controller/history-controller.js";
import { handleBundle } from "../controller/bundle-controller.js";
import { handleValidate, handleValueSetExpand, handleValueSetExpandById } from "../controller/operation-controller.js";
import { igRoutes } from "../ig/ig-routes.js";
import { adminIGRoutes } from "../ig/admin-ig-routes.js";
import { terminologyTreeRoutes } from "../ig/terminology-tree-routes.js";

// =============================================================================
// Section 1: Types
// =============================================================================

interface ResourceParams {
  resourceType: string;
  id: string;
}

interface VReadParams extends ResourceParams {
  vid: string;
}

/**
 * Options for the FHIR router plugin.
 */
export interface FhirRouterOptions {
  engine: FhirEngine;
  baseUrl: string;
}

// =============================================================================
// Section 2: Router Plugin
// =============================================================================

/**
 * Register all FHIR REST routes as a Fastify plugin.
 */
export async function fhirRouter(
  app: FastifyInstance,
  options: FhirRouterOptions,
): Promise<void> {
  const { engine, baseUrl } = options;

  // Build a Set of valid resource types for fast lookup
  const validTypes = new Set(engine.resourceTypes);

  /** Return 404 OperationOutcome if resourceType is not a known FHIR type. */
  function validateResourceType(resourceType: string, reply: FastifyReply): boolean {
    if (!validTypes.has(resourceType)) {
      reply.status(404).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "not-found", diagnostics: `Unknown resource type: ${resourceType}` }],
      });
      return false;
    }
    return true;
  }

  // ── GET /metadata ─────────────────────────────────────────────────────────
  app.get("/metadata", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ifNoneMatch = _request.headers["if-none-match"] as string | undefined;
      if (isNotModified(ifNoneMatch)) {
        reply.status(304).send();
        return;
      }

      const json = getCachedJson();
      const etag = getCachedETag();

      if (!json) {
        reply.status(503).header("content-type", FHIR_JSON).send({
          resourceType: "OperationOutcome",
          issue: [{ severity: "error", code: "exception", diagnostics: "CapabilityStatement not available" }],
        });
        return;
      }

      reply
        .status(200)
        .header("content-type", FHIR_JSON)
        .header("etag", etag ?? "")
        .send(json);
    } catch (err) {
      console.error("[METADATA ERROR]", err);
      throw err;
    }
  });

  // ── GET /healthcheck ──────────────────────────────────────────────────────
  app.get("/healthcheck", async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header("content-type", "application/json");
    return { status: "ok", uptime: process.uptime() };
  });

  // ── Phase 004: IG & Terminology routes ───────────────────────────────────────
  await app.register(igRoutes, { prefix: "/_ig", engine });
  await app.register(adminIGRoutes, { prefix: "/_admin/ig", engine });
  await app.register(terminologyTreeRoutes, { prefix: "/_terminology", engine });

  // ── POST / (Bundle) ───────────────────────────────────────────────────────
  app.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    await handleBundle(engine, baseUrl, request, reply);
  });

  // ── FIX-6: GET /ValueSet/$expand ───────────────────────────────────────────
  app.get("/ValueSet/\$expand", async (request: FastifyRequest, reply: FastifyReply) => {
    await handleValueSetExpand(engine, request, reply);
  });

  // ── FIX-6: POST /ValueSet/$expand ──────────────────────────────────────────
  app.post("/ValueSet/\$expand", async (request: FastifyRequest, reply: FastifyReply) => {
    await handleValueSetExpand(engine, request, reply);
  });

  // ── GET /ValueSet/:id/$expand (expand by ID) ──────────────────────────────
  app.get("/ValueSet/:id/\$expand", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await handleValueSetExpandById(engine, request.params.id, request, reply);
  });

  // ── FIX-5: POST /:resourceType/$validate ───────────────────────────────────
  app.post("/:resourceType/\$validate", async (request: FastifyRequest<{ Params: { resourceType: string } }>, reply: FastifyReply) => {
    if (!validateResourceType(request.params.resourceType, reply)) return;
    await handleValidate(engine, request.params.resourceType, request, reply);
  });

  // ── POST /:resourceType/_search ───────────────────────────────────────────
  app.post("/:resourceType/_search", async (request: FastifyRequest<{ Params: { resourceType: string } }>, reply: FastifyReply) => {
    if (!validateResourceType(request.params.resourceType, reply)) return;
    await handleSearch(engine, baseUrl, request.params.resourceType, request, reply);
  });

  // ── GET /:resourceType/:id/_history/:vid (VRead) ──────────────────────────
  app.get("/:resourceType/:id/_history/:vid", async (request: FastifyRequest<{ Params: VReadParams }>, reply: FastifyReply) => {
    const { resourceType, id, vid } = request.params;
    if (!validateResourceType(resourceType, reply)) return;
    await handleVRead(engine, resourceType, id, vid, reply);
  });

  // ── GET /:resourceType/:id/_history (History) ─────────────────────────────
  app.get("/:resourceType/:id/_history", async (request: FastifyRequest<{ Params: ResourceParams }>, reply: FastifyReply) => {
    const { resourceType, id } = request.params;
    if (!validateResourceType(resourceType, reply)) return;
    await handleHistoryInstance(engine, baseUrl, resourceType, id, reply, request);
  });

  // ── GET /:resourceType/:id (Read) ─────────────────────────────────────────
  app.get("/:resourceType/:id", async (request: FastifyRequest<{ Params: ResourceParams }>, reply: FastifyReply) => {
    const { resourceType, id } = request.params;
    if (!validateResourceType(resourceType, reply)) return;
    await handleRead(engine, resourceType, id, reply, request);
  });

  // ── PUT /:resourceType/:id (Update) ───────────────────────────────────────
  app.put("/:resourceType/:id", async (request: FastifyRequest<{ Params: ResourceParams }>, reply: FastifyReply) => {
    const { resourceType, id } = request.params;
    if (!validateResourceType(resourceType, reply)) return;
    await handleUpdate(engine, baseUrl, resourceType, id, request, reply);
  });

  // ── DELETE /:resourceType/:id (Delete) ─────────────────────────────────────
  app.delete("/:resourceType/:id", async (request: FastifyRequest<{ Params: ResourceParams }>, reply: FastifyReply) => {
    const { resourceType, id } = request.params;
    if (!validateResourceType(resourceType, reply)) return;
    await handleDelete(engine, resourceType, id, reply);
  });

  // ── GET /:resourceType (Search) ───────────────────────────────────────────
  app.get("/:resourceType", async (request: FastifyRequest<{ Params: { resourceType: string } }>, reply: FastifyReply) => {
    if (!validateResourceType(request.params.resourceType, reply)) return;
    await handleSearch(engine, baseUrl, request.params.resourceType, request, reply);
  });

  // ── POST /:resourceType (Create) ──────────────────────────────────────────
  app.post("/:resourceType", async (request: FastifyRequest<{ Params: { resourceType: string } }>, reply: FastifyReply) => {
    if (!validateResourceType(request.params.resourceType, reply)) return;
    await handleCreate(engine, baseUrl, request.params.resourceType, request, reply);
  });
}
