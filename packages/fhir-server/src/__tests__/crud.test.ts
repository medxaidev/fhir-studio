/**
 * FHIR CRUD Route Tests
 *
 * Tests all 6 FHIR REST interactions + /metadata using Fastify inject().
 * Uses a mock ResourceRepository — no database dependency.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  ResourceNotFoundError,
  ResourceGoneError,
  ResourceVersionConflictError,
} from "@medxai/fhir-persistence";
import { createMockRepo, createTestApp, mockPersistedResource, mockHistoryEntry } from "./helpers.js";
import type { MockRepo } from "./helpers.js";
import { FHIR_JSON } from "../fhir/response.js";

let app: FastifyInstance;
let repo: MockRepo;

beforeEach(async () => {
  repo = createMockRepo();
  app = await createTestApp(repo);
});

afterEach(async () => {
  await app.close();
});

// =============================================================================
// POST /:resourceType (create)
// =============================================================================

describe("POST /:resourceType (create)", () => {
  it("returns 201 with created resource", async () => {
    const created = mockPersistedResource("Patient", {
      id: "p1",
      meta: { versionId: "v1", lastUpdated: "2026-02-23T10:00:00.000Z" },
    });
    repo.createResource.mockResolvedValue(created);

    const res = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient", name: [{ family: "Smith" }] },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers["content-type"]).toContain("application/fhir+json");
    expect(res.headers["etag"]).toBe('W/"v1"');
    expect(res.headers["last-modified"]).toBeDefined();
    expect(res.headers["location"]).toContain("/Patient/p1/_history/v1");

    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Patient");
    expect(body.id).toBe("p1");
  });

  it("returns 400 when body resourceType mismatches URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Observation" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
    expect(body.issue[0].code).toBe("invalid");
  });

  it("passes resource to repo.createResource", async () => {
    const created = mockPersistedResource("Patient");
    repo.createResource.mockResolvedValue(created);

    await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient", active: true },
    });

    // 2 calls: 1 for the resource, 1 for the fire-and-forget AuditEvent
    expect(repo.createResource).toHaveBeenCalledTimes(2);
    const arg = repo.createResource.mock.calls[0][0];
    expect(arg.resourceType).toBe("Patient");
    expect(arg.active).toBe(true);
    // Second call is the AuditEvent
    const auditArg = repo.createResource.mock.calls[1][0];
    expect(auditArg.resourceType).toBe("AuditEvent");
  });

  it("accepts application/json content type", async () => {
    const created = mockPersistedResource("Patient");
    repo.createResource.mockResolvedValue(created);

    const res = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": "application/json" },
      payload: { resourceType: "Patient" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("returns 500 on unexpected repo error", async () => {
    repo.createResource.mockRejectedValue(new Error("DB connection lost"));

    const res = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient" },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
    expect(body.issue[0].code).toBe("exception");
  });
});

// =============================================================================
// GET /:resourceType/:id (read)
// =============================================================================

describe("GET /:resourceType/:id (read)", () => {
  it("returns 200 with resource and headers", async () => {
    const patient = mockPersistedResource("Patient", {
      id: "p1",
      meta: { versionId: "v1", lastUpdated: "2026-02-23T10:00:00.000Z" },
    });
    repo.readResource.mockResolvedValue(patient);

    const res = await app.inject({
      method: "GET",
      url: "/Patient/p1",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["etag"]).toBe('W/"v1"');
    expect(res.headers["last-modified"]).toBeDefined();
    expect(res.headers["content-type"]).toContain("application/fhir+json");

    const body = JSON.parse(res.body);
    expect(body.id).toBe("p1");
  });

  it("returns 404 for non-existent resource", async () => {
    repo.readResource.mockRejectedValue(new ResourceNotFoundError("Patient", "missing"));

    const res = await app.inject({
      method: "GET",
      url: "/Patient/missing",
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
    expect(body.issue[0].code).toBe("not-found");
  });

  it("returns 410 for deleted resource", async () => {
    repo.readResource.mockRejectedValue(new ResourceGoneError("Patient", "deleted-id"));

    const res = await app.inject({
      method: "GET",
      url: "/Patient/deleted-id",
    });

    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.body);
    expect(body.issue[0].code).toBe("deleted");
  });
});

// =============================================================================
// PUT /:resourceType/:id (update)
// =============================================================================

describe("PUT /:resourceType/:id (update)", () => {
  it("returns 200 with updated resource", async () => {
    const updated = mockPersistedResource("Patient", {
      id: "p1",
      meta: { versionId: "v2", lastUpdated: "2026-02-23T11:00:00.000Z" },
    });
    repo.updateResource.mockResolvedValue(updated);

    const res = await app.inject({
      method: "PUT",
      url: "/Patient/p1",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient", id: "p1", active: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["etag"]).toBe('W/"v2"');
    const body = JSON.parse(res.body);
    expect(body.meta.versionId).toBe("v2");
  });

  it("passes If-Match header as ifMatch option", async () => {
    const updated = mockPersistedResource("Patient", { id: "p1" });
    repo.updateResource.mockResolvedValue(updated);

    await app.inject({
      method: "PUT",
      url: "/Patient/p1",
      headers: {
        "content-type": "application/fhir+json",
        "if-match": 'W/"v1"',
      },
      payload: { resourceType: "Patient", id: "p1" },
    });

    expect(repo.updateResource).toHaveBeenCalledTimes(1);
    const options = repo.updateResource.mock.calls[0][1];
    expect(options.ifMatch).toBe("v1");
  });

  it("returns 409 on version conflict", async () => {
    repo.updateResource.mockRejectedValue(
      new ResourceVersionConflictError("Patient", "p1", "v1", "v2"),
    );

    const res = await app.inject({
      method: "PUT",
      url: "/Patient/p1",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient", id: "p1" },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.issue[0].code).toBe("conflict");
  });

  it("returns 404 for non-existent resource", async () => {
    repo.updateResource.mockRejectedValue(new ResourceNotFoundError("Patient", "missing"));

    const res = await app.inject({
      method: "PUT",
      url: "/Patient/missing",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient", id: "missing" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when body resourceType mismatches URL", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/Patient/p1",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Observation", id: "p1" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("sets id from URL path into resource", async () => {
    const updated = mockPersistedResource("Patient", { id: "p1" });
    repo.updateResource.mockResolvedValue(updated);

    await app.inject({
      method: "PUT",
      url: "/Patient/p1",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient" },
    });

    const arg = repo.updateResource.mock.calls[0][0];
    expect(arg.id).toBe("p1");
  });
});

// =============================================================================
// DELETE /:resourceType/:id (delete)
// =============================================================================

describe("DELETE /:resourceType/:id (delete)", () => {
  it("returns 200 with OperationOutcome on successful delete", async () => {
    repo.deleteResource.mockResolvedValue(undefined);

    const res = await app.inject({
      method: "DELETE",
      url: "/Patient/p1",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
    expect(body.issue[0].severity).toBe("information");
  });

  it("returns 404 for non-existent resource", async () => {
    repo.deleteResource.mockRejectedValue(new ResourceNotFoundError("Patient", "missing"));

    const res = await app.inject({
      method: "DELETE",
      url: "/Patient/missing",
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 410 for already-deleted resource", async () => {
    repo.deleteResource.mockRejectedValue(new ResourceGoneError("Patient", "gone-id"));

    const res = await app.inject({
      method: "DELETE",
      url: "/Patient/gone-id",
    });

    expect(res.statusCode).toBe(410);
  });
});

// =============================================================================
// GET /:resourceType/:id/_history (history-instance)
// =============================================================================

describe("GET /:resourceType/:id/_history (history)", () => {
  it("returns 200 with history Bundle", async () => {
    const entries = [
      mockHistoryEntry("Patient", { id: "p1", versionId: "v2", lastUpdated: "2026-02-23T11:00:00.000Z" }),
      mockHistoryEntry("Patient", { id: "p1", versionId: "v1", lastUpdated: "2026-02-23T10:00:00.000Z" }),
    ];
    repo.readHistory.mockResolvedValue(entries);

    const res = await app.inject({
      method: "GET",
      url: "/Patient/p1/_history",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Bundle");
    expect(body.type).toBe("history");
    expect(body.entry).toHaveLength(2);
  });

  it("passes _since and _count query params to repo", async () => {
    repo.readHistory.mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/Patient/p1/_history?_since=2026-01-01T00:00:00Z&_count=5",
    });

    expect(repo.readHistory).toHaveBeenCalledTimes(1);
    const options = repo.readHistory.mock.calls[0][2];
    expect(options.since).toBe("2026-01-01T00:00:00Z");
    expect(options.count).toBe(5);
  });

  it("returns empty Bundle when no history", async () => {
    repo.readHistory.mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: "/Patient/p1/_history",
    });

    const body = JSON.parse(res.body);
    expect(body.type).toBe("history");
    expect(body.total).toBe(0);
  });

  it("includes delete entries in history Bundle", async () => {
    const entries = [
      mockHistoryEntry("Patient", { id: "p1", versionId: "v2", deleted: true }),
      mockHistoryEntry("Patient", { id: "p1", versionId: "v1" }),
    ];
    repo.readHistory.mockResolvedValue(entries);

    const res = await app.inject({
      method: "GET",
      url: "/Patient/p1/_history",
    });

    const body = JSON.parse(res.body);
    expect(body.entry).toHaveLength(2);
    // Delete entry should have DELETE method
    expect(body.entry[0].request.method).toBe("DELETE");
  });
});

// =============================================================================
// GET /:resourceType/:id/_history/:vid (vread)
// =============================================================================

describe("GET /:resourceType/:id/_history/:vid (vread)", () => {
  it("returns 200 with specific version", async () => {
    const resource = mockPersistedResource("Patient", {
      id: "p1",
      meta: { versionId: "v1", lastUpdated: "2026-02-23T10:00:00.000Z" },
    });
    repo.readVersion.mockResolvedValue(resource);

    const res = await app.inject({
      method: "GET",
      url: "/Patient/p1/_history/v1",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["etag"]).toBe('W/"v1"');
    const body = JSON.parse(res.body);
    expect(body.meta.versionId).toBe("v1");
  });

  it("returns 404 for non-existent version", async () => {
    repo.readVersion.mockRejectedValue(new ResourceNotFoundError("Patient", "p1"));

    const res = await app.inject({
      method: "GET",
      url: "/Patient/p1/_history/nonexistent",
    });

    expect(res.statusCode).toBe(404);
  });

  it("passes resourceType, id, and vid to repo.readVersion", async () => {
    const resource = mockPersistedResource("Patient");
    repo.readVersion.mockResolvedValue(resource);

    await app.inject({
      method: "GET",
      url: "/Observation/obs1/_history/v3",
    });

    expect(repo.readVersion).toHaveBeenCalledWith("Observation", "obs1", "v3");
  });
});

// =============================================================================
// GET /metadata (CapabilityStatement)
// =============================================================================

describe("GET /metadata (CapabilityStatement)", () => {
  it("returns 200 with CapabilityStatement", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/metadata",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/fhir+json");
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("CapabilityStatement");
    expect(body.fhirVersion).toBe("4.0.1");
    expect(body.status).toBe("active");
  });

  it("declares supported interactions per resource type", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/metadata",
    });

    const body = JSON.parse(res.body);
    const rest = body.rest[0];
    expect(rest.mode).toBe("server");
    expect(rest.resource.length).toBeGreaterThan(0);

    const patient = rest.resource.find((r: { type: string }) => r.type === "Patient");
    expect(patient).toBeDefined();
    expect(patient.interaction.map((i: { code: string }) => i.code)).toContain("read");
    expect(patient.interaction.map((i: { code: string }) => i.code)).toContain("create");
    expect(patient.versioning).toBe("versioned");
    expect(patient.readHistory).toBe(true);
  });
});
