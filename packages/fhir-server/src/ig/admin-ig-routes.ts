/**
 * Admin IG Routes (Task 4.2 + Phase 009)
 *
 * Provides IG administration APIs under the `/_admin/ig` prefix:
 * - POST /_admin/ig/import          — Import a FHIR Bundle as an IG
 * - GET  /_admin/ig/list            — List all imported IGs
 * - GET  /_admin/ig/resource-types  — List supported resource types (Phase 009 Task 9F.1)
 *
 * All import logic is delegated to engine.conformance (IGImportOrchestrator).
 * fhir-server does NOT implement the 6-step import pipeline directly.
 *
 * @module fhir-server/ig
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import { FHIR_JSON } from "../error/response.js";
import { errorToOutcome, badRequest } from "../error/outcomes.js";

// =============================================================================
// Section 1: Types
// =============================================================================

interface ImportRequestBody {
  igId?: string;
  bundle?: Record<string, unknown>;
}

export interface AdminIGRouterOptions {
  engine: FhirEngine;
}

// =============================================================================
// Section 2: Route Registration
// =============================================================================

export async function adminIGRoutes(
  app: FastifyInstance,
  options: AdminIGRouterOptions,
): Promise<void> {
  const { engine } = options;

  // ── POST /_admin/ig/import ────────────────────────────────────────────────
  app.post("/import", async (
    request: FastifyRequest<{ Body: ImportRequestBody }>,
    reply: FastifyReply,
  ) => {
    try {
      const conformance = engine.conformance;
      if (!conformance) {
        reply.status(501).header("content-type", FHIR_JSON).send(
          badRequest("Conformance module not available"),
        );
        return;
      }

      const body = request.body as ImportRequestBody | undefined;
      if (!body?.igId || !body?.bundle) {
        reply.status(400).header("content-type", FHIR_JSON).send(
          badRequest("Request body must contain 'igId' (string) and 'bundle' (FHIR Bundle)"),
        );
        return;
      }

      const { igId, bundle } = body;

      if (bundle.resourceType !== "Bundle") {
        reply.status(400).header("content-type", FHIR_JSON).send(
          badRequest("'bundle' must be a FHIR Bundle resource (resourceType: 'Bundle')"),
        );
        return;
      }

      const result = await conformance.importIG(igId, bundle);

      reply.status(200).header("content-type", "application/json").send(result);
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });

  // ── GET /_admin/ig/resource-types ─────────────────────────────────────────
  app.get("/resource-types", async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    try {
      const types = [...engine.resourceTypes].sort();
      reply.status(200).header("content-type", "application/json").send({ resourceTypes: types });
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });

  // ── GET /_admin/ig/structure-definition/:id ───────────────────────────────
  app.get("/structure-definition/:id", async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const { id } = request.params;
      const rawDefs = engine.definitions as unknown as Record<string, unknown>;
      const sdByUrl = rawDefs.sdByUrl as Map<string, Record<string, unknown>> | undefined;

      let sd: Record<string, unknown> | undefined;

      if (sdByUrl) {
        // 1. Try exact URL match
        sd = sdByUrl.get(id);
        // 2. Try canonical URL pattern
        if (!sd) sd = sdByUrl.get(`http://hl7.org/fhir/StructureDefinition/${id}`);
        // 3. Try matching by id field
        if (!sd) {
          for (const [, entry] of sdByUrl) {
            if (entry.id === id) { sd = entry; break; }
          }
        }
        // 4. Try matching by type field (for base SDs)
        if (!sd) {
          for (const [url, entry] of sdByUrl) {
            if (entry.type === id && url === `http://hl7.org/fhir/StructureDefinition/${id}`) {
              sd = entry;
              break;
            }
          }
        }
      }

      // 5. Try DB as last resort
      if (!sd) {
        try {
          sd = await engine.persistence.readResource("StructureDefinition", id) as Record<string, unknown> | undefined;
        } catch {
          // Not in DB either
        }
      }

      if (!sd) {
        reply.status(404).header("content-type", FHIR_JSON).send(
          badRequest(`StructureDefinition not found: ${id}`),
        );
        return;
      }

      reply
        .status(200)
        .header("content-type", FHIR_JSON)
        .header("cache-control", "max-age=3600, must-revalidate")
        .send(sd);
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });

  // ── GET /_admin/ig/profiles-for-type/:type ────────────────────────────────
  app.get("/profiles-for-type/:type", async (
    request: FastifyRequest<{ Params: { type: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const { type } = request.params;
      const rawDefs = engine.definitions as unknown as Record<string, unknown>;
      const sdByUrl = rawDefs.sdByUrl as Map<string, Record<string, unknown>> | undefined;

      interface ProfileEntry {
        id: string;
        url: string;
        name: string;
        title: string;
        isBase: boolean;
      }

      const profiles: ProfileEntry[] = [];

      if (sdByUrl) {
        for (const [url, sd] of sdByUrl) {
          if (sd.type !== type) continue;
          if (sd.kind !== "resource" && sd.kind !== "complex-type") continue;

          const isBase = url === `http://hl7.org/fhir/StructureDefinition/${type}`;
          profiles.push({
            id: (sd.id as string) ?? url.split("/").pop() ?? url,
            url,
            name: (sd.name as string) ?? (sd.id as string) ?? type,
            title: (sd.title as string) ?? (sd.name as string) ?? type,
            isBase,
          });
        }
      }

      // Sort: base first, then alphabetically
      profiles.sort((a, b) => {
        if (a.isBase && !b.isBase) return -1;
        if (!a.isBase && b.isBase) return 1;
        return a.name.localeCompare(b.name);
      });

      reply.status(200).header("content-type", "application/json").send({ type, profiles });
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });

  // ── GET /_admin/ig/valueset-expand ───────────────────────────────────────
  app.get("/valueset-expand", async (
    request: FastifyRequest<{ Querystring: { url?: string; count?: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const vsUrl = (request.query as Record<string, string>).url;
      if (!vsUrl) {
        reply.status(400).header("content-type", FHIR_JSON).send(
          badRequest("Missing required query parameter: url"),
        );
        return;
      }

      const rawDefs = engine.definitions as unknown as Record<string, unknown>;
      const vsByUrl = rawDefs.vsByUrl as Map<string, Record<string, unknown>> | undefined;
      const csByUrl = rawDefs.csByUrl as Map<string, Record<string, unknown>> | undefined;
      const count = parseInt((request.query as Record<string, string>).count ?? "200", 10);

      if (!vsByUrl) {
        reply.status(404).header("content-type", FHIR_JSON).send(
          badRequest(`ValueSet not found: ${vsUrl}`),
        );
        return;
      }

      const vs = vsByUrl.get(vsUrl);
      if (!vs) {
        reply.status(404).header("content-type", FHIR_JSON).send(
          badRequest(`ValueSet not found: ${vsUrl}`),
        );
        return;
      }

      // Build expansion from compose.include
      interface ExpandedConcept { system?: string; code?: string; display?: string }
      const contains: ExpandedConcept[] = [];

      const compose = vs.compose as { include?: Array<{ system?: string; concept?: Array<{ code?: string; display?: string }>; valueSet?: string[] }> } | undefined;
      if (compose?.include) {
        for (const inc of compose.include) {
          // If concepts are inline
          if (inc.concept) {
            for (const c of inc.concept) {
              contains.push({ system: inc.system, code: c.code, display: c.display });
              if (contains.length >= count) break;
            }
          }
          // If no inline concepts, try to get them from the CodeSystem
          else if (inc.system && csByUrl) {
            const cs = csByUrl.get(inc.system);
            if (cs) {
              const concepts = cs.concept as Array<{ code?: string; display?: string; concept?: unknown[] }> | undefined;
              if (concepts) {
                flattenConcepts(concepts, inc.system, contains, count);
              }
            }
          }
          if (contains.length >= count) break;
        }
      }

      reply.status(200).header("content-type", FHIR_JSON).send({
        resourceType: "ValueSet",
        url: vsUrl,
        expansion: {
          total: contains.length,
          contains,
        },
      });
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });

  // ── GET /_admin/ig/list ───────────────────────────────────────────────────
  app.get("/list", async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    try {
      const conformance = engine.conformance;
      if (!conformance) {
        reply.status(501).header("content-type", FHIR_JSON).send(
          badRequest("Conformance module not available"),
        );
        return;
      }

      const rawIGs = conformance.listIGs ? await conformance.listIGs() : [];
      // Transform to IGSummary shape expected by fhir-rest-client
      const igs = rawIGs.map((ig) => ({
        id: ig.name,
        url: `urn:ig:${ig.name}`,
        version: ig.version,
        name: ig.name,
        title: ig.name,
        status: ig.status ?? "active",
      }));
      reply.status(200).header("content-type", "application/json").send({ igs });
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FlatConcept { system?: string; code?: string; display?: string }

/** Recursively flatten hierarchical CodeSystem concepts into a flat list. */
function flattenConcepts(
  concepts: Array<{ code?: string; display?: string; concept?: unknown[] }>,
  system: string,
  out: FlatConcept[],
  limit: number,
): void {
  for (const c of concepts) {
    if (out.length >= limit) return;
    out.push({ system, code: c.code, display: c.display });
    if (c.concept && Array.isArray(c.concept)) {
      flattenConcepts(
        c.concept as Array<{ code?: string; display?: string; concept?: unknown[] }>,
        system, out, limit,
      );
    }
  }
}
