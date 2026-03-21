/**
 * CRUD Controller
 *
 * Handles Create, Read, Update, Delete, and VRead operations.
 * Delegates to engine.persistence and sets FHIR-compliant response headers.
 *
 * @module fhir-server/controller
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import type { Resource, PersistedResource } from "../types/fhir.js";
import {
  FHIR_JSON,
  buildLocationHeader,
  buildResourceHeaders,
  parseETag,
} from "../error/response.js";
import { allOk, errorToOutcome } from "../error/outcomes.js";

// =============================================================================
// Create
// =============================================================================

/**
 * POST /:resourceType → Create a new resource.
 */
export async function handleCreate(
  engine: FhirEngine,
  baseUrl: string,
  resourceType: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = request.body as Resource | undefined;
    if (!body || typeof body !== "object") {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "Request body is required" }],
      });
      return;
    }

    const resource = { ...body, resourceType };
    const created = await engine.persistence.createResource(resourceType, resource);

    const h = buildResourceHeaders(created);
    const location = buildLocationHeader(baseUrl, created.resourceType, created.id, created.meta.versionId);

    reply
      .status(201)
      .header("content-type", h["content-type"])
      .header("etag", h.etag)
      .header("last-modified", h["last-modified"])
      .header("location", location)
      .send(created);
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// =============================================================================
// Read
// =============================================================================

/**
 * GET /:resourceType/:id → Read a resource.
 */
/** Conformance resource types that benefit from caching. */
const CONFORMANCE_TYPES = new Set([
  "StructureDefinition", "ValueSet", "CodeSystem",
  "ImplementationGuide", "SearchParameter", "CapabilityStatement",
  "OperationDefinition", "CompartmentDefinition", "NamingSystem",
]);

export async function handleRead(
  engine: FhirEngine,
  resourceType: string,
  id: string,
  reply: FastifyReply,
  request?: FastifyRequest,
): Promise<void> {
  try {
    let resource: PersistedResource;
    try {
      resource = await engine.persistence.readResource(resourceType, id);
    } catch (dbErr) {
      // FIX-8: Fallback to engine.definitions for conformance resource types
      if (CONFORMANCE_TYPES.has(resourceType)) {
        const defResource = readFromDefinitions(engine, resourceType, id);
        if (defResource) {
          resource = defResource as PersistedResource;
        } else {
          throw dbErr;
        }
      } else {
        throw dbErr;
      }
    }
    const h = buildResourceHeaders(resource);

    // Task 4.3: If-None-Match → 304 Not Modified
    if (request) {
      const ifNoneMatch = request.headers["if-none-match"] as string | undefined;
      if (ifNoneMatch) {
        const clientVersion = parseETag(ifNoneMatch);
        if (clientVersion === resource.meta.versionId) {
          reply.status(304).header("etag", h.etag).send();
          return;
        }
      }
    }

    const r = reply
      .status(200)
      .header("content-type", h["content-type"])
      .header("etag", h.etag)
      .header("last-modified", h["last-modified"]);

    // Task 4.3: Cache-Control for conformance resources
    if (CONFORMANCE_TYPES.has(resourceType)) {
      r.header("cache-control", "max-age=3600, must-revalidate");
    }

    r.send(resource);
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// =============================================================================
// Update
// =============================================================================

/**
 * PUT /:resourceType/:id → Update a resource.
 */
export async function handleUpdate(
  engine: FhirEngine,
  baseUrl: string,
  resourceType: string,
  id: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = request.body as Resource | undefined;
    if (!body || typeof body !== "object") {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "Request body is required" }],
      });
      return;
    }

    // FIX-3: Validate resourceType in body matches URL
    if (!body.resourceType) {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "required", diagnostics: "Missing required field: resourceType" }],
      });
      return;
    }
    if (body.resourceType !== resourceType) {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: `Resource type in body (${body.resourceType}) does not match URL (${resourceType})` }],
      });
      return;
    }

    // Validate id in body matches URL (if present)
    if (body.id && body.id !== id) {
      reply.status(400).header("content-type", FHIR_JSON).send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: `Resource id in body (${body.id}) does not match URL (${id})` }],
      });
      return;
    }

    // FIX-4: If-Match optimistic locking
    const ifMatch = request.headers["if-match"] as string | undefined;
    const updateOptions: { ifMatch?: string } = {};
    if (ifMatch) {
      updateOptions.ifMatch = parseETag(ifMatch);
    }

    const resource = { ...body, resourceType, id };
    const updated = await engine.persistence.updateResource(resourceType, resource, updateOptions);

    const h = buildResourceHeaders(updated);
    const location = buildLocationHeader(baseUrl, updated.resourceType, updated.id, updated.meta.versionId);

    reply
      .status(200)
      .header("content-type", h["content-type"])
      .header("etag", h.etag)
      .header("last-modified", h["last-modified"])
      .header("location", location)
      .send(updated);
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// =============================================================================
// Delete
// =============================================================================

/**
 * DELETE /:resourceType/:id → Delete a resource.
 */
export async function handleDelete(
  engine: FhirEngine,
  resourceType: string,
  id: string,
  reply: FastifyReply,
): Promise<void> {
  try {
    await engine.persistence.deleteResource(resourceType, id);
    reply.status(200).header("content-type", FHIR_JSON).send(allOk(`Deleted ${resourceType}/${id}`));
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// =============================================================================
// VRead
// =============================================================================

/**
 * GET /:resourceType/:id/_history/:vid → Read a specific version.
 */
export async function handleVRead(
  engine: FhirEngine,
  resourceType: string,
  id: string,
  vid: string,
  reply: FastifyReply,
): Promise<void> {
  try {
    const resource = await engine.persistence.readVersion(resourceType, id, vid);
    const h = buildResourceHeaders(resource);
    reply
      .status(200)
      .header("content-type", h["content-type"])
      .header("etag", h.etag)
      .header("last-modified", h["last-modified"])
      .send(resource);
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * FIX-8: Try to read a conformance resource from engine.definitions when DB read fails.
 * Returns a PersistedResource-shaped object or undefined.
 */
function readFromDefinitions(
  engine: FhirEngine,
  resourceType: string,
  id: string,
): Record<string, unknown> | undefined {
  const defs = engine.definitions as unknown as Record<string, unknown>;

  let resource: Record<string, unknown> | undefined;

  if (resourceType === "StructureDefinition") {
    const sdByUrl = defs.sdByUrl as Map<string, Record<string, unknown>> | undefined;
    if (sdByUrl) {
      resource = sdByUrl.get(id)
        ?? sdByUrl.get(`http://hl7.org/fhir/StructureDefinition/${id}`);
      if (!resource) {
        for (const [, entry] of sdByUrl) {
          if (entry.id === id || entry.type === id) { resource = entry; break; }
        }
      }
    }
  } else if (resourceType === "ValueSet") {
    const vsByUrl = defs.vsByUrl as Map<string, Record<string, unknown>> | undefined;
    if (vsByUrl) {
      resource = vsByUrl.get(id)
        ?? vsByUrl.get(`http://hl7.org/fhir/ValueSet/${id}`);
      if (!resource) {
        for (const [, entry] of vsByUrl) {
          if (entry.id === id) { resource = entry; break; }
        }
      }
    }
  } else if (resourceType === "CodeSystem") {
    const csByUrl = defs.csByUrl as Map<string, Record<string, unknown>> | undefined;
    if (csByUrl) {
      resource = csByUrl.get(id)
        ?? csByUrl.get(`http://hl7.org/fhir/CodeSystem/${id}`);
      if (!resource) {
        for (const [, entry] of csByUrl) {
          if (entry.id === id) { resource = entry; break; }
        }
      }
    }
  }

  if (!resource) return undefined;

  // Ensure it has a meta block for buildResourceHeaders
  if (!resource.meta || typeof resource.meta !== "object") {
    resource = {
      ...resource,
      meta: { versionId: "1", lastUpdated: new Date().toISOString() },
    };
  }
  return resource;
}
