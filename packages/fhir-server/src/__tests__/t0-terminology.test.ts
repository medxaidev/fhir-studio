/**
 * Phase T0 + T1 — Terminology & Conformance Tests
 *
 * Tests for:
 * - T0.1: seedConformanceResources() unit tests (mock repo)
 * - T1.1: displayLanguage support in $expand
 * - T1.2: compose.include.filter support
 * - T1.3: $subsumes routes
 * - T0.5/T0.6: Client terminology methods (type-level only, no HTTP)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockRepo, createTestApp, mockPersistedResource } from "./helpers.js";
import type { MockRepo } from "./helpers.js";

// =============================================================================
// 1. TerminologyService — displayLanguage (T1.1)
// =============================================================================

describe("T1.1 — displayLanguage in $expand", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns default display when no displayLanguage", async () => {
    const vs = mockPersistedResource("ValueSet", {
      id: "gender-vs",
      ...({
        url: "http://hl7.org/fhir/ValueSet/administrative-gender",
        compose: {
          include: [{
            concept: [
              {
                code: "male",
                display: "Male",
                designation: [{ language: "zh-CN", value: "男" }],
              },
              {
                code: "female",
                display: "Female",
                designation: [{ language: "zh-CN", value: "女" }],
              },
            ],
          }],
        },
      } as any),
    });
    (repo.readResource as any).mockResolvedValueOnce(vs);

    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/gender-vs/$expand",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.contains[0].display).toBe("Male");
    expect(body.expansion.contains[1].display).toBe("Female");
  });

  it("returns Chinese display when displayLanguage=zh-CN", async () => {
    const vs = mockPersistedResource("ValueSet", {
      id: "gender-vs",
      ...({
        url: "http://hl7.org/fhir/ValueSet/administrative-gender",
        compose: {
          include: [{
            concept: [
              {
                code: "male",
                display: "Male",
                designation: [{ language: "zh-CN", value: "男" }],
              },
              {
                code: "female",
                display: "Female",
                designation: [{ language: "zh-CN", value: "女" }],
              },
            ],
          }],
        },
      } as any),
    });
    (repo.readResource as any).mockResolvedValueOnce(vs);

    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/gender-vs/$expand?displayLanguage=zh-CN",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.contains[0].display).toBe("男");
    expect(body.expansion.contains[1].display).toBe("女");
  });

  it("falls back to default display when language not found", async () => {
    const vs = mockPersistedResource("ValueSet", {
      id: "gender-vs",
      ...({
        compose: {
          include: [{
            concept: [
              {
                code: "male",
                display: "Male",
                designation: [{ language: "zh-CN", value: "男" }],
              },
            ],
          }],
        },
      } as any),
    });
    (repo.readResource as any).mockResolvedValueOnce(vs);

    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/gender-vs/$expand?displayLanguage=ja",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.contains[0].display).toBe("Male");
  });

  it("prefix matches language (zh matches zh-CN)", async () => {
    const vs = mockPersistedResource("ValueSet", {
      id: "gender-vs",
      ...({
        compose: {
          include: [{
            concept: [
              {
                code: "male",
                display: "Male",
                designation: [{ language: "zh-CN", value: "男" }],
              },
            ],
          }],
        },
      } as any),
    });
    (repo.readResource as any).mockResolvedValueOnce(vs);

    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/gender-vs/$expand?displayLanguage=zh",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.contains[0].display).toBe("男");
  });
});

// =============================================================================
// 2. TerminologyService — $expand paging
// =============================================================================

describe("T1 — $expand paging (count/offset)", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns limited results with count parameter", async () => {
    const vs = mockPersistedResource("ValueSet", {
      id: "paging-vs",
      ...({
        compose: {
          include: [{
            concept: [
              { code: "a", display: "A" },
              { code: "b", display: "B" },
              { code: "c", display: "C" },
              { code: "d", display: "D" },
            ],
          }],
        },
      } as any),
    });
    (repo.readResource as any).mockResolvedValueOnce(vs);

    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/paging-vs/$expand?count=2",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.total).toBe(4);
    expect(body.expansion.contains).toHaveLength(2);
    expect(body.expansion.contains[0].code).toBe("a");
    expect(body.expansion.contains[1].code).toBe("b");
  });

  it("returns offset results", async () => {
    const vs = mockPersistedResource("ValueSet", {
      id: "paging-vs",
      ...({
        compose: {
          include: [{
            concept: [
              { code: "a", display: "A" },
              { code: "b", display: "B" },
              { code: "c", display: "C" },
            ],
          }],
        },
      } as any),
    });
    (repo.readResource as any).mockResolvedValueOnce(vs);

    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/paging-vs/$expand?offset=1&count=2",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.total).toBe(3);
    expect(body.expansion.contains).toHaveLength(2);
    expect(body.expansion.contains[0].code).toBe("b");
    expect(body.expansion.contains[1].code).toBe("c");
  });
});

// =============================================================================
// 3. TerminologyService — compose.include.filter (T1.2)
// =============================================================================

describe("T1.2 — compose.include.filter", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("applies 'in' filter to codes from CodeSystem", async () => {
    const cs = mockPersistedResource("CodeSystem", {
      id: "cs-1",
      ...({
        url: "http://example.org/cs",
        concept: [
          { code: "a", display: "A" },
          { code: "b", display: "B" },
          { code: "c", display: "C" },
        ],
      } as any),
    });
    const vs = mockPersistedResource("ValueSet", {
      id: "filter-vs",
      ...({
        url: "http://example.org/vs",
        compose: {
          include: [{
            system: "http://example.org/cs",
            filter: [{ property: "concept", op: "in", value: "a,c" }],
          }],
        },
      } as any),
    });

    (repo.readResource as any).mockResolvedValueOnce(vs);
    (repo.searchResources as any).mockResolvedValueOnce({
      resources: [cs],
      total: 1,
    });

    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/filter-vs/$expand",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.contains).toHaveLength(2);
    const codes = body.expansion.contains.map((c: any) => c.code);
    expect(codes).toContain("a");
    expect(codes).toContain("c");
    expect(codes).not.toContain("b");
  });

  it("applies 'regex' filter", async () => {
    const cs = mockPersistedResource("CodeSystem", {
      id: "cs-regex",
      ...({
        url: "http://example.org/cs-regex",
        concept: [
          { code: "alpha-1", display: "Alpha 1" },
          { code: "beta-2", display: "Beta 2" },
          { code: "alpha-3", display: "Alpha 3" },
        ],
      } as any),
    });
    const vs = mockPersistedResource("ValueSet", {
      id: "regex-vs",
      ...({
        url: "http://example.org/vs-regex",
        compose: {
          include: [{
            system: "http://example.org/cs-regex",
            filter: [{ property: "concept", op: "regex", value: "^alpha" }],
          }],
        },
      } as any),
    });

    (repo.readResource as any).mockResolvedValueOnce(vs);
    (repo.searchResources as any).mockResolvedValueOnce({
      resources: [cs],
      total: 1,
    });

    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/regex-vs/$expand",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.contains).toHaveLength(2);
    expect(body.expansion.contains[0].code).toBe("alpha-1");
    expect(body.expansion.contains[1].code).toBe("alpha-3");
  });
});

// =============================================================================
// 4. CodeSystem/$subsumes (T1.3)
// =============================================================================

describe("T1.3 — CodeSystem/$subsumes", () => {
  let app: FastifyInstance;
  let repo: MockRepo;

  const hierarchicalCS = {
    resourceType: "CodeSystem",
    id: "hierarchy-cs",
    url: "http://example.org/hierarchy",
    concept: [
      {
        code: "animal",
        display: "Animal",
        concept: [
          {
            code: "mammal",
            display: "Mammal",
            concept: [
              { code: "dog", display: "Dog" },
              { code: "cat", display: "Cat" },
            ],
          },
          {
            code: "bird",
            display: "Bird",
          },
        ],
      },
      {
        code: "plant",
        display: "Plant",
      },
    ],
  };

  beforeAll(async () => {
    repo = createMockRepo();
    app = await createTestApp(repo);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 'equivalent' for same code", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({
      resources: [hierarchicalCS],
      total: 1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$subsumes",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://example.org/hierarchy" },
          { name: "codeA", valueCode: "dog" },
          { name: "codeB", valueCode: "dog" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const outcome = body.parameter.find((p: any) => p.name === "outcome");
    expect(outcome.valueCode).toBe("equivalent");
  });

  it("returns 'subsumes' when codeA is ancestor of codeB", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({
      resources: [hierarchicalCS],
      total: 1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$subsumes",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://example.org/hierarchy" },
          { name: "codeA", valueCode: "animal" },
          { name: "codeB", valueCode: "dog" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const outcome = body.parameter.find((p: any) => p.name === "outcome");
    expect(outcome.valueCode).toBe("subsumes");
  });

  it("returns 'subsumed-by' when codeB is ancestor of codeA", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({
      resources: [hierarchicalCS],
      total: 1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$subsumes",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://example.org/hierarchy" },
          { name: "codeA", valueCode: "cat" },
          { name: "codeB", valueCode: "mammal" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const outcome = body.parameter.find((p: any) => p.name === "outcome");
    expect(outcome.valueCode).toBe("subsumed-by");
  });

  it("returns 'not-subsumed' for unrelated codes", async () => {
    (repo.searchResources as any).mockResolvedValueOnce({
      resources: [hierarchicalCS],
      total: 1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$subsumes",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://example.org/hierarchy" },
          { name: "codeA", valueCode: "dog" },
          { name: "codeB", valueCode: "plant" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const outcome = body.parameter.find((p: any) => p.name === "outcome");
    expect(outcome.valueCode).toBe("not-subsumed");
  });

  it("returns 400 when codeA or codeB is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$subsumes",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://example.org/hierarchy" },
          { name: "codeA", valueCode: "dog" },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("GET /CodeSystem/:id/$subsumes works", async () => {
    (repo.readResource as any).mockResolvedValueOnce(hierarchicalCS);

    const res = await app.inject({
      method: "GET",
      url: "/CodeSystem/hierarchy-cs/$subsumes?codeA=mammal&codeB=dog",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const outcome = body.parameter.find((p: any) => p.name === "outcome");
    expect(outcome.valueCode).toBe("subsumes");
  });
});

// =============================================================================
// 5. seedConformanceResources — unit tests (T0.1)
// =============================================================================

describe("T0.1 — seedConformanceResources", () => {
  it("creates resources from a minimal bundle file", async () => {
    const { seedConformanceResources } = await import("../terminology/seed-conformance.js");
    const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { tmpdir } = await import("node:os");

    // Create a temp directory with a minimal bundle
    const tmpDir = resolve(tmpdir(), `medxai-seed-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "ValueSet",
            id: "test-vs-1",
            url: "http://test.org/vs1",
            name: "TestVS1",
            status: "active",
          },
        },
        {
          resource: {
            resourceType: "CodeSystem",
            id: "test-cs-1",
            url: "http://test.org/cs1",
            name: "TestCS1",
          },
        },
      ],
    };

    writeFileSync(resolve(tmpDir, "valuesets.json"), JSON.stringify(bundle));
    // Create empty files for other expected sources
    writeFileSync(resolve(tmpDir, "v3-codesystems.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "v2-tables.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "profiles-types.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "profiles-resources.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "profiles-others.json"), '{"resourceType":"Bundle","entry":[]}');

    // Mock repo
    const repo = createMockRepo();
    (repo.readResource as any).mockRejectedValue(new Error("Not found"));
    (repo.createResource as any).mockImplementation(async (r: any) => ({
      ...r,
      id: r.id ?? "generated",
      meta: { versionId: "1", lastUpdated: new Date().toISOString() },
    }));

    const result = await seedConformanceResources(repo, {
      specDir: tmpDir,
      resourceTypes: ["ValueSet", "CodeSystem"],
    });

    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.byType["ValueSet"]?.created).toBe(1);
    expect(result.byType["CodeSystem"]?.created).toBe(1);

    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("skips existing resources", async () => {
    const { seedConformanceResources } = await import("../terminology/seed-conformance.js");
    const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const tmpDir = resolve(tmpdir(), `medxai-seed-skip-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "ValueSet",
            id: "existing-vs",
            url: "http://test.org/existing",
          },
        },
      ],
    };

    writeFileSync(resolve(tmpDir, "valuesets.json"), JSON.stringify(bundle));
    writeFileSync(resolve(tmpDir, "v3-codesystems.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "v2-tables.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "profiles-types.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "profiles-resources.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "profiles-others.json"), '{"resourceType":"Bundle","entry":[]}');

    const repo = createMockRepo();
    // readResource succeeds → resource exists
    (repo.readResource as any).mockResolvedValue({ resourceType: "ValueSet", id: "existing-vs" });

    const result = await seedConformanceResources(repo, {
      specDir: tmpDir,
      resourceTypes: ["ValueSet"],
      skipExisting: true,
    });

    expect(result.created).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(repo.createResource).not.toHaveBeenCalled();

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("deduplicates resources with same id", async () => {
    const { seedConformanceResources } = await import("../terminology/seed-conformance.js");
    const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const tmpDir = resolve(tmpdir(), `medxai-seed-dedup-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    // Same CS id in both valuesets.json and v3-codesystems.json
    const bundle1 = {
      resourceType: "Bundle",
      entry: [{ resource: { resourceType: "CodeSystem", id: "dup-cs", url: "http://old" } }],
    };
    const bundle2 = {
      resourceType: "Bundle",
      entry: [{ resource: { resourceType: "CodeSystem", id: "dup-cs", url: "http://new" } }],
    };

    writeFileSync(resolve(tmpDir, "valuesets.json"), JSON.stringify(bundle1));
    writeFileSync(resolve(tmpDir, "v3-codesystems.json"), JSON.stringify(bundle2));
    writeFileSync(resolve(tmpDir, "v2-tables.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "profiles-types.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "profiles-resources.json"), '{"resourceType":"Bundle","entry":[]}');
    writeFileSync(resolve(tmpDir, "profiles-others.json"), '{"resourceType":"Bundle","entry":[]}');

    const repo = createMockRepo();
    (repo.readResource as any).mockRejectedValue(new Error("Not found"));
    (repo.createResource as any).mockImplementation(async (r: any) => ({
      ...r,
      meta: { versionId: "1", lastUpdated: new Date().toISOString() },
    }));

    const result = await seedConformanceResources(repo, {
      specDir: tmpDir,
      resourceTypes: ["CodeSystem"],
    });

    // Should only create 1 (the later one wins)
    expect(result.created).toBe(1);
    expect(result.total).toBe(2);
    // The created resource should have the "new" url (later override)
    const call = (repo.createResource as any).mock.calls[0][0];
    expect(call.url).toBe("http://new");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

