/**
 * Router + Controller Integration Tests (RTR-01, CTL-01~04)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { fhirRouter } from "../router/fhir-router.js";
import { cacheCapabilityStatement, _resetCacheForTesting } from "../capability/capability-cache.js";
import { registerRequestContext } from "../middleware/context.js";
import type { FhirEngine } from "../types/engine.js";
import type { PersistedResource } from "../types/fhir.js";

function mockResource(type: string, id: string, vid = "1"): PersistedResource {
  return {
    resourceType: type, id,
    meta: { versionId: vid, lastUpdated: "2026-01-15T10:00:00.000Z" },
  };
}

function createMockEngine(): FhirEngine {
  return {
    persistence: {
      createResource: vi.fn().mockImplementation((_t: string, r: any) =>
        Promise.resolve(mockResource(r.resourceType, "new-id", "1"))),
      readResource: vi.fn().mockImplementation((t: string, id: string) =>
        Promise.resolve(mockResource(t, id))),
      updateResource: vi.fn().mockImplementation((_t: string, r: any) =>
        Promise.resolve(mockResource(r.resourceType, r.id, "2"))),
      deleteResource: vi.fn().mockResolvedValue(undefined),
      readHistory: vi.fn().mockResolvedValue([
        { resource: mockResource("Patient", "p-1", "2"), resourceType: "Patient", id: "p-1", versionId: "2", lastUpdated: "2026-01-15T10:00:00Z", deleted: false },
        { resource: mockResource("Patient", "p-1", "1"), resourceType: "Patient", id: "p-1", versionId: "1", lastUpdated: "2026-01-14T10:00:00Z", deleted: false },
      ]),
      readVersion: vi.fn().mockImplementation((t: string, id: string, vid: string) =>
        Promise.resolve(mockResource(t, id, vid))),
    },
    search: vi.fn().mockResolvedValue({
      resources: [mockResource("Patient", "p-1"), mockResource("Patient", "p-2")],
      total: 2,
    }),
    runtime: { validate: vi.fn(), evalFhirPath: vi.fn(), generateCapabilityStatement: vi.fn() },
    definitions: { getStructureDefinition: vi.fn(), getValueSet: vi.fn(), getResourceTypes: vi.fn().mockReturnValue(["Patient"]) },
    resourceTypes: ["Patient"],
    status: vi.fn().mockReturnValue({ databaseType: "sqlite", fhirVersions: ["4.0"], resourceTypes: ["Patient"], loadedPackages: [], igAction: "consistent", startedAt: new Date().toISOString(), plugins: [] }),
    stop: vi.fn(),
  } as unknown as FhirEngine;
}

let app: FastifyInstance;
let engine: FhirEngine;

beforeEach(async () => {
  _resetCacheForTesting();
  engine = createMockEngine();
  app = Fastify({ logger: false });
  registerRequestContext(app);
  await app.register(fhirRouter, { engine, baseUrl: "http://localhost:8080" });
  cacheCapabilityStatement({ resourceType: "CapabilityStatement", status: "active", kind: "instance", fhirVersion: "4.0.1", format: ["json"] });
  await app.ready();
});

afterEach(async () => { if (app) await app.close(); _resetCacheForTesting(); });

// metadata
describe("GET /metadata", () => {
  it("returns CS with 200", async () => {
    const res = await app.inject({ method: "GET", url: "/metadata" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).resourceType).toBe("CapabilityStatement");
  });
  it("returns ETag", async () => {
    const res = await app.inject({ method: "GET", url: "/metadata" });
    expect(res.headers.etag).toMatch(/^W\//);
  });
  it("304 for If-None-Match", async () => {
    const r1 = await app.inject({ method: "GET", url: "/metadata" });
    const r2 = await app.inject({ method: "GET", url: "/metadata", headers: { "if-none-match": r1.headers.etag as string } });
    expect(r2.statusCode).toBe(304);
  });
  it("FHIR JSON content type", async () => {
    const res = await app.inject({ method: "GET", url: "/metadata" });
    expect(res.headers["content-type"]).toContain("application/fhir+json");
  });
  it("503 when cache empty", async () => {
    _resetCacheForTesting();
    const res = await app.inject({ method: "GET", url: "/metadata" });
    expect(res.statusCode).toBe(503);
  });
});

// healthcheck
describe("GET /healthcheck", () => {
  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/healthcheck" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe("ok");
  });
});

// Create
describe("POST /:resourceType (Create)", () => {
  it("returns 201", async () => {
    const res = await app.inject({ method: "POST", url: "/Patient", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.statusCode).toBe(201);
  });
  it("returns Location header", async () => {
    const res = await app.inject({ method: "POST", url: "/Patient", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.headers.location).toContain("Patient/new-id/_history/1");
  });
  it("returns ETag", async () => {
    const res = await app.inject({ method: "POST", url: "/Patient", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.headers.etag).toBeDefined();
  });
  it("400 for missing body", async () => {
    const res = await app.inject({ method: "POST", url: "/Patient" });
    expect(res.statusCode).toBe(400);
  });
  it("calls engine.persistence.createResource", async () => {
    await app.inject({ method: "POST", url: "/Patient", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(engine.persistence.createResource).toHaveBeenCalled();
  });
});

// Read
describe("GET /:resourceType/:id (Read)", () => {
  it("returns 200 with resource", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe("p-1");
  });
  it("returns ETag and Last-Modified", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1" });
    expect(res.headers.etag).toBeDefined();
    expect(res.headers["last-modified"]).toBeDefined();
  });
  it("calls readResource with correct params", async () => {
    await app.inject({ method: "GET", url: "/Observation/obs-1" });
    expect(engine.persistence.readResource).toHaveBeenCalledWith("Observation", "obs-1");
  });
  it("FHIR JSON content type", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1" });
    expect(res.headers["content-type"]).toContain("application/fhir+json");
  });
  it("500 on engine error", async () => {
    (engine.persistence.readResource as any).mockRejectedValueOnce(new Error("DB down"));
    const res = await app.inject({ method: "GET", url: "/Patient/p-1" });
    expect(res.statusCode).toBe(500);
  });
});

// Update
describe("PUT /:resourceType/:id (Update)", () => {
  it("returns 200", async () => {
    const res = await app.inject({ method: "PUT", url: "/Patient/p-1", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient", id: "p-1" }) });
    expect(res.statusCode).toBe(200);
  });
  it("returns Location with new version", async () => {
    const res = await app.inject({ method: "PUT", url: "/Patient/p-1", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.headers.location).toContain("_history/2");
  });
  it("400 for missing body", async () => {
    const res = await app.inject({ method: "PUT", url: "/Patient/p-1" });
    expect(res.statusCode).toBe(400);
  });
  it("calls updateResource with id from URL", async () => {
    await app.inject({ method: "PUT", url: "/Patient/p-1", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(engine.persistence.updateResource).toHaveBeenCalledWith("Patient", expect.objectContaining({ id: "p-1" }));
  });
  it("ETag reflects new version", async () => {
    const res = await app.inject({ method: "PUT", url: "/Patient/p-1", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.headers.etag).toBe('W/"2"');
  });
});

// Delete
describe("DELETE /:resourceType/:id (Delete)", () => {
  it("returns 200 with OperationOutcome", async () => {
    const res = await app.inject({ method: "DELETE", url: "/Patient/p-1" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).resourceType).toBe("OperationOutcome");
  });
  it("calls deleteResource", async () => {
    await app.inject({ method: "DELETE", url: "/Patient/p-1" });
    expect(engine.persistence.deleteResource).toHaveBeenCalledWith("Patient", "p-1");
  });
  it("OperationOutcome has informational severity", async () => {
    const res = await app.inject({ method: "DELETE", url: "/Patient/p-1" });
    expect(JSON.parse(res.body).issue[0].severity).toBe("information");
  });
  it("500 on engine error", async () => {
    (engine.persistence.deleteResource as any).mockRejectedValueOnce(new Error("fail"));
    const res = await app.inject({ method: "DELETE", url: "/Patient/p-1" });
    expect(res.statusCode).toBe(500);
  });
  it("FHIR JSON content type", async () => {
    const res = await app.inject({ method: "DELETE", url: "/Patient/p-1" });
    expect(res.headers["content-type"]).toContain("application/fhir+json");
  });
});

// VRead
describe("GET /:resourceType/:id/_history/:vid (VRead)", () => {
  it("returns 200 with versioned resource", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1/_history/v3" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).meta.versionId).toBe("v3");
  });
  it("calls readVersion", async () => {
    await app.inject({ method: "GET", url: "/Patient/p-1/_history/v2" });
    expect(engine.persistence.readVersion).toHaveBeenCalledWith("Patient", "p-1", "v2");
  });
  it("returns ETag matching version", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1/_history/v5" });
    expect(res.headers.etag).toBe('W/"v5"');
  });
  it("500 on engine error", async () => {
    (engine.persistence.readVersion as any).mockRejectedValueOnce(new Error("not found"));
    const res = await app.inject({ method: "GET", url: "/Patient/p-1/_history/v99" });
    expect(res.statusCode).toBe(500);
  });
  it("FHIR JSON content type", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1/_history/v1" });
    expect(res.headers["content-type"]).toContain("application/fhir+json");
  });
});

// History
describe("GET /:resourceType/:id/_history (History)", () => {
  it("returns history Bundle", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1/_history" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Bundle");
    expect(body.type).toBe("history");
    expect(body.total).toBe(2);
  });
  it("entries have fullUrl", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1/_history" });
    const body = JSON.parse(res.body);
    expect(body.entry[0].fullUrl).toContain("Patient/p-1");
  });
  it("entries have request/response", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1/_history" });
    const body = JSON.parse(res.body);
    expect(body.entry[0].request).toBeDefined();
    expect(body.entry[0].response).toBeDefined();
  });
  it("has self link", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p-1/_history" });
    const body = JSON.parse(res.body);
    expect(body.link[0].relation).toBe("self");
  });
  it("calls readHistory", async () => {
    await app.inject({ method: "GET", url: "/Patient/p-1/_history" });
    expect(engine.persistence.readHistory).toHaveBeenCalledWith("Patient", "p-1");
  });
});

// Search
describe("GET /:resourceType (Search)", () => {
  it("returns searchset Bundle", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Bundle");
    expect(body.type).toBe("searchset");
    expect(body.total).toBe(2);
  });
  it("entries have search mode=match", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient" });
    const body = JSON.parse(res.body);
    expect(body.entry[0].search.mode).toBe("match");
  });
  it("entries have fullUrl", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient" });
    const body = JSON.parse(res.body);
    expect(body.entry[0].fullUrl).toContain("Patient/p-1");
  });
  it("has self link", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient" });
    const body = JSON.parse(res.body);
    expect(body.link[0].relation).toBe("self");
  });
  it("calls engine.search", async () => {
    await app.inject({ method: "GET", url: "/Patient?name=John" });
    expect(engine.search).toHaveBeenCalled();
  });
});

// POST _search
describe("POST /:resourceType/_search", () => {
  it("returns searchset Bundle", async () => {
    const res = await app.inject({
      method: "POST", url: "/Patient/_search",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "name=John",
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).type).toBe("searchset");
  });
});

// Bundle
describe("POST / (Bundle)", () => {
  it("returns 501 for transaction bundle (deferred to v0.2.0)", async () => {
    const bundle = { resourceType: "Bundle", type: "transaction", entry: [] };
    const res = await app.inject({ method: "POST", url: "/", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify(bundle) });
    expect(res.statusCode).toBe(501);
    expect(JSON.parse(res.body).issue[0].code).toBe("not-supported");
  });
  it("400 for non-Bundle body", async () => {
    const res = await app.inject({ method: "POST", url: "/", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.statusCode).toBe(400);
  });
  it("400 for invalid bundle type", async () => {
    const res = await app.inject({ method: "POST", url: "/", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Bundle", type: "searchset" }) });
    expect(res.statusCode).toBe(400);
  });
  it("returns 501 for bundle processing (deferred to v0.2.0)", async () => {
    const bundle = { resourceType: "Bundle", type: "batch", entry: [] };
    const res = await app.inject({ method: "POST", url: "/", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify(bundle) });
    expect(res.statusCode).toBe(501);
  });
  it("400 for missing body", async () => {
    const res = await app.inject({ method: "POST", url: "/" });
    expect(res.statusCode).toBe(400);
  });
});
