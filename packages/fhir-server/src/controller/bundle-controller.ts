/**
 * Bundle Controller
 *
 * Handles FHIR Bundle operations (transaction and batch).
 * Delegates to engine.persistence.processBundle().
 *
 * @module fhir-server/controller
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import type { Bundle, BundleEntry, Resource } from "../types/fhir.js";
import { FHIR_JSON, buildETag, buildLastModified, buildLocationHeader } from "../error/response.js";
import { errorToOutcome } from "../error/outcomes.js";

// =============================================================================
// Bundle
// =============================================================================

/**
 * POST / → Process a Bundle (transaction or batch).
 *
 * FIX-10: Basic batch implementation — processes entries sequentially.
 * Transaction support (atomic rollback) is deferred until fhir-engine exposes processBundle().
 */
export async function handleBundle(
  engine: FhirEngine,
  baseUrl: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = request.body as Bundle | undefined;

    if (!body || typeof body !== "object" || body.resourceType !== "Bundle") {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "Request body must be a Bundle resource" }],
      });
      return;
    }

    if (!body.type || !["transaction", "batch"].includes(body.type)) {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "Bundle.type must be 'transaction' or 'batch'" }],
      });
      return;
    }

    // Transaction requires atomicity — not yet supported
    if (body.type === "transaction") {
      reply.status(501).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "not-supported", diagnostics: "Transaction bundles are not yet supported (requires atomic processing)" }],
      });
      return;
    }

    // Batch processing — each entry is independent
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const responseEntries: BundleEntry[] = [];

    for (const entry of body.entry ?? []) {
      const entryResponse = await processBatchEntry(engine, base, entry);
      responseEntries.push(entryResponse);
    }

    const responseBundle: Bundle = {
      resourceType: "Bundle",
      type: "batch-response",
      entry: responseEntries,
    };

    reply.status(200).header("content-type", FHIR_JSON).send(responseBundle);
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Process a single batch entry and return a response entry.
 */
async function processBatchEntry(
  engine: FhirEngine,
  baseUrl: string,
  entry: BundleEntry,
): Promise<BundleEntry> {
  try {
    const req = entry.request;
    if (!req?.method || !req?.url) {
      return {
        response: {
          status: "400",
          outcome: {
            resourceType: "OperationOutcome",
            issue: [{ severity: "error", code: "invalid", diagnostics: "Bundle entry missing request.method or request.url" }],
          },
        },
      };
    }

    const method = req.method.toUpperCase();
    const url = req.url;

    // Parse URL: ResourceType/id or ResourceType
    const parts = url.split("/").filter(Boolean);
    const resourceType = parts[0];
    const id = parts[1];

    switch (method) {
      case "POST": {
        if (!entry.resource) {
          return { response: { status: "400" } };
        }
        const created = await engine.persistence.createResource(resourceType, entry.resource as Resource);
        const location = buildLocationHeader(baseUrl, created.resourceType, created.id, created.meta.versionId);
        return {
          resource: created,
          response: {
            status: "201",
            location,
            etag: buildETag(created.meta.versionId),
            lastModified: buildLastModified(created.meta.lastUpdated),
          },
        };
      }
      case "PUT": {
        if (!entry.resource || !id) {
          return { response: { status: "400" } };
        }
        const resource = { ...entry.resource, resourceType, id } as Resource;
        const updated = await engine.persistence.updateResource(resourceType, resource);
        return {
          resource: updated,
          response: {
            status: "200",
            etag: buildETag(updated.meta.versionId),
            lastModified: buildLastModified(updated.meta.lastUpdated),
          },
        };
      }
      case "GET": {
        if (!id) {
          return { response: { status: "400", outcome: { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "invalid", diagnostics: "GET in batch requires resource id" }] } } };
        }
        const resource = await engine.persistence.readResource(resourceType, id);
        return {
          resource,
          response: {
            status: "200",
            etag: buildETag(resource.meta.versionId),
            lastModified: buildLastModified(resource.meta.lastUpdated),
          },
        };
      }
      case "DELETE": {
        if (!id) {
          return { response: { status: "400" } };
        }
        await engine.persistence.deleteResource(resourceType, id);
        return { response: { status: "204" } };
      }
      default:
        return {
          response: {
            status: "405",
            outcome: {
              resourceType: "OperationOutcome",
              issue: [{ severity: "error", code: "not-supported", diagnostics: `Unsupported method: ${method}` }],
            },
          },
        };
    }
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    return {
      response: {
        status: String(status),
        outcome,
      },
    };
  }
}
