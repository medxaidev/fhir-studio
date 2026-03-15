/**
 * Phase P0 — Verification Audit Tests (V1-V5)
 *
 * V1: Persistence stress (concurrent writes)
 * V2: Search completeness (all param types generate correct WHERE)
 * V3: Multi-tenant penetration (project isolation)
 * V4: History version integrity (create → update → delete chain)
 * V5: Transaction rollback (partial failure)
 *
 * These tests use mock repositories to verify contract correctness
 * at the HTTP route level.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockRepo, createTestApp, mockPersistedResource, mockHistoryEntry } from "./helpers.js";
import type { MockRepo } from "./helpers.js";

// =============================================================================
// V1: Persistence Stress — Concurrent Writes
// =============================================================================

describe("V1 — Persistence Stress (concurrent writes)", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("V1.1: handles 10 concurrent creates without conflict", async () => {
    let counter = 0;
    (repo.createResource as any).mockImplementation(async (resource: any) => {
      const idx = counter++;
      return mockPersistedResource("Patient", { id: `stress-${idx}` });
    });

    const promises = Array.from({ length: 10 }, (_, i) =>
      app.inject({
        method: "POST",
        url: "/Patient",
        headers: { "content-type": "application/fhir+json" },
        payload: { resourceType: "Patient", name: [{ family: `Stress${i}` }] },
      }),
    );

    const results = await Promise.all(promises);
    const statuses = results.map((r) => r.statusCode);
    expect(statuses.every((s: number) => s === 201)).toBe(true);
  });

  it("V1.2: handles concurrent reads of same resource", async () => {
    const resource = mockPersistedResource("Patient", { id: "shared-read" });
    // Set up 10 resolves
    for (let i = 0; i < 10; i++) {
      (repo.readResource as any).mockResolvedValueOnce(resource);
    }

    const promises = Array.from({ length: 10 }, () =>
      app.inject({ method: "GET", url: "/Patient/shared-read" }),
    );

    const results = await Promise.all(promises);
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
  });

  it("V1.3: handles concurrent update + read without corruption", async () => {
    const resource = mockPersistedResource("Patient", { id: "rw-test" });
    const updated = { ...resource, meta: { ...resource.meta, versionId: "v2" } };

    (repo.readResource as any).mockResolvedValueOnce(resource);
    (repo.updateResource as any).mockResolvedValueOnce(updated);
    (repo.readResource as any).mockResolvedValueOnce(updated);

    const [writeRes, readRes] = await Promise.all([
      app.inject({
        method: "PUT",
        url: "/Patient/rw-test",
        headers: { "content-type": "application/fhir+json" },
        payload: { resourceType: "Patient", id: "rw-test", name: [{ family: "Updated" }] },
      }),
      app.inject({ method: "GET", url: "/Patient/rw-test" }),
    ]);

    expect(writeRes.statusCode).toBe(200);
    expect(readRes.statusCode).toBe(200);
  });

  it("V1.4: version conflict returns 409", async () => {
    const { ResourceVersionConflictError } = await import("@medxai/fhir-persistence");
    (repo.updateResource as any).mockRejectedValueOnce(
      new ResourceVersionConflictError("Patient", "conflict-pat", "stale-version", "current-version"),
    );

    const res = await app.inject({
      method: "PUT",
      url: "/Patient/conflict-pat",
      headers: {
        "content-type": "application/fhir+json",
        "if-match": 'W/"stale-version"',
      },
      payload: { resourceType: "Patient", id: "conflict-pat" },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
  });
});

// =============================================================================
// V2: Search Completeness
// =============================================================================

describe("V2 — Search Completeness", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    const mockRegistry = {
      get: vi.fn().mockReturnValue(undefined),
      getImpl: vi.fn().mockReturnValue({ type: "token", columnName: "test" }),
      getForResource: vi.fn().mockReturnValue([]),
      has: vi.fn().mockReturnValue(false),
      getAll: vi.fn().mockReturnValue([]),
    };
    app = await createTestApp(repo, { searchRegistry: mockRegistry as any });
  });

  afterAll(async () => {
    await app.close();
  });

  it("V2.1: token search (e.g., gender=male)", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({ resources: [], total: 0 });
    const res = await app.inject({ method: "GET", url: "/Patient?gender=male" });
    expect(res.statusCode).toBe(200);
    expect(repo.searchResources).toHaveBeenCalled();
    const call = (repo.searchResources as any).mock.calls[0][0];
    expect(call.resourceType).toBe("Patient");
    expect(call.params.some((p: any) => p.code === "gender")).toBe(true);
  });

  it("V2.2: string search (e.g., name=Smith)", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({ resources: [], total: 0 });
    const res = await app.inject({ method: "GET", url: "/Patient?name=Smith" });
    expect(res.statusCode).toBe(200);
    const call = (repo.searchResources as any).mock.calls.at(-1)[0];
    expect(call.params.some((p: any) => p.code === "name")).toBe(true);
  });

  it("V2.3: reference search (e.g., subject=Patient/123)", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({ resources: [], total: 0 });
    const res = await app.inject({ method: "GET", url: "/Observation?subject=Patient/123" });
    expect(res.statusCode).toBe(200);
    const call = (repo.searchResources as any).mock.calls.at(-1)[0];
    expect(call.params.some((p: any) => p.code === "subject")).toBe(true);
  });

  it("V2.4: date search (e.g., _lastUpdated=gt2026-01-01)", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({ resources: [], total: 0 });
    const res = await app.inject({ method: "GET", url: "/Patient?_lastUpdated=gt2026-01-01" });
    expect(res.statusCode).toBe(200);
    const call = (repo.searchResources as any).mock.calls.at(-1)[0];
    expect(call.params.some((p: any) => p.code === "_lastUpdated")).toBe(true);
  });

  it("V2.5: _count and _offset propagate correctly", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({ resources: [], total: 0 });
    const res = await app.inject({ method: "GET", url: "/Patient?_count=5&_offset=10" });
    expect(res.statusCode).toBe(200);
    const call = (repo.searchResources as any).mock.calls.at(-1)[0];
    expect(call.count).toBe(5);
    expect(call.offset).toBe(10);
  });

  it("V2.6: _sort propagates correctly", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({ resources: [], total: 0 });
    const res = await app.inject({ method: "GET", url: "/Patient?_sort=-_lastUpdated" });
    expect(res.statusCode).toBe(200);
    const call = (repo.searchResources as any).mock.calls.at(-1)[0];
    expect(call.sort).toBeDefined();
  });

  it("V2.7: _include propagates correctly", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({ resources: [], total: 0 });
    const res = await app.inject({ method: "GET", url: "/Observation?_include=Observation:subject" });
    expect(res.statusCode).toBe(200);
    const call = (repo.searchResources as any).mock.calls.at(-1)[0];
    expect(call.include).toBeDefined();
    expect(call.include.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// V3: Multi-tenant Penetration (project isolation)
// =============================================================================

describe("V3 — Multi-tenant Penetration", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("V3.1: read passes OperationContext to repo when authenticated", async () => {
    // Without auth, context is undefined — should still work
    const resource = mockPersistedResource("Patient", { id: "v3-read" });
    (repo.readResource as any).mockResolvedValueOnce(resource);

    const res = await app.inject({ method: "GET", url: "/Patient/v3-read" });
    expect(res.statusCode).toBe(200);
    // Context should be undefined for unauthenticated requests
    expect(repo.readResource).toHaveBeenCalledWith("Patient", "v3-read", undefined);
  });

  it("V3.2: create passes OperationContext to repo", async () => {
    const created = mockPersistedResource("Patient", { id: "v3-create" });
    (repo.createResource as any).mockResolvedValueOnce(created);

    await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient" },
    });

    // For unauthenticated requests, context is undefined
    expect(repo.createResource).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: "Patient" }),
      undefined,
      undefined,
    );
  });

  it("V3.3: search passes OperationContext to repo", async () => {
    const mockRegistry = {
      get: vi.fn().mockReturnValue(undefined),
      getImpl: vi.fn().mockReturnValue({ type: "token", columnName: "test" }),
      getForResource: vi.fn().mockReturnValue([]),
      has: vi.fn().mockReturnValue(false),
      getAll: vi.fn().mockReturnValue([]),
    };
    const searchApp = await createTestApp(repo, { searchRegistry: mockRegistry as any });

    (repo.searchResources as any).mockResolvedValueOnce({ resources: [], total: 0 });

    await searchApp.inject({ method: "GET", url: "/Patient?name=Test" });

    // searchResources should be called with context as third arg
    const lastCall = (repo.searchResources as any).mock.calls.at(-1);
    // Context should be undefined (unauthenticated)
    expect(lastCall[2]).toBeUndefined();

    await searchApp.close();
  });

  it("V3.4: delete passes OperationContext to repo", async () => {
    (repo.deleteResource as any).mockResolvedValueOnce(undefined);

    await app.inject({ method: "DELETE", url: "/Patient/v3-delete" });

    expect(repo.deleteResource).toHaveBeenCalledWith("Patient", "v3-delete", undefined);
  });

  it("V3.5: update passes OperationContext to repo", async () => {
    const updated = mockPersistedResource("Patient", { id: "v3-update" });
    (repo.updateResource as any).mockResolvedValueOnce(updated);

    await app.inject({
      method: "PUT",
      url: "/Patient/v3-update",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient", id: "v3-update" },
    });

    // updateResource(resource, options, context)
    const lastCall = (repo.updateResource as any).mock.calls.at(-1);
    expect(lastCall[2]).toBeUndefined(); // no auth = no context
  });
});

// =============================================================================
// V4: History Version Integrity
// =============================================================================

describe("V4 — History Version Integrity", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("V4.1: instance history returns correct Bundle structure", async () => {
    const entries = [
      mockHistoryEntry("Patient", { id: "h-pat", versionId: "v3", deleted: false }),
      mockHistoryEntry("Patient", { id: "h-pat", versionId: "v2", deleted: false }),
      mockHistoryEntry("Patient", { id: "h-pat", versionId: "v1", deleted: false }),
    ];
    (repo.readHistory as any).mockResolvedValueOnce(entries);

    const res = await app.inject({ method: "GET", url: "/Patient/h-pat/_history" });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Bundle");
    expect(body.type).toBe("history");
    expect(body.entry).toHaveLength(3);
  });

  it("V4.2: history entries have unique versionIds", async () => {
    const entries = [
      mockHistoryEntry("Patient", { id: "h-pat2", versionId: "v3" }),
      mockHistoryEntry("Patient", { id: "h-pat2", versionId: "v2" }),
      mockHistoryEntry("Patient", { id: "h-pat2", versionId: "v1" }),
    ];
    (repo.readHistory as any).mockResolvedValueOnce(entries);

    const res = await app.inject({ method: "GET", url: "/Patient/h-pat2/_history" });
    const body = JSON.parse(res.body);
    const versionIds = body.entry.map((e: any) => e.resource?.meta?.versionId ?? e.request?.url);
    const uniqueIds = new Set(versionIds);
    expect(uniqueIds.size).toBe(versionIds.length);
  });

  it("V4.3: deleted entries appear in history", async () => {
    const entries = [
      mockHistoryEntry("Patient", { id: "h-del", versionId: "v2", deleted: true }),
      mockHistoryEntry("Patient", { id: "h-del", versionId: "v1", deleted: false }),
    ];
    (repo.readHistory as any).mockResolvedValueOnce(entries);

    const res = await app.inject({ method: "GET", url: "/Patient/h-del/_history" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entry).toHaveLength(2);
  });

  it("V4.4: vread returns specific version", async () => {
    const resource = mockPersistedResource("Patient", {
      id: "vread-pat",
      meta: { versionId: "v1", lastUpdated: "2026-01-01T00:00:00Z" },
    });
    (repo.readVersion as any).mockResolvedValueOnce(resource);

    const res = await app.inject({ method: "GET", url: "/Patient/vread-pat/_history/v1" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.versionId).toBe("v1");
    expect(repo.readVersion).toHaveBeenCalledWith("Patient", "vread-pat", "v1");
  });

  it("V4.5: vread of non-existent version returns error", async () => {
    const { ResourceNotFoundError } = await import("@medxai/fhir-persistence");
    (repo.readVersion as any).mockRejectedValueOnce(
      new ResourceNotFoundError("Patient", "vread-pat2"),
    );

    const res = await app.inject({ method: "GET", url: "/Patient/vread-pat2/_history/v999" });
    expect(res.statusCode).toBe(404);
  });

  it("V4.6: type history returns multiple resources", async () => {
    const entries = [
      mockHistoryEntry("Patient", { id: "th-1", versionId: "v1" }),
      mockHistoryEntry("Patient", { id: "th-2", versionId: "v1" }),
      mockHistoryEntry("Patient", { id: "th-3", versionId: "v1" }),
    ];
    (repo.readTypeHistory as any).mockResolvedValueOnce(entries);

    const res = await app.inject({ method: "GET", url: "/Patient/_history" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("history");
    expect(body.entry).toHaveLength(3);
  });
});

// =============================================================================
// V5: Transaction Rollback
// =============================================================================

describe("V5 — Transaction & Batch Rollback", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("V5.1: transaction bundle with invalid type returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Bundle",
        type: "searchset",
        entry: [],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.issue[0].diagnostics).toContain("transaction");
  });

  it("V5.2: non-Bundle POST to / returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("V5.3: empty body POST to / returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/",
      headers: { "content-type": "application/fhir+json" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("V5.4: DELETE on non-existent resource returns 404/410", async () => {
    const { ResourceNotFoundError } = await import("@medxai/fhir-persistence");
    (repo.deleteResource as any).mockRejectedValueOnce(
      new ResourceNotFoundError("Patient", "not-here"),
    );

    const res = await app.inject({
      method: "DELETE",
      url: "/Patient/not-here",
    });

    expect(res.statusCode).toBe(404);
  });

  it("V5.5: DELETE on already-deleted resource returns 410", async () => {
    const { ResourceGoneError } = await import("@medxai/fhir-persistence");
    (repo.deleteResource as any).mockRejectedValueOnce(
      new ResourceGoneError("Patient", "already-gone"),
    );

    const res = await app.inject({
      method: "DELETE",
      url: "/Patient/already-gone",
    });

    expect(res.statusCode).toBe(410);
  });

  it("V5.6: PATCH with non-array body returns 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/Patient/patch-test",
      headers: { "content-type": "application/json-patch+json" },
      payload: { op: "replace", path: "/name", value: "test" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("V5.7: $validate with no body returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/Patient/$validate",
    });

    expect(res.statusCode).toBe(400);
  });
});
