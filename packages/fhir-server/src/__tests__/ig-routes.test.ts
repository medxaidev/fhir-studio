/**
 * IG Routes Integration Tests (Phase 004)
 *
 * Tests for:
 * - Task 4.1: IG aggregate routes (/_ig/)
 * - Task 4.2: Admin IG routes (/_admin/ig/)
 * - Task 4.3: ETag / If-None-Match / Cache-Control
 * - Task 4.5: CodeSystem tree route (/_terminology/)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { fhirRouter } from "../router/fhir-router.js";
import { cacheCapabilityStatement, _resetCacheForTesting } from "../capability/capability-cache.js";
import { registerRequestContext } from "../middleware/context.js";
import type { FhirEngine } from "../types/engine.js";
import type { PersistedResource } from "../types/fhir.js";

// =============================================================================
// Helpers
// =============================================================================

function mockResource(type: string, id: string, vid = "1"): PersistedResource {
  return {
    resourceType: type, id,
    meta: { versionId: vid, lastUpdated: "2026-03-18T12:00:00Z" },
  };
}

function mockSD(id: string, url: string, opts?: { type?: string; kind?: string }): PersistedResource {
  return {
    resourceType: "StructureDefinition", id, url,
    type: opts?.type ?? "Patient",
    kind: opts?.kind ?? "resource",
    meta: { versionId: "1", lastUpdated: "2026-03-18T12:00:00Z" },
    snapshot: {
      element: [
        { path: "Patient", type: [{ code: "Patient" }] },
        { path: "Patient.name", type: [{ code: "HumanName" }] },
        { path: "Patient.identifier", type: [{ code: "Identifier" }] },
        { path: "Patient.extension", type: [{ code: "Extension", profile: ["http://example.org/ext/race"] }] },
      ],
    },
  };
}

function createMockEngine(withConformance = true): FhirEngine {
  const engine: FhirEngine = {
    persistence: {
      createResource: vi.fn().mockImplementation((_t: string, r: any) =>
        ({ ...r, id: r.id ?? "new-id", meta: { versionId: "1", lastUpdated: new Date().toISOString() } })),
      readResource: vi.fn().mockImplementation((t: string, id: string) => {
        if (t === "StructureDefinition") return mockSD(id, `http://example.org/fhir/StructureDefinition/${id}`);
        if (t === "CodeSystem") return { resourceType: "CodeSystem", id, url: `http://example.org/fhir/CodeSystem/${id}`, meta: { versionId: "1", lastUpdated: "2026-03-18T12:00:00Z" } };
        return mockResource(t, id);
      }),
      updateResource: vi.fn().mockImplementation((_t: string, r: any) =>
        ({ ...r, meta: { versionId: "2", lastUpdated: new Date().toISOString() } })),
      deleteResource: vi.fn(),
      readHistory: vi.fn().mockResolvedValue([]),
      readVersion: vi.fn().mockImplementation((t: string, id: string, vid: string) => mockResource(t, id, vid)),
    },
    runtime: { validate: vi.fn().mockResolvedValue({ valid: true, outcome: { resourceType: "OperationOutcome", issue: [] } }) },
    definitions: { getStructureDefinition: vi.fn(), getValueSet: vi.fn() },
    resourceTypes: ["Patient", "Observation", "StructureDefinition", "ValueSet", "CodeSystem"],
    search: vi.fn().mockResolvedValue({ resources: [], total: 0 }),
    status: vi.fn().mockReturnValue({ databaseType: "sqlite", fhirVersions: ["4.0"], resourceTypes: ["Patient"], loadedPackages: [], igAction: "consistent", startedAt: new Date().toISOString(), plugins: [] }),
    stop: vi.fn(),
  } as unknown as FhirEngine;

  if (withConformance) {
    engine.conformance = {
      getIGIndex: vi.fn().mockResolvedValue({
        profiles: [{ igId: "us-core", resourceType: "StructureDefinition", resourceId: "us-core-patient", resourceUrl: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient", resourceName: "US Core Patient", baseType: "Patient" }],
        extensions: [{ igId: "us-core", resourceType: "StructureDefinition", resourceId: "us-core-race", resourceUrl: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race", resourceName: "US Core Race", baseType: "Extension" }],
        valueSets: [{ igId: "us-core", resourceType: "ValueSet", resourceId: "omb-race-category", resourceUrl: "http://hl7.org/fhir/us/core/ValueSet/omb-race-category", resourceName: "OMB Race Category" }],
        codeSystems: [],
        searchParameters: [],
      }),
      importIG: vi.fn().mockResolvedValue({
        igId: "us-core", resourceCount: 10, sdIndexCount: 5,
        elementIndexCount: 50, conceptCount: 0, spIndexCount: 3, errors: [],
      }),
      listIGs: vi.fn().mockResolvedValue([
        { name: "hl7.fhir.us.core", version: "6.1.0", status: "active" },
      ]),
      getExpansionCache: vi.fn().mockResolvedValue(undefined),
      upsertExpansionCache: vi.fn(),
      invalidateExpansionCache: vi.fn(),
      getConceptTree: vi.fn().mockResolvedValue([
        { id: "cs1:LP7787-7", codeSystemUrl: "http://loinc.org", code: "LP7787-7", display: "Laboratory", level: 0 },
        { id: "cs1:LP7788-1", codeSystemUrl: "http://loinc.org", code: "LP7788-1", display: "Chemistry", parentCode: "LP7787-7", level: 1 },
        { id: "cs1:LP7789-2", codeSystemUrl: "http://loinc.org", code: "LP7789-2", display: "Glucose", parentCode: "LP7788-1", level: 2 },
      ]),
      getConceptChildren: vi.fn().mockResolvedValue([]),
      ensureTables: vi.fn(),
    };
  }

  return engine;
}

// =============================================================================
// Test Setup
// =============================================================================

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

afterEach(async () => {
  await app.close();
});

// =============================================================================
// Task 4.1: IG Aggregate Routes
// =============================================================================

describe("Task 4.1 — IG Aggregate Routes", () => {
  describe("GET /_ig/:igId/index", () => {
    it("returns grouped IG index", async () => {
      const res = await app.inject({ method: "GET", url: "/_ig/us-core/index" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.igId).toBe("us-core");
      expect(body.profiles).toHaveLength(1);
      expect(body.profiles[0].resourceId).toBe("us-core-patient");
      expect(body.extensions).toHaveLength(1);
      expect(body.valueSets).toHaveLength(1);
    });

    it("calls conformance.getIGIndex with correct igId", async () => {
      await app.inject({ method: "GET", url: "/_ig/my-ig/index" });
      expect(engine.conformance!.getIGIndex).toHaveBeenCalledWith("my-ig");
    });

    it("returns 501 when conformance not available", async () => {
      const noConformanceEngine = createMockEngine(false);
      const app2 = Fastify({ logger: false });
      registerRequestContext(app2);
      await app2.register(fhirRouter, { engine: noConformanceEngine, baseUrl: "http://localhost:8080" });
      cacheCapabilityStatement({ resourceType: "CapabilityStatement", status: "active", kind: "instance", fhirVersion: "4.0.1", format: ["json"] });
      await app2.ready();

      const res = await app2.inject({ method: "GET", url: "/_ig/us-core/index" });
      expect(res.statusCode).toBe(501);
      await app2.close();
    });
  });

  describe("GET /_ig/:igId/structure/:sdId", () => {
    it("returns SD with dependencies", async () => {
      const res = await app.inject({ method: "GET", url: "/_ig/us-core/structure/us-core-patient" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.resourceType).toBe("StructureDefinition");
      expect(body.dependencies).toBeDefined();
      expect(Array.isArray(body.dependencies)).toBe(true);
      expect(body.dependencies).toContain("HumanName");
      expect(body.dependencies).toContain("Identifier");
    });

    it("includes ETag and Cache-Control headers", async () => {
      const res = await app.inject({ method: "GET", url: "/_ig/us-core/structure/us-core-patient" });
      expect(res.headers.etag).toBe('W/"1"');
      expect(res.headers["cache-control"]).toBe("max-age=3600, must-revalidate");
      expect(res.headers["last-modified"]).toBeDefined();
    });

    it("returns 304 when If-None-Match matches", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/_ig/us-core/structure/us-core-patient",
        headers: { "if-none-match": 'W/"1"' },
      });
      expect(res.statusCode).toBe(304);
    });

    it("calls persistence.readResource for StructureDefinition", async () => {
      await app.inject({ method: "GET", url: "/_ig/us-core/structure/my-sd" });
      expect(engine.persistence.readResource).toHaveBeenCalledWith("StructureDefinition", "my-sd");
    });
  });

  describe("POST /_ig/:igId/bundle", () => {
    it("returns FHIR Collection Bundle", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/_ig/us-core/bundle",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ resources: ["StructureDefinition/us-core-patient", "StructureDefinition/us-core-obs"] }),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.resourceType).toBe("Bundle");
      expect(body.type).toBe("collection");
      expect(body.entry).toHaveLength(2);
    });

    it("returns 400 on missing resources array", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/_ig/us-core/bundle",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({}),
      });
      expect(res.statusCode).toBe(400);
    });

    it("skips resources that cannot be found", async () => {
      (engine.persistence.readResource as any).mockImplementation((t: string, id: string) => {
        if (id === "not-found") throw new Error("not found");
        return mockResource(t, id);
      });
      const res = await app.inject({
        method: "POST",
        url: "/_ig/us-core/bundle",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ resources: ["Patient/p1", "Patient/not-found"] }),
      });
      const body = JSON.parse(res.body);
      expect(body.entry).toHaveLength(1);
    });
  });
});

// =============================================================================
// Task 4.2: Admin IG Routes
// =============================================================================

describe("Task 4.2 — Admin IG Routes", () => {
  describe("POST /_admin/ig/import", () => {
    it("imports IG bundle successfully", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/_admin/ig/import",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({
          igId: "us-core",
          bundle: {
            resourceType: "Bundle",
            type: "collection",
            entry: [
              { resource: { resourceType: "StructureDefinition", id: "us-core-patient" } },
              { resource: { resourceType: "ValueSet", id: "omb-race" } },
            ],
          },
        }),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.igId).toBe("us-core");
      expect(body.resourceCount).toBe(10);
      expect(body.errors).toHaveLength(0);
    });

    it("calls conformance.importIG with correct args", async () => {
      await app.inject({
        method: "POST",
        url: "/_admin/ig/import",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({
          igId: "my-ig",
          bundle: { resourceType: "Bundle", type: "collection", entry: [] },
        }),
      });
      expect(engine.conformance!.importIG).toHaveBeenCalledWith(
        "my-ig",
        expect.objectContaining({ resourceType: "Bundle" }),
      );
    });

    it("returns 400 on missing igId", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/_admin/ig/import",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ bundle: { resourceType: "Bundle" } }),
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 on non-Bundle resourceType", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/_admin/ig/import",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({
          igId: "test",
          bundle: { resourceType: "Patient", id: "p1" },
        }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /_admin/ig/list", () => {
    it("returns list of imported IGs", async () => {
      const res = await app.inject({ method: "GET", url: "/_admin/ig/list" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.igs).toHaveLength(1);
      expect(body.igs[0].name).toBe("hl7.fhir.us.core");
      expect(body.igs[0].version).toBe("6.1.0");
    });
  });
});

// =============================================================================
// Task 4.3: ETag / If-None-Match / Cache-Control
// =============================================================================

describe("Task 4.3 — ETag Cache Headers", () => {
  it("GET conformance resource includes ETag header", async () => {
    const res = await app.inject({ method: "GET", url: "/StructureDefinition/my-sd" });
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBeDefined();
    expect(res.headers.etag).toMatch(/^W\/"/);
  });

  it("GET conformance resource includes Cache-Control header", async () => {
    const res = await app.inject({ method: "GET", url: "/StructureDefinition/my-sd" });
    expect(res.headers["cache-control"]).toBe("max-age=3600, must-revalidate");
  });

  it("GET non-conformance resource does NOT include Cache-Control", async () => {
    const res = await app.inject({ method: "GET", url: "/Patient/p1" });
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("returns 304 when If-None-Match matches versionId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/StructureDefinition/my-sd",
      headers: { "if-none-match": 'W/"1"' },
    });
    expect(res.statusCode).toBe(304);
    expect(res.headers.etag).toBe('W/"1"');
  });

  it("returns 200 when If-None-Match does NOT match", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/StructureDefinition/my-sd",
      headers: { "if-none-match": 'W/"old-version"' },
    });
    expect(res.statusCode).toBe(200);
  });
});

// =============================================================================
// Task 4.5: CodeSystem Tree Route
// =============================================================================

describe("Task 4.5 — CodeSystem Tree API", () => {
  it("returns nested tree structure", async () => {
    const res = await app.inject({ method: "GET", url: "/_terminology/codesystem/my-cs/tree" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.codeSystemUrl).toBeDefined();
    expect(body.nodes).toBeDefined();
    expect(body.totalConcepts).toBe(3);

    // Root node
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0].code).toBe("LP7787-7");
    expect(body.nodes[0].display).toBe("Laboratory");

    // First child
    expect(body.nodes[0].children).toHaveLength(1);
    expect(body.nodes[0].children[0].code).toBe("LP7788-1");

    // Grandchild
    expect(body.nodes[0].children[0].children).toHaveLength(1);
    expect(body.nodes[0].children[0].children[0].code).toBe("LP7789-2");
  });

  it("calls conformance.getConceptTree", async () => {
    await app.inject({ method: "GET", url: "/_terminology/codesystem/my-cs/tree" });
    expect(engine.conformance!.getConceptTree).toHaveBeenCalled();
  });

  it("returns 501 when conformance not available", async () => {
    const noConformanceEngine = createMockEngine(false);
    const app2 = Fastify({ logger: false });
    registerRequestContext(app2);
    await app2.register(fhirRouter, { engine: noConformanceEngine, baseUrl: "http://localhost:8080" });
    cacheCapabilityStatement({ resourceType: "CapabilityStatement", status: "active", kind: "instance", fhirVersion: "4.0.1", format: ["json"] });
    await app2.ready();

    const res = await app2.inject({ method: "GET", url: "/_terminology/codesystem/my-cs/tree" });
    expect(res.statusCode).toBe(501);
    await app2.close();
  });

  it("returns empty tree when no concepts", async () => {
    (engine.conformance!.getConceptTree as any).mockResolvedValueOnce([]);
    const res = await app.inject({ method: "GET", url: "/_terminology/codesystem/empty-cs/tree" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.nodes).toHaveLength(0);
  });
});
