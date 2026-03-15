/**
 * FHIR Operations & Extended Route Handlers
 *
 * Implements HTTP endpoints that wire to existing persistence layer capabilities:
 * - POST / (Bundle transaction/batch)
 * - POST /:resourceType/$validate (resource validation)
 * - GET /Patient/:id/$everything (patient compartment export)
 * - PATCH /:resourceType/:id (JSON Patch RFC 6902)
 * - Conditional create (If-None-Exist header on POST)
 * - Conditional update (PUT /:resourceType?search)
 * - Conditional delete (DELETE /:resourceType?search)
 *
 * @module fhir-server/routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository, SearchParameterRegistry } from "@medxai/fhir-persistence";
import {
  parseSearchRequest,
} from "@medxai/fhir-persistence";
import type { FhirRepository } from "@medxai/fhir-persistence";
import { processTransaction, processBatch } from "@medxai/fhir-persistence";
import { FHIR_JSON, buildETag, buildLastModified, parseETag } from "../fhir/response.js";
import { badRequest, errorToOutcome } from "../fhir/outcomes.js";
import type { ResourceValidator } from "../app.js";
import { getOperationContext } from "../auth/middleware.js";
import { logAuditEvent } from "../audit/audit-event.js";

// =============================================================================
// Section 1: Route Parameter Types
// =============================================================================

interface ResourceTypeParams {
  resourceType: string;
}

interface ResourceIdParams extends ResourceTypeParams {
  id: string;
}

// =============================================================================
// Section 2: Common compartment resource types for $everything
// =============================================================================

/**
 * Resource types commonly found in a Patient compartment.
 * Used by the $everything operation.
 */
const PATIENT_COMPARTMENT_TYPES = [
  "AllergyIntolerance",
  "CarePlan",
  "CareTeam",
  "Claim",
  "Condition",
  "Coverage",
  "DetectedIssue",
  "DeviceRequest",
  "DiagnosticReport",
  "DocumentReference",
  "Encounter",
  "EpisodeOfCare",
  "ExplanationOfBenefit",
  "FamilyMemberHistory",
  "Goal",
  "ImagingStudy",
  "Immunization",
  "MedicationAdministration",
  "MedicationDispense",
  "MedicationRequest",
  "MedicationStatement",
  "NutritionOrder",
  "Observation",
  "Procedure",
  "Provenance",
  "QuestionnaireResponse",
  "RiskAssessment",
  "ServiceRequest",
];

// =============================================================================
// Section 3: Route Registration
// =============================================================================

/**
 * Register FHIR operations and extended routes on a Fastify instance.
 *
 * Expects:
 * - `fastify.repo` — ResourceRepository (must be FhirRepository for bundle ops)
 * - `fastify.searchRegistry` — SearchParameterRegistry (optional, for conditional ops)
 * - `fastify.resourceValidator` — ResourceValidator (optional, for $validate)
 */
export async function fhirOperationsRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = (fastify as any).repo as ResourceRepository & FhirRepository;
  const validator = (fastify as any).resourceValidator as ResourceValidator | null;
  const registry = (fastify as any).searchRegistry as SearchParameterRegistry | null;

  // ── POST / (Bundle transaction/batch) ───────────────────────────────────
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | undefined;

    if (!body || body.resourceType !== "Bundle") {
      return sendOutcome(reply, 400, badRequest("Request body must be a Bundle resource"));
    }

    const bundleType = body.type as string;
    if (bundleType !== "transaction" && bundleType !== "batch") {
      return sendOutcome(
        reply,
        400,
        badRequest(`Bundle.type must be 'transaction' or 'batch', got '${bundleType}'`),
      );
    }

    try {
      const bundle = body as any;
      const result =
        bundleType === "transaction"
          ? await processTransaction(repo as FhirRepository, bundle)
          : await processBatch(repo as FhirRepository, bundle);

      reply.header("content-type", FHIR_JSON);
      return result;
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      return sendOutcome(reply, status, outcome);
    }
  });

  // ── POST /:resourceType/$validate ───────────────────────────────────────
  fastify.post<{ Params: ResourceTypeParams }>(
    "/:resourceType/$validate",
    async (request, reply) => {
      const { resourceType } = request.params;
      const body = request.body as Record<string, unknown> | undefined;

      if (!body || typeof body !== "object") {
        return sendOutcome(reply, 400, badRequest("Request body is required"));
      }

      // Use the resource inside a Parameters wrapper if present, otherwise use body directly
      let resource: Record<string, unknown>;
      if (body.resourceType === "Parameters") {
        const param = (body.parameter as any[])?.find(
          (p: any) => p.name === "resource",
        );
        resource = param?.resource ?? body;
      } else {
        resource = body;
      }

      if (!validator) {
        // No validator configured — return valid
        reply.header("content-type", FHIR_JSON);
        return {
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "information",
              code: "informational",
              diagnostics: "Validation not configured on this server",
            },
          ],
        };
      }

      try {
        const result = await validator(resource);
        reply.header("content-type", FHIR_JSON);

        if (result.valid) {
          return {
            resourceType: "OperationOutcome",
            issue: [
              {
                severity: "information",
                code: "informational",
                diagnostics: `${resourceType} resource is valid`,
              },
            ],
          };
        }

        return {
          resourceType: "OperationOutcome",
          issue: (result.issues ?? []).map((i) => ({
            severity: i.severity,
            code: i.code,
            diagnostics: i.diagnostics,
          })),
        };
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );

  // ── GET /:resourceType/:id/$everything ──────────────────────────────────
  fastify.get<{ Params: ResourceIdParams }>(
    "/:resourceType/:id/$everything",
    async (request, reply) => {
      const { resourceType, id } = request.params;

      try {
        const resources = await (repo as FhirRepository).everything(
          resourceType,
          id,
          PATIENT_COMPARTMENT_TYPES,
        );

        const baseUrl = getBaseUrl(request);
        const bundle = {
          resourceType: "Bundle",
          type: "searchset",
          total: resources.length,
          link: [
            {
              relation: "self",
              url: `${baseUrl}/Patient/${id}/$everything`,
            },
          ],
          entry: resources.map((r) => ({
            fullUrl: `${baseUrl}/${r.resourceType}/${r.id}`,
            resource: r,
            search: { mode: r.resourceType === "Patient" && r.id === id ? "match" : "include" },
          })),
        };

        reply.header("content-type", FHIR_JSON);
        return bundle;
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );

  // ── PATCH /:resourceType/:id (JSON Patch) ──────────────────────────────
  fastify.patch<{ Params: ResourceIdParams }>(
    "/:resourceType/:id",
    async (request, reply) => {
      const { resourceType, id } = request.params;
      const operations = request.body as any[];

      if (!Array.isArray(operations)) {
        return sendOutcome(
          reply,
          400,
          badRequest("PATCH body must be a JSON Patch array (RFC 6902)"),
        );
      }

      try {
        const context = getOperationContext(request);

        // Read current resource
        const current = await repo.readResource(resourceType, id, context);

        // Apply JSON Patch operations
        const patched = applyJsonPatch(current as Record<string, unknown>, operations);

        // Ensure resourceType and id are preserved
        patched.resourceType = resourceType;
        patched.id = id;

        // Parse If-Match header for optimistic locking
        const ifMatchHeader = request.headers["if-match"];
        const ifMatch = ifMatchHeader ? parseETag(ifMatchHeader as string) : undefined;

        // Update via repo
        const updated = await repo.updateResource(patched as any, { ifMatch }, context);
        reply
          .header("content-type", FHIR_JSON)
          .header("etag", buildETag(updated.meta.versionId))
          .header("last-modified", buildLastModified(updated.meta.lastUpdated));

        // Audit
        logAuditEvent(
          repo,
          { action: "update", resourceType, resourceId: id, context },
          context,
        );

        return updated;
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );

  // ── PUT /:resourceType?search (conditional update) ──────────────────────
  if (registry) {
    fastify.put<{ Params: ResourceTypeParams; Querystring: Record<string, string> }>(
      "/:resourceType",
      async (request, reply) => {
        const { resourceType } = request.params;
        const queryParams = request.query;
        const body = request.body as Record<string, unknown> | undefined;

        if (!queryParams || Object.keys(queryParams).length === 0) {
          return sendOutcome(
            reply,
            400,
            badRequest("Conditional update requires search parameters in the query string"),
          );
        }

        if (!body || typeof body !== "object") {
          return sendOutcome(reply, 400, badRequest("Request body is required"));
        }

        try {
          const context = getOperationContext(request);
          const searchRequest = parseSearchRequest(resourceType, queryParams, registry);
          const result = await (repo as FhirRepository).conditionalUpdate(
            { ...body, resourceType } as any,
            searchRequest,
          );

          const baseUrl = getBaseUrl(request);
          const status = result.created ? 201 : 200;
          reply
            .status(status)
            .header("content-type", FHIR_JSON)
            .header("etag", buildETag(result.resource.meta.versionId))
            .header("last-modified", buildLastModified(result.resource.meta.lastUpdated));

          if (result.created) {
            reply.header(
              "location",
              `${baseUrl}/${resourceType}/${result.resource.id}/_history/${result.resource.meta.versionId}`,
            );
          }

          // Audit
          logAuditEvent(
            repo,
            {
              action: result.created ? "create" : "update",
              resourceType,
              resourceId: result.resource.id,
              context,
            },
            context,
          );

          return result.resource;
        } catch (err) {
          const { status, outcome } = errorToOutcome(err);
          return sendOutcome(reply, status, outcome);
        }
      },
    );
  }

  // ── Conditional DELETE /:resourceType?search ────────────────────────────
  if (registry) {
    fastify.delete<{ Params: ResourceTypeParams; Querystring: Record<string, string> }>(
      "/:resourceType",
      async (request, reply) => {
        const { resourceType } = request.params;
        const queryParams = request.query;

        if (!queryParams || Object.keys(queryParams).length === 0) {
          return sendOutcome(
            reply,
            400,
            badRequest("Conditional delete requires search parameters"),
          );
        }

        try {
          const searchRequest = parseSearchRequest(resourceType, queryParams, registry);
          const count = await (repo as FhirRepository).conditionalDelete(
            resourceType,
            searchRequest,
          );

          reply.header("content-type", FHIR_JSON);
          return {
            resourceType: "OperationOutcome",
            issue: [
              {
                severity: "information",
                code: "informational",
                diagnostics: `Deleted ${count} ${resourceType} resource(s)`,
              },
            ],
          };
        } catch (err) {
          const { status, outcome } = errorToOutcome(err);
          return sendOutcome(reply, status, outcome);
        }
      },
    );
  }

  // ── POST /:resourceType/:id/$reindex ────────────────────────────────────
  fastify.post<{ Params: ResourceIdParams }>(
    "/:resourceType/:id/$reindex",
    async (request, reply) => {
      const { resourceType, id } = request.params;

      try {
        const context = getOperationContext(request);

        // Read the current resource
        const resource = await repo.readResource(resourceType, id, context);

        // Re-update with the same content to rebuild search indices
        const updated = await repo.updateResource(resource as any, undefined, context);

        reply.header("content-type", FHIR_JSON);
        return {
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "information",
              code: "informational",
              diagnostics: `Reindexed ${resourceType}/${id} (version ${updated.meta.versionId})`,
            },
          ],
        };
      } catch (err) {
        const { status, outcome } = errorToOutcome(err);
        return sendOutcome(reply, status, outcome);
      }
    },
  );
}

// =============================================================================
// Section 4: Conditional Operation Helpers (integrated into resource-routes)
// =============================================================================

/**
 * Handle conditional create: check If-None-Exist header on POST.
 *
 * This is meant to be called from the existing POST route handler
 * when an If-None-Exist header is present.
 */
export function parseIfNoneExist(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = header.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=").map((s) => decodeURIComponent(s.trim()));
    if (key) params[key] = value ?? "";
  }
  return params;
}

// =============================================================================
// Section 5: JSON Patch (RFC 6902) Implementation
// =============================================================================

interface PatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * Apply JSON Patch operations (RFC 6902) to an object.
 *
 * Supports: add, remove, replace, move, copy, test.
 */
function applyJsonPatch(
  target: Record<string, unknown>,
  operations: PatchOperation[],
): Record<string, unknown> {
  let result = structuredClone(target);

  for (const op of operations) {
    switch (op.op) {
      case "add":
        result = patchAdd(result, op.path, op.value);
        break;
      case "remove":
        result = patchRemove(result, op.path);
        break;
      case "replace":
        result = patchReplace(result, op.path, op.value);
        break;
      case "move": {
        if (!op.from) throw new Error("move operation requires 'from'");
        const val = getByPointer(result, op.from);
        result = patchRemove(result, op.from);
        result = patchAdd(result, op.path, val);
        break;
      }
      case "copy": {
        if (!op.from) throw new Error("copy operation requires 'from'");
        const copyVal = getByPointer(result, op.from);
        result = patchAdd(result, op.path, structuredClone(copyVal));
        break;
      }
      case "test": {
        const testVal = getByPointer(result, op.path);
        if (JSON.stringify(testVal) !== JSON.stringify(op.value)) {
          throw new Error(
            `Test failed: value at '${op.path}' is ${JSON.stringify(testVal)}, expected ${JSON.stringify(op.value)}`,
          );
        }
        break;
      }
      default:
        throw new Error(`Unsupported patch operation: ${(op as any).op}`);
    }
  }

  return result;
}

/**
 * Parse a JSON Pointer (RFC 6901) into path segments.
 */
function parsePointer(pointer: string): string[] {
  if (pointer === "" || pointer === "/") return [];
  if (!pointer.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer: '${pointer}'`);
  }
  return pointer
    .substring(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function getByPointer(obj: unknown, pointer: string): unknown {
  const segments = parsePointer(pointer);
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) {
      throw new Error(`Path '${pointer}' not found`);
    }
    if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      if (isNaN(idx) || idx < 0 || idx >= current.length) {
        throw new Error(`Array index '${seg}' out of bounds at '${pointer}'`);
      }
      current = current[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      throw new Error(`Cannot traverse '${pointer}' — not an object/array`);
    }
  }
  return current;
}

function setByPointer(obj: Record<string, unknown>, pointer: string, value: unknown): void {
  const segments = parsePointer(pointer);
  if (segments.length === 0) return;

  let current: unknown = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (Array.isArray(current)) {
      current = current[parseInt(seg, 10)];
    } else if (typeof current === "object" && current !== null) {
      current = (current as Record<string, unknown>)[seg];
    }
  }

  const lastSeg = segments[segments.length - 1];
  if (Array.isArray(current)) {
    if (lastSeg === "-") {
      current.push(value);
    } else {
      const idx = parseInt(lastSeg, 10);
      current.splice(idx, 0, value);
    }
  } else if (typeof current === "object" && current !== null) {
    (current as Record<string, unknown>)[lastSeg] = value;
  }
}

function deleteByPointer(obj: Record<string, unknown>, pointer: string): void {
  const segments = parsePointer(pointer);
  if (segments.length === 0) return;

  let current: unknown = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (Array.isArray(current)) {
      current = current[parseInt(seg, 10)];
    } else if (typeof current === "object" && current !== null) {
      current = (current as Record<string, unknown>)[seg];
    }
  }

  const lastSeg = segments[segments.length - 1];
  if (Array.isArray(current)) {
    const idx = parseInt(lastSeg, 10);
    current.splice(idx, 1);
  } else if (typeof current === "object" && current !== null) {
    delete (current as Record<string, unknown>)[lastSeg];
  }
}

function patchAdd(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  setByPointer(target, path, value);
  return target;
}

function patchRemove(
  target: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  deleteByPointer(target, path);
  return target;
}

function patchReplace(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  // Verify path exists
  getByPointer(target, path);
  deleteByPointer(target, path);
  setByPointer(target, path, value);
  return target;
}

// =============================================================================
// Section 6: Helpers
// =============================================================================

function sendOutcome(
  reply: FastifyReply,
  status: number,
  outcome: { resourceType: string; issue: unknown[] },
): { resourceType: string; issue: unknown[] } {
  reply.status(status).header("content-type", FHIR_JSON);
  return outcome;
}

function getBaseUrl(request: FastifyRequest): string {
  const serverBaseUrl = (request.server as any).baseUrl;
  if (serverBaseUrl) return serverBaseUrl;
  const protocol = request.protocol;
  const host = request.hostname;
  return `${protocol}://${host}`;
}
