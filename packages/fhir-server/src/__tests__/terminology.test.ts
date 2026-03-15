/**
 * Phase K: Terminology Service Tests
 *
 * Tests for:
 * - POST /ValueSet/$expand + GET /ValueSet/:id/$expand
 * - POST /CodeSystem/$validate-code + GET /CodeSystem/:id/$validate-code
 * - POST /CodeSystem/$lookup + GET /CodeSystem/:id/$lookup
 *
 * Uses mock repo with simulated CodeSystem/ValueSet resources.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, createMockRepo, mockPersistedResource } from "./helpers.js";

// =============================================================================
// Mock Data
// =============================================================================

const mockCodeSystem = mockPersistedResource("CodeSystem", {
  id: "cs-gender",
  url: "http://hl7.org/fhir/administrative-gender",
  name: "AdministrativeGender",
  title: "Administrative Gender",
  status: "active",
  content: "complete",
  concept: [
    { code: "male", display: "Male" },
    { code: "female", display: "Female" },
    { code: "other", display: "Other" },
    {
      code: "unknown",
      display: "Unknown",
      property: [
        { code: "status", valueString: "retired" },
      ],
    },
  ],
} as any);

const mockValueSet = mockPersistedResource("ValueSet", {
  id: "vs-gender",
  url: "http://hl7.org/fhir/ValueSet/administrative-gender",
  name: "AdministrativeGender",
  status: "active",
  compose: {
    include: [
      {
        system: "http://hl7.org/fhir/administrative-gender",
        concept: [
          { code: "male", display: "Male" },
          { code: "female", display: "Female" },
          { code: "other", display: "Other" },
        ],
      },
    ],
  },
} as any);

const mockValueSetWithExpansion = mockPersistedResource("ValueSet", {
  id: "vs-expanded",
  url: "http://example.com/ValueSet/expanded",
  name: "ExpandedVS",
  status: "active",
  expansion: {
    timestamp: "2026-01-01T00:00:00Z",
    total: 2,
    contains: [
      { system: "http://example.com/cs", code: "A", display: "Alpha" },
      { system: "http://example.com/cs", code: "B", display: "Beta" },
    ],
  },
} as any);

// =============================================================================
// Test Setup
// =============================================================================

let app: FastifyInstance;
let mockRepo: ReturnType<typeof createMockRepo>;

beforeEach(async () => {
  mockRepo = createMockRepo();

  // Setup readResource to return mock resources by type+id
  (mockRepo.readResource as any).mockImplementation(async (type: string, id: string) => {
    if (type === "CodeSystem" && id === "cs-gender") return mockCodeSystem;
    if (type === "ValueSet" && id === "vs-gender") return mockValueSet;
    if (type === "ValueSet" && id === "vs-expanded") return mockValueSetWithExpansion;
    const err = new Error(`Not found: ${type}/${id}`);
    (err as any).name = "ResourceNotFoundError";
    throw err;
  });

  // Setup searchResources to return mock resources by URL filter
  (mockRepo.searchResources as any).mockImplementation(async (request: any) => {
    const urlFilter = request.params?.find?.((p: any) => p.code === "url");
    const url = urlFilter?.values?.[0];

    if (request.resourceType === "CodeSystem" && url === "http://hl7.org/fhir/administrative-gender") {
      return { resources: [mockCodeSystem] };
    }
    if (request.resourceType === "ValueSet" && url === "http://hl7.org/fhir/ValueSet/administrative-gender") {
      return { resources: [mockValueSet] };
    }
    return { resources: [] };
  });

  app = await createTestApp(mockRepo);
});

afterEach(async () => {
  await app.close();
});

// =============================================================================
// Section 1: ValueSet/$expand
// =============================================================================

describe("ValueSet/$expand", () => {
  it("GET /ValueSet/:id/$expand returns expanded ValueSet", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/vs-gender/$expand",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("ValueSet");
    expect(body.expansion.total).toBe(3);
    expect(body.expansion.contains).toHaveLength(3);
    expect(body.expansion.contains[0].code).toBe("male");
  });

  it("GET /ValueSet/:id/$expand with filter narrows results", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/vs-gender/$expand?filter=fem",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.total).toBe(1);
    expect(body.expansion.contains[0].code).toBe("female");
  });

  it("GET /ValueSet/:id/$expand with pre-expanded ValueSet", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/vs-expanded/$expand",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.total).toBe(2);
    expect(body.expansion.contains[0].code).toBe("A");
  });

  it("POST /ValueSet/$expand by url parameter", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ValueSet/$expand",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "url", valueUri: "http://hl7.org/fhir/ValueSet/administrative-gender" },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expansion.total).toBe(3);
  });

  it("POST /ValueSet/$expand returns 400 without url", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ValueSet/$expand",
      headers: { "content-type": "application/fhir+json" },
      payload: { resourceType: "Parameters", parameter: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /ValueSet/:id/$expand returns 404 for missing ValueSet", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ValueSet/nonexistent/$expand",
    });
    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// Section 2: CodeSystem/$validate-code
// =============================================================================

describe("CodeSystem/$validate-code", () => {
  it("GET /CodeSystem/:id/$validate-code returns true for valid code", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/CodeSystem/cs-gender/$validate-code?code=male",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Parameters");
    const resultParam = body.parameter.find((p: any) => p.name === "result");
    expect(resultParam.valueBoolean).toBe(true);
    const displayParam = body.parameter.find((p: any) => p.name === "display");
    expect(displayParam.valueString).toBe("Male");
  });

  it("GET /CodeSystem/:id/$validate-code returns false for invalid code", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/CodeSystem/cs-gender/$validate-code?code=nonexistent",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const resultParam = body.parameter.find((p: any) => p.name === "result");
    expect(resultParam.valueBoolean).toBe(false);
    const msgParam = body.parameter.find((p: any) => p.name === "message");
    expect(msgParam.valueString).toContain("not found");
  });

  it("POST /CodeSystem/$validate-code by system URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$validate-code",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://hl7.org/fhir/administrative-gender" },
          { name: "code", valueCode: "female" },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const resultParam = body.parameter.find((p: any) => p.name === "result");
    expect(resultParam.valueBoolean).toBe(true);
  });

  it("POST /CodeSystem/$validate-code returns 400 without code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$validate-code",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://hl7.org/fhir/administrative-gender" },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /CodeSystem/:id/$validate-code returns 400 without code", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/CodeSystem/cs-gender/$validate-code",
    });
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// Section 3: CodeSystem/$lookup
// =============================================================================

describe("CodeSystem/$lookup", () => {
  it("GET /CodeSystem/:id/$lookup returns code details", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/CodeSystem/cs-gender/$lookup?code=male",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Parameters");
    const nameParam = body.parameter.find((p: any) => p.name === "name");
    expect(nameParam.valueString).toBe("AdministrativeGender");
    const displayParam = body.parameter.find((p: any) => p.name === "display");
    expect(displayParam.valueString).toBe("Male");
  });

  it("GET /CodeSystem/:id/$lookup returns properties", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/CodeSystem/cs-gender/$lookup?code=unknown",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const propParam = body.parameter.find((p: any) => p.name === "property");
    expect(propParam).toBeDefined();
    expect(propParam.part[0].valueCode).toBe("status");
  });

  it("GET /CodeSystem/:id/$lookup returns 404 for missing code", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/CodeSystem/cs-gender/$lookup?code=nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /CodeSystem/$lookup by system URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$lookup",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://hl7.org/fhir/administrative-gender" },
          { name: "code", valueCode: "female" },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const displayParam = body.parameter.find((p: any) => p.name === "display");
    expect(displayParam.valueString).toBe("Female");
  });

  it("POST /CodeSystem/$lookup returns 400 without code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$lookup",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://hl7.org/fhir/administrative-gender" },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /CodeSystem/$lookup returns 404 for unknown system", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/CodeSystem/$lookup",
      headers: { "content-type": "application/fhir+json" },
      payload: {
        resourceType: "Parameters",
        parameter: [
          { name: "system", valueUri: "http://example.com/unknown" },
          { name: "code", valueCode: "x" },
        ],
      },
    });
    expect(res.statusCode).toBe(404);
  });
});
