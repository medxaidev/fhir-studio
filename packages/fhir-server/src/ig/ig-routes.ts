/**
 * IG Aggregate Routes (Task 4.1)
 *
 * Provides IG Explorer read-only APIs under the `/_ig/` prefix:
 * - GET  /_ig/:igId/index          — IG content index (grouped)
 * - GET  /_ig/:igId/structure/:sdId — SD + dependencies
 * - POST /_ig/:igId/bundle         — Batch load multiple resources
 *
 * All data access goes through engine.conformance (FhirConformance).
 * fhir-server does NOT write any SQL.
 *
 * @module fhir-server/ig
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import { FHIR_JSON, buildETag, buildLastModified } from "../error/response.js";
import { errorToOutcome, badRequest, notFound } from "../error/outcomes.js";

// =============================================================================
// Section 1: Types
// =============================================================================

interface IGIdParams {
  igId: string;
}

interface StructureParams extends IGIdParams {
  sdId: string;
}

interface BundleRequestBody {
  resources?: string[];
}

export interface IGRouterOptions {
  engine: FhirEngine;
}

// =============================================================================
// Section 2: SD Dependency Extraction (simple fallback)
// =============================================================================

const PRIMITIVES = new Set([
  "boolean", "integer", "integer64", "string", "decimal", "uri", "url",
  "canonical", "base64Binary", "instant", "date", "dateTime", "time",
  "code", "oid", "id", "markdown", "unsignedInt", "positiveInt", "uuid",
  "xhtml", "Element", "BackboneElement", "Resource", "DomainResource",
]);

/**
 * Extract SD dependencies from snapshot elements.
 * Falls back to simple JS extraction if fhir-runtime is unavailable.
 */
function extractDependencies(sd: Record<string, unknown>): string[] {
  const deps = new Set<string>();
  const snapshot = sd.snapshot as { element?: Array<Record<string, unknown>> } | undefined;
  if (!snapshot?.element) return [];

  for (const el of snapshot.element) {
    const types = el.type as Array<{ code?: string; profile?: string[]; targetProfile?: string[] }> | undefined;
    if (!types) continue;
    for (const t of types) {
      if (t.code && !PRIMITIVES.has(t.code)) deps.add(t.code);
      for (const p of t.profile ?? []) deps.add(p);
      for (const tp of t.targetProfile ?? []) deps.add(tp);
    }
  }

  deps.delete(sd.url as string);
  return [...deps].sort();
}

// =============================================================================
// Section 3: Route Registration
// =============================================================================

export async function igRoutes(
  app: FastifyInstance,
  options: IGRouterOptions,
): Promise<void> {
  const { engine } = options;

  // ── GET /_ig/:igId/index ──────────────────────────────────────────────────
  app.get("/:igId/index", async (
    request: FastifyRequest<{ Params: IGIdParams }>,
    reply: FastifyReply,
  ) => {
    try {
      const { igId } = request.params;
      const conformance = engine.conformance;
      if (!conformance) {
        reply.status(501).header("content-type", FHIR_JSON).send(
          badRequest("Conformance module not available"),
        );
        return;
      }

      const index = await conformance.getIGIndex(igId);
      reply.status(200).header("content-type", "application/json").send({
        igId,
        ...index,
      });
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });

  // ── GET /_ig/:igId/structure/:sdId ────────────────────────────────────────
  app.get("/:igId/structure/:sdId", async (
    request: FastifyRequest<{ Params: StructureParams }>,
    reply: FastifyReply,
  ) => {
    try {
      const { sdId } = request.params;

      const sd = await engine.persistence.readResource("StructureDefinition", sdId);
      if (!sd) {
        reply.status(404).header("content-type", FHIR_JSON).send(
          notFound("StructureDefinition", sdId),
        );
        return;
      }

      const dependencies = extractDependencies(sd as Record<string, unknown>);

      // Add ETag + cache headers
      const etag = buildETag(sd.meta.versionId);
      const lastModified = buildLastModified(sd.meta.lastUpdated);

      // Check If-None-Match
      const ifNoneMatch = request.headers["if-none-match"] as string | undefined;
      if (ifNoneMatch && ifNoneMatch === etag) {
        reply.status(304).send();
        return;
      }

      reply
        .status(200)
        .header("content-type", FHIR_JSON)
        .header("etag", etag)
        .header("last-modified", lastModified)
        .header("cache-control", "max-age=3600, must-revalidate")
        .send({ ...sd, dependencies });
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });

  // ── POST /_ig/:igId/bundle ────────────────────────────────────────────────
  app.post("/:igId/bundle", async (
    request: FastifyRequest<{ Params: IGIdParams; Body: BundleRequestBody }>,
    reply: FastifyReply,
  ) => {
    try {
      const body = request.body as BundleRequestBody | undefined;
      const refs = body?.resources;
      if (!refs || !Array.isArray(refs) || refs.length === 0) {
        reply.status(400).header("content-type", FHIR_JSON).send(
          badRequest("Request body must contain 'resources' array with resource references (e.g. 'StructureDefinition/us-core-patient')"),
        );
        return;
      }

      const entries: Array<{ resource: Record<string, unknown> }> = [];
      for (const ref of refs) {
        const parts = ref.split("/");
        if (parts.length !== 2) continue;
        const [resourceType, id] = parts;
        try {
          const resource = await engine.persistence.readResource(resourceType, id);
          entries.push({ resource: resource as Record<string, unknown> });
        } catch {
          // Skip resources that can't be found
        }
      }

      reply.status(200).header("content-type", FHIR_JSON).send({
        resourceType: "Bundle",
        type: "collection",
        total: entries.length,
        entry: entries,
      });
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });
}
