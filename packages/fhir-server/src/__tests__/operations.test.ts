/**
 * Operation Layer — Unit Tests (OPS-01 to OPS-04)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerRequestContext } from "../middleware/context.js";
import { handleValidate } from "../operation/validate-operation.js";
import { handleExpand } from "../operation/expand-operation.js";
import { handleLookup } from "../operation/lookup-operation.js";
import { handleValidateCode } from "../operation/validate-code-operation.js";
import type { FhirEngine } from "../types/engine.js";

function createMockEngine(overrides?: Record<string, any>): FhirEngine {
  return {
    persistence: { createResource: vi.fn(), readResource: vi.fn(), updateResource: vi.fn(), deleteResource: vi.fn(), readHistory: vi.fn(), readVersion: vi.fn(), searchResources: vi.fn(), processBundle: vi.fn() },
    runtime: {
      validate: vi.fn().mockResolvedValue({ valid: true }),
      evalFhirPath: vi.fn(),
      generateCapabilityStatement: vi.fn(),
      ...overrides,
    },
    definitions: { getStructureDefinition: vi.fn(), getValueSet: vi.fn().mockReturnValue({ url: "http://hl7.org/fhir/ValueSet/test" }), getResourceTypes: vi.fn().mockReturnValue([]) },
    stop: vi.fn(),
  } as unknown as FhirEngine;
}

let app: FastifyInstance;
afterEach(async () => { if (app) await app.close(); });

// =============================================================================
// $validate (OPS-01)
// =============================================================================

describe("$validate", () => {
  async function buildApp(engine?: FhirEngine) {
    const e = engine ?? createMockEngine();
    app = Fastify({ logger: false });
    registerRequestContext(app);
    app.post("/$validate", async (req, reply) => handleValidate(e, req, reply));
    app.post("/:resourceType/$validate", async (req, reply) => {
      const { resourceType } = req.params as { resourceType: string };
      await handleValidate(e, req, reply, resourceType);
    });
    await app.ready();
    return e;
  }

  it("returns 200 for valid resource", async () => {
    await buildApp();
    const res = await app.inject({ method: "POST", url: "/$validate", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).issue[0].severity).toBe("information");
  });

  it("returns validation errors from engine", async () => {
    const e = createMockEngine({ validate: vi.fn().mockResolvedValue({ valid: false, outcome: { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "invalid", diagnostics: "Name required" }] } }) });
    await buildApp(e);
    const res = await app.inject({ method: "POST", url: "/$validate", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).issue[0].diagnostics).toBe("Name required");
  });

  it("returns 400 for missing body", async () => {
    await buildApp();
    const res = await app.inject({ method: "POST", url: "/$validate" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for type mismatch", async () => {
    await buildApp();
    const res = await app.inject({ method: "POST", url: "/Observation/$validate", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).issue[0].diagnostics).toContain("does not match");
  });

  it("passes profile param to engine", async () => {
    const e = await buildApp();
    await app.inject({ method: "POST", url: "/$validate?profile=http://example.com/profile", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(e.runtime.validate).toHaveBeenCalledWith(expect.any(Object), "http://example.com/profile");
  });

  it("500 on engine error", async () => {
    const e = createMockEngine({ validate: vi.fn().mockRejectedValue(new Error("engine crash")) });
    await buildApp(e);
    const res = await app.inject({ method: "POST", url: "/$validate", headers: { "content-type": "application/fhir+json" }, payload: JSON.stringify({ resourceType: "Patient" }) });
    expect(res.statusCode).toBe(500);
  });
});

// =============================================================================
// $expand (OPS-02)
// =============================================================================

describe("$expand", () => {
  async function buildApp(engine?: FhirEngine) {
    const e = engine ?? createMockEngine();
    app = Fastify({ logger: false });
    app.get("/ValueSet/$expand", async (req, reply) => handleExpand(e, req, reply));
    app.get("/ValueSet/:id/$expand", async (req, reply) => {
      const { id } = req.params as { id: string };
      await handleExpand(e, req, reply, id);
    });
    await app.ready();
    return e;
  }

  it("returns ValueSet expansion for url param", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/test" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("ValueSet");
    expect(body.expansion).toBeDefined();
  });

  it("returns 400 for missing url", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/ValueSet/$expand" });
    expect(res.statusCode).toBe(400);
  });

  it("resolves ValueSet by id", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/ValueSet/test-vs/$expand" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for unknown ValueSet id", async () => {
    const e = createMockEngine();
    (e.definitions.getValueSet as any).mockReturnValue(undefined);
    await buildApp(e);
    const res = await app.inject({ method: "GET", url: "/ValueSet/unknown/$expand" });
    expect(res.statusCode).toBe(404);
  });

  it("includes filter in expansion params", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/ValueSet/$expand?url=http://example.com&filter=abc" });
    const body = JSON.parse(res.body);
    expect(body.expansion.parameter).toBeDefined();
  });
});

// =============================================================================
// $lookup (OPS-03)
// =============================================================================

describe("$lookup", () => {
  async function buildApp() {
    const e = createMockEngine();
    app = Fastify({ logger: false });
    app.get("/CodeSystem/$lookup", async (req, reply) => handleLookup(e, req, reply));
    await app.ready();
  }

  it("returns Parameters for valid code", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/CodeSystem/$lookup?code=ABC" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).resourceType).toBe("Parameters");
  });

  it("includes system when provided", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/CodeSystem/$lookup?code=ABC&system=http://example.com" });
    const body = JSON.parse(res.body);
    const systemParam = body.parameter.find((p: any) => p.name === "system");
    expect(systemParam.valueUri).toBe("http://example.com");
  });

  it("returns 400 for missing code", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/CodeSystem/$lookup" });
    expect(res.statusCode).toBe(400);
  });

  it("returns display for code", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/CodeSystem/$lookup?code=XYZ" });
    const body = JSON.parse(res.body);
    const display = body.parameter.find((p: any) => p.name === "display");
    expect(display.valueString).toBe("XYZ");
  });

  it("FHIR JSON content type", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/CodeSystem/$lookup?code=A" });
    expect(res.headers["content-type"]).toContain("application/fhir+json");
  });
});

// =============================================================================
// $validate-code (OPS-04)
// =============================================================================

describe("$validate-code", () => {
  async function buildApp() {
    const e = createMockEngine();
    app = Fastify({ logger: false });
    app.get("/ValueSet/$validate-code", async (req, reply) => handleValidateCode(e, req, reply));
    await app.ready();
  }

  it("returns Parameters with result=true", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/ValueSet/$validate-code?code=ABC" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Parameters");
    const result = body.parameter.find((p: any) => p.name === "result");
    expect(result.valueBoolean).toBe(true);
  });

  it("returns 400 for missing code", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/ValueSet/$validate-code" });
    expect(res.statusCode).toBe(400);
  });

  it("includes system when provided", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/ValueSet/$validate-code?code=A&system=http://snomed.info" });
    const body = JSON.parse(res.body);
    const sys = body.parameter.find((p: any) => p.name === "system");
    expect(sys.valueUri).toBe("http://snomed.info");
  });

  it("includes url when provided", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/ValueSet/$validate-code?code=A&url=http://example.com/vs" });
    const body = JSON.parse(res.body);
    const urlParam = body.parameter.find((p: any) => p.name === "url");
    expect(urlParam.valueUri).toBe("http://example.com/vs");
  });

  it("FHIR JSON content type", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/ValueSet/$validate-code?code=A" });
    expect(res.headers["content-type"]).toContain("application/fhir+json");
  });
});
