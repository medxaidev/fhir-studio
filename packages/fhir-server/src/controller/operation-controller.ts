/**
 * Operation Controller
 *
 * Handles FHIR operation endpoints:
 * - POST /:resourceType/$validate → Resource validation
 * - POST /ValueSet/$expand → ValueSet expansion
 * - GET  /ValueSet/$expand → ValueSet expansion (GET variant)
 *
 * @module fhir-server/controller
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import { FHIR_JSON } from "../error/response.js";
import { errorToOutcome, badRequest } from "../error/outcomes.js";

// =============================================================================
// $validate
// =============================================================================

/**
 * POST /:resourceType/$validate → Validate a resource.
 */
export async function handleValidate(
  engine: FhirEngine,
  resourceType: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = request.body as Record<string, unknown> | undefined;

    // Support Parameters wrapper or direct resource
    let resource: unknown;
    let profileUrl: string | undefined;

    if (body?.resourceType === "Parameters") {
      const params = (body.parameter ?? []) as Array<{ name: string; resource?: unknown; valueUri?: string }>;
      const resourceParam = params.find((p) => p.name === "resource");
      const profileParam = params.find((p) => p.name === "profile");
      resource = resourceParam?.resource ?? body;
      profileUrl = profileParam?.valueUri;
    } else {
      resource = body;
      profileUrl = (request.query as Record<string, string>).profile;
    }

    if (!resource || typeof resource !== "object") {
      reply.status(400).header("content-type", FHIR_JSON).send(
        badRequest("Request body must contain a resource to validate"),
      );
      return;
    }

    // Validate resourceType matches URL
    const res = resource as Record<string, unknown>;
    if (res.resourceType && res.resourceType !== resourceType && res.resourceType !== "Parameters") {
      reply.status(400).header("content-type", FHIR_JSON).send(
        badRequest(`Resource type ${res.resourceType} does not match URL resource type ${resourceType}`),
      );
      return;
    }

    // Default to base FHIR StructureDefinition URL if no profile specified
    const resolvedProfile = profileUrl ?? `http://hl7.org/fhir/StructureDefinition/${resourceType}`;
    const result = await engine.runtime.validate(resource, resolvedProfile) as unknown as {
      valid: boolean;
      issues?: Array<{ severity?: string; code?: string; message?: string; path?: string }>;
    };

    // Map ValidationResult to OperationOutcome
    const issues = (result.issues ?? []).map((i) => ({
      severity: i.severity ?? "error",
      code: i.code ?? "processing",
      diagnostics: i.message ?? "Validation issue",
      ...(i.path ? { expression: [i.path] } : {}),
    }));

    const outcome = {
      resourceType: "OperationOutcome",
      issue: issues.length > 0 ? issues : [{ severity: "information", code: "informational", diagnostics: "Validation successful" }],
    };

    reply.status(200).header("content-type", FHIR_JSON).send(outcome);
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// =============================================================================
// $expand
// =============================================================================

/**
 * POST or GET /ValueSet/$expand → Expand a ValueSet.
 */
export async function handleValueSetExpand(
  engine: FhirEngine,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as Record<string, string | undefined>;
    let vsUrl: string | undefined;
    let count = 200;

    // Extract params from query (GET) or Parameters body (POST)
    if (request.method === "POST") {
      const body = request.body as Record<string, unknown> | undefined;
      if (body?.resourceType === "Parameters") {
        const params = (body.parameter ?? []) as Array<{ name: string; valueUri?: string; valueInteger?: number }>;
        vsUrl = params.find((p) => p.name === "url")?.valueUri;
        const countParam = params.find((p) => p.name === "count");
        if (countParam?.valueInteger) count = countParam.valueInteger;
      } else {
        vsUrl = query.url;
      }
    } else {
      vsUrl = query.url;
    }
    if (query.count) count = parseInt(query.count, 10);

    if (!vsUrl) {
      reply.status(400).header("content-type", FHIR_JSON).send(
        badRequest("Missing required parameter: url"),
      );
      return;
    }

    // Decode URL
    const decodedUrl = decodeURIComponent(vsUrl);

    // Use engine.definitions to build expansion
    const rawDefs = engine.definitions as unknown as Record<string, unknown>;
    const vsByUrl = rawDefs.vsByUrl as Map<string, Record<string, unknown>> | undefined;
    const csByUrl = rawDefs.csByUrl as Map<string, Record<string, unknown>> | undefined;

    if (!vsByUrl) {
      reply.status(404).header("content-type", FHIR_JSON).send(
        badRequest(`ValueSet not found: ${decodedUrl}`),
      );
      return;
    }

    const urlWithoutVersion = decodedUrl.includes("|") ? decodedUrl.split("|")[0] : decodedUrl;
    const vs = vsByUrl.get(urlWithoutVersion) ?? vsByUrl.get(decodedUrl) ?? vsByUrl.get(vsUrl);
    if (!vs) {
      reply.status(404).header("content-type", FHIR_JSON).send(
        badRequest(`ValueSet not found: ${decodedUrl}`),
      );
      return;
    }

    // Build expansion from compose.include
    interface ExpandedConcept { system?: string; code?: string; display?: string }
    const contains: ExpandedConcept[] = [];

    const compose = vs.compose as { include?: Array<{ system?: string; concept?: Array<{ code?: string; display?: string }>; valueSet?: string[] }> } | undefined;
    if (compose?.include) {
      for (const inc of compose.include) {
        if (inc.concept) {
          for (const c of inc.concept) {
            contains.push({ system: inc.system, code: c.code, display: c.display });
            if (contains.length >= count) break;
          }
        } else if (inc.system && csByUrl) {
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
      url: decodedUrl,
      expansion: {
        identifier: `urn:uuid:${crypto.randomUUID()}`,
        timestamp: new Date().toISOString(),
        total: contains.length,
        contains,
      },
    });
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// =============================================================================
// $expand by ID
// =============================================================================

/**
 * GET /ValueSet/:id/$expand → Expand a ValueSet by its resource ID.
 *
 * Looks up the ValueSet by id in engine.definitions, then delegates
 * to the same expansion logic as handleValueSetExpand.
 */
export async function handleValueSetExpandById(
  engine: FhirEngine,
  id: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as Record<string, string | undefined>;
    let count = 200;
    if (query.count) count = parseInt(query.count, 10);

    const rawDefs = engine.definitions as unknown as Record<string, unknown>;
    const vsByUrl = rawDefs.vsByUrl as Map<string, Record<string, unknown>> | undefined;
    const csByUrl = rawDefs.csByUrl as Map<string, Record<string, unknown>> | undefined;

    if (!vsByUrl) {
      reply.status(404).header("content-type", FHIR_JSON).send(
        badRequest(`ValueSet not found: ${id}`),
      );
      return;
    }

    // Find ValueSet by id (iterate the map)
    let vs: Record<string, unknown> | undefined;
    let vsUrl: string | undefined;
    for (const [url, entry] of vsByUrl) {
      if (entry.id === id) { vs = entry; vsUrl = url; break; }
    }
    // Also try direct URL patterns
    if (!vs) {
      vs = vsByUrl.get(`http://hl7.org/fhir/ValueSet/${id}`);
      if (vs) vsUrl = `http://hl7.org/fhir/ValueSet/${id}`;
    }

    if (!vs) {
      reply.status(404).header("content-type", FHIR_JSON).send(
        badRequest(`ValueSet not found: ${id}`),
      );
      return;
    }

    // Build expansion
    interface ExpandedConcept { system?: string; code?: string; display?: string }
    const contains: ExpandedConcept[] = [];

    const compose = vs.compose as { include?: Array<{ system?: string; concept?: Array<{ code?: string; display?: string }>; valueSet?: string[] }> } | undefined;
    if (compose?.include) {
      for (const inc of compose.include) {
        if (inc.concept) {
          for (const c of inc.concept) {
            contains.push({ system: inc.system, code: c.code, display: c.display });
            if (contains.length >= count) break;
          }
        } else if (inc.system && csByUrl) {
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
      url: vsUrl ?? (vs.url as string | undefined) ?? `ValueSet/${id}`,
      expansion: {
        identifier: `urn:uuid:${crypto.randomUUID()}`,
        timestamp: new Date().toISOString(),
        total: contains.length,
        contains,
      },
    });
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FlatConcept { system?: string; code?: string; display?: string }

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
