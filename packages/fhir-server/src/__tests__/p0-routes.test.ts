/**
 * Phase P0 Route Tests
 *
 * Tests for:
 * - Conditional create (If-None-Exist header)
 * - Conditional update (PUT /:type?search)
 * - Type history (GET /:type/_history)
 * - $reindex (POST /:type/:id/$reindex)
 * - .well-known/openid-configuration
 * - .well-known/smart-configuration
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockRepo, createTestApp, mockPersistedResource, mockHistoryEntry } from "./helpers.js";
import type { MockRepo } from "./helpers.js";

// =============================================================================
// Mock Search Registry
// =============================================================================

function createMockSearchRegistry() {
  return {
    get: vi.fn().mockReturnValue(undefined),
    getImpl: vi.fn().mockReturnValue({ type: "token", columnName: "identifier" }),
    getForResource: vi.fn().mockReturnValue([]),
    has: vi.fn().mockReturnValue(false),
    getAll: vi.fn().mockReturnValue([]),
  };
}

// =============================================================================
// 1. Conditional Create (If-None-Exist)
// =============================================================================

describe("P0 — Conditional Create (If-None-Exist)", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    // Add conditionalCreate to mock
    (repo as any).conditionalCreate = vi.fn();
    app = await createTestApp(repo, {
      searchRegistry: createMockSearchRegistry() as any,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("should perform conditional create when If-None-Exist is present", async () => {
    const created = mockPersistedResource("Patient", {
      id: "new-pat",
    });
    (repo as any).conditionalCreate.mockResolvedValueOnce({
      resource: created,
      created: true,
    });

    const res = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: {
        "content-type": "application/fhir+json",
        "if-none-exist": "identifier=http://example.org|123",
      },
      payload: { resourceType: "Patient", name: [{ family: "Test" }] },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBeDefined();
    expect((repo as any).conditionalCreate).toHaveBeenCalled();
  });

  it("should return 200 when existing resource matches If-None-Exist", async () => {
    const existing = mockPersistedResource("Patient", {
      id: "existing-pat",
    });
    (repo as any).conditionalCreate.mockResolvedValueOnce({
      resource: existing,
      created: false,
    });

    const res = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: {
        "content-type": "application/fhir+json",
        "if-none-exist": "identifier=http://example.org|123",
      },
      payload: { resourceType: "Patient", name: [{ family: "Test" }] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers.location).toBeUndefined();
    const body = JSON.parse(res.body);
    expect(body.id).toBe("existing-pat");
  });

  it("should fall through to normal create when no If-None-Exist header", async () => {
    const created = mockPersistedResource("Patient", { id: "normal-pat" });
    (repo.createResource as any).mockResolvedValueOnce(created);

    const res = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient", name: [{ family: "Normal" }] },
    });

    expect(res.statusCode).toBe(201);
    expect(repo.createResource).toHaveBeenCalled();
  });
});

// =============================================================================
// 2. Conditional Update (PUT /:type?search)
// =============================================================================

describe("P0 — Conditional Update (PUT /:type?search)", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    (repo as any).conditionalUpdate = vi.fn();
    app = await createTestApp(repo, {
      searchRegistry: createMockSearchRegistry() as any,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("should create when no match found (201)", async () => {
    const created = mockPersistedResource("Patient", { id: "cond-new" });
    (repo as any).conditionalUpdate.mockResolvedValueOnce({
      resource: created,
      created: true,
    });

    const res = await app.inject({
      method: "PUT",
      url: "/Patient?identifier=http://example.org|456",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient", name: [{ family: "New" }] },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBeDefined();
  });

  it("should update when exactly 1 match (200)", async () => {
    const updated = mockPersistedResource("Patient", { id: "cond-existing" });
    (repo as any).conditionalUpdate.mockResolvedValueOnce({
      resource: updated,
      created: false,
    });

    const res = await app.inject({
      method: "PUT",
      url: "/Patient?identifier=http://example.org|456",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient", name: [{ family: "Updated" }] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers.location).toBeUndefined();
  });

  it("should return 400 without search params", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/Patient",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient" },
    });

    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// 3. Type History (GET /:type/_history)
// =============================================================================

describe("P0 — Type History (GET /:type/_history)", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return a history Bundle", async () => {
    const entries = [
      mockHistoryEntry("Patient", { id: "p1", versionId: "v1" }),
      mockHistoryEntry("Patient", { id: "p2", versionId: "v2" }),
    ];
    (repo.readTypeHistory as any).mockResolvedValueOnce(entries);

    const res = await app.inject({
      method: "GET",
      url: "/Patient/_history",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Bundle");
    expect(body.type).toBe("history");
    expect(body.entry).toHaveLength(2);
  });

  it("should support _count parameter", async () => {
    (repo.readTypeHistory as any).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "GET",
      url: "/Patient/_history?_count=5",
    });

    expect(res.statusCode).toBe(200);
    expect(repo.readTypeHistory).toHaveBeenCalledWith("Patient", { count: 5 });
  });

  it("should support _since parameter", async () => {
    (repo.readTypeHistory as any).mockResolvedValueOnce([]);

    const since = "2026-01-01T00:00:00Z";
    const res = await app.inject({
      method: "GET",
      url: `/Patient/_history?_since=${since}`,
    });

    expect(res.statusCode).toBe(200);
    expect(repo.readTypeHistory).toHaveBeenCalledWith("Patient", { since });
  });
});

// =============================================================================
// 4. $reindex
// =============================================================================

describe("P0 — $reindex", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("should reindex a resource", async () => {
    const resource = mockPersistedResource("Patient", { id: "reindex-pat" });
    (repo.readResource as any).mockResolvedValueOnce(resource);
    (repo.updateResource as any).mockResolvedValueOnce({
      ...resource,
      meta: { ...resource.meta, versionId: "v2" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/Patient/reindex-pat/$reindex",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
    expect(body.issue[0].diagnostics).toContain("Reindexed");
    expect(repo.readResource).toHaveBeenCalledWith("Patient", "reindex-pat", undefined);
    expect(repo.updateResource).toHaveBeenCalled();
  });

  it("should return 404 for non-existent resource", async () => {
    (repo.readResource as any).mockRejectedValueOnce(
      Object.assign(new Error("Not found"), { resourceType: "Patient", id: "missing" }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/Patient/missing/$reindex",
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

// =============================================================================
// 5. .well-known endpoints (require enableAuth)
// =============================================================================

describe("P0 — .well-known discovery endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const repo = createMockRepo();
    // These endpoints are only registered when enableAuth is true
    // We need to use createApp directly
    const { createApp } = await import("../app.js");
    app = await createApp({
      repo,
      enableAuth: true,
      baseUrl: "http://localhost:8080",
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /.well-known/openid-configuration returns discovery document", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/openid-configuration",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.issuer).toBe("http://localhost:8080");
    expect(body.token_endpoint).toBe("http://localhost:8080/oauth2/token");
    expect(body.userinfo_endpoint).toBe("http://localhost:8080/oauth2/userinfo");
    expect(body.jwks_uri).toBe("http://localhost:8080/.well-known/jwks.json");
    expect(body.grant_types_supported).toContain("authorization_code");
    expect(body.scopes_supported).toContain("openid");
  });

  it("GET /.well-known/smart-configuration returns SMART config", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/smart-configuration",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.authorization_endpoint).toBe("http://localhost:8080/oauth2/authorize");
    expect(body.token_endpoint).toBe("http://localhost:8080/oauth2/token");
    expect(body.capabilities).toContain("launch-standalone");
    expect(body.scopes_supported).toContain("fhirUser");
  });
});
