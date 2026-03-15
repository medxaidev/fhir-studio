/**
 * FHIR Search Route Tests
 *
 * Tests GET /:resourceType (search) and POST /:resourceType/_search
 * using Fastify inject() with a mock ResourceRepository.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { SearchParameterRegistry } from "@medxai/fhir-persistence";
import { createMockRepo, createTestApp, mockPersistedResource } from "./helpers.js";
import type { MockRepo } from "./helpers.js";

// =============================================================================
// Setup: create a registry with Patient search params
// =============================================================================

function createTestRegistry(): SearchParameterRegistry {
  const registry = new SearchParameterRegistry();
  registry.indexImpl("Patient", {
    code: "gender",
    type: "token",
    resourceTypes: ["Patient"],
    expression: "",
    strategy: "column",
    columnName: "gender",
    columnType: "TEXT",
    array: false,
  });
  registry.indexImpl("Patient", {
    code: "active",
    type: "token",
    resourceTypes: ["Patient"],
    expression: "",
    strategy: "column",
    columnName: "active",
    columnType: "BOOLEAN",
    array: false,
  });
  registry.indexImpl("Patient", {
    code: "name",
    type: "string",
    resourceTypes: ["Patient"],
    expression: "",
    strategy: "column",
    columnName: "name",
    columnType: "TEXT",
    array: false,
  });
  registry.indexImpl("Patient", {
    code: "birthdate",
    type: "date",
    resourceTypes: ["Patient"],
    expression: "",
    strategy: "column",
    columnName: "birthdate",
    columnType: "TIMESTAMPTZ",
    array: false,
  });
  return registry;
}

let app: FastifyInstance;
let repo: MockRepo;
let registry: SearchParameterRegistry;

beforeEach(async () => {
  repo = createMockRepo();
  registry = createTestRegistry();
  app = await createTestApp(repo, {
    searchRegistry: registry,
    baseUrl: "http://localhost:3000/fhir/R4",
  });
});

afterEach(async () => {
  await app.close();
});

// =============================================================================
// GET /:resourceType (search via query string)
// =============================================================================

describe("GET /:resourceType (search)", () => {
  it("returns 200 with searchset Bundle", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Bundle");
    expect(body.type).toBe("searchset");
  });

  it("returns resources in Bundle entries", async () => {
    const p1 = mockPersistedResource("Patient", { id: "p1" });
    const p2 = mockPersistedResource("Patient", { id: "p2" });
    repo.searchResources.mockResolvedValue({ resources: [p1, p2] });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    const body = JSON.parse(res.body);
    expect(body.entry).toHaveLength(2);
    expect(body.entry[0].resource.id).toBe("p1");
    expect(body.entry[1].resource.id).toBe("p2");
  });

  it("sets search.mode to match on entries", async () => {
    const p1 = mockPersistedResource("Patient", { id: "p1" });
    repo.searchResources.mockResolvedValue({ resources: [p1] });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    const body = JSON.parse(res.body);
    expect(body.entry[0].search.mode).toBe("match");
  });

  it("includes self link in Bundle", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    const body = JSON.parse(res.body);
    expect(body.link).toBeDefined();
    const selfLink = body.link.find((l: { relation: string }) => l.relation === "self");
    expect(selfLink).toBeDefined();
    expect(selfLink.url).toContain("Patient");
  });

  it("passes search params to repo.searchResources", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    await app.inject({
      method: "GET",
      url: "/Patient?gender=male",
    });

    expect(repo.searchResources).toHaveBeenCalledTimes(1);
    const [request] = repo.searchResources.mock.calls[0];
    expect(request.resourceType).toBe("Patient");
    expect(request.params.length).toBeGreaterThan(0);
  });

  it("returns empty Bundle when no results", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res = await app.inject({
      method: "GET",
      url: "/Patient?gender=unknown-value",
    });

    const body = JSON.parse(res.body);
    expect(body.type).toBe("searchset");
    expect(body.entry).toBeUndefined();
  });

  it("includes total when _total=accurate", async () => {
    repo.searchResources.mockResolvedValue({ resources: [], total: 42 });

    const res = await app.inject({
      method: "GET",
      url: "/Patient?_total=accurate",
    });

    const body = JSON.parse(res.body);
    expect(body.total).toBe(42);
  });

  it("omits total when _total not specified", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    const body = JSON.parse(res.body);
    expect(body.total).toBeUndefined();
  });

  it("includes next link when page is full", async () => {
    // Default count is 20, return 20 results to trigger next link
    const resources = Array.from({ length: 20 }, (_, i) =>
      mockPersistedResource("Patient", { id: `p${i}` }),
    );
    repo.searchResources.mockResolvedValue({ resources });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    const body = JSON.parse(res.body);
    const nextLink = body.link?.find((l: { relation: string }) => l.relation === "next");
    expect(nextLink).toBeDefined();
    expect(nextLink.url).toContain("_offset=20");
  });

  it("omits next link when page is not full", async () => {
    const resources = [mockPersistedResource("Patient", { id: "p1" })];
    repo.searchResources.mockResolvedValue({ resources });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    const body = JSON.parse(res.body);
    const nextLink = body.link?.find((l: { relation: string }) => l.relation === "next");
    expect(nextLink).toBeUndefined();
  });

  it("respects _count parameter", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    await app.inject({
      method: "GET",
      url: "/Patient?_count=5",
    });

    const [request] = repo.searchResources.mock.calls[0];
    expect(request.count).toBe(5);
  });

  it("respects _offset parameter", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    await app.inject({
      method: "GET",
      url: "/Patient?_offset=10",
    });

    const [request] = repo.searchResources.mock.calls[0];
    expect(request.offset).toBe(10);
  });

  it("includes fullUrl with baseUrl in entries", async () => {
    const p1 = mockPersistedResource("Patient", { id: "p1" });
    repo.searchResources.mockResolvedValue({ resources: [p1] });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    const body = JSON.parse(res.body);
    expect(body.entry[0].fullUrl).toContain("Patient/p1");
  });

  it("returns content-type application/fhir+json", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    expect(res.headers["content-type"]).toContain("application/fhir+json");
  });

  it("returns 500 on repo error", async () => {
    repo.searchResources.mockRejectedValue(new Error("DB connection lost"));

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
  });

  it("generates unique Bundle id", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res1 = await app.inject({ method: "GET", url: "/Patient" });
    const res2 = await app.inject({ method: "GET", url: "/Patient" });

    const body1 = JSON.parse(res1.body);
    const body2 = JSON.parse(res2.body);
    expect(body1.id).not.toBe(body2.id);
  });
});

// =============================================================================
// POST /:resourceType/_search (search via form body)
// =============================================================================

describe("POST /:resourceType/_search (search)", () => {
  it("returns 200 with searchset Bundle", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res = await app.inject({
      method: "POST",
      url: "/Patient/_search",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "gender=male",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Bundle");
    expect(body.type).toBe("searchset");
  });

  it("passes form params to search", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    await app.inject({
      method: "POST",
      url: "/Patient/_search",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "gender=male",
    });

    expect(repo.searchResources).toHaveBeenCalledTimes(1);
    const [request] = repo.searchResources.mock.calls[0];
    expect(request.resourceType).toBe("Patient");
  });

  it("returns resources in Bundle entries", async () => {
    const p1 = mockPersistedResource("Patient", { id: "p1" });
    repo.searchResources.mockResolvedValue({ resources: [p1] });

    const res = await app.inject({
      method: "POST",
      url: "/Patient/_search",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "active=true",
    });

    const body = JSON.parse(res.body);
    expect(body.entry).toHaveLength(1);
    expect(body.entry[0].resource.id).toBe("p1");
  });

  it("returns 500 on repo error", async () => {
    repo.searchResources.mockRejectedValue(new Error("DB error"));

    const res = await app.inject({
      method: "POST",
      url: "/Patient/_search",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "gender=male",
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
  });

  it("handles empty body", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res = await app.inject({
      method: "POST",
      url: "/Patient/_search",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("searchset");
  });
});

// =============================================================================
// Route conflict: GET /:resourceType vs GET /:resourceType/:id
// =============================================================================

describe("Route conflict avoidance", () => {
  it("GET /Patient routes to search (no id segment)", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res = await app.inject({
      method: "GET",
      url: "/Patient",
    });

    const body = JSON.parse(res.body);
    expect(body.type).toBe("searchset");
    expect(repo.searchResources).toHaveBeenCalled();
    expect(repo.readResource).not.toHaveBeenCalled();
  });

  it("GET /Patient/p1 routes to read (has id segment)", async () => {
    const p1 = mockPersistedResource("Patient", { id: "p1" });
    repo.readResource.mockResolvedValue(p1);

    const res = await app.inject({
      method: "GET",
      url: "/Patient/p1",
    });

    const body = JSON.parse(res.body);
    expect(body.id).toBe("p1");
    expect(repo.readResource).toHaveBeenCalled();
    expect(repo.searchResources).not.toHaveBeenCalled();
  });

  it("POST /Patient routes to create (not search)", async () => {
    const created = mockPersistedResource("Patient", { id: "p1" });
    repo.createResource.mockResolvedValue(created);

    const res = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Patient" },
    });

    expect(res.statusCode).toBe(201);
    expect(repo.createResource).toHaveBeenCalled();
    expect(repo.searchResources).not.toHaveBeenCalled();
  });

  it("POST /Patient/_search routes to search", async () => {
    repo.searchResources.mockResolvedValue({ resources: [] });

    const res = await app.inject({
      method: "POST",
      url: "/Patient/_search",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("searchset");
  });
});
