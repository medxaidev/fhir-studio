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
import type { Resource } from "../types/fhir.js";
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
    const resource = await engine.persistence.readResource(resourceType, id);
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

    const resource = { ...body, resourceType, id };
    const updated = await engine.persistence.updateResource(resourceType, resource);

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
