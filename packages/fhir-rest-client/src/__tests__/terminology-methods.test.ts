/**
 * fhir-client — Terminology & Conformance Helper Methods Tests (T0.5, T0.6)
 */

import { describe, it, expect, vi } from "vitest";
import { MedXAIClient } from "../client.js";

// =============================================================================
// Helper
// =============================================================================

function mockClient(handler: (url: string, init?: RequestInit) => Response): MedXAIClient {
  const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    return handler(url, init);
  });
  return new MedXAIClient({
    baseUrl: "http://localhost:8080",
    fetchImpl: mockFetch as any,
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/fhir+json" },
  });
}

// =============================================================================
// 1. expandValueSet
// =============================================================================

describe("expandValueSet", () => {
  it("POST by url", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const client = mockClient((url, init) => {
      capturedUrl = url;
      capturedBody = (init?.body as string) ?? "";
      return jsonResponse({ resourceType: "ValueSet", expansion: { contains: [] } });
    });

    await client.expandValueSet({ url: "http://hl7.org/fhir/ValueSet/gender" });

    expect(capturedUrl).toBe("http://localhost:8080/ValueSet/$expand");
    const parsed = JSON.parse(capturedBody);
    expect(parsed.resourceType).toBe("Parameters");
    expect(parsed.parameter[0].name).toBe("url");
    expect(parsed.parameter[0].valueUri).toBe("http://hl7.org/fhir/ValueSet/gender");
  });

  it("GET by id with filter and displayLanguage", async () => {
    let capturedUrl = "";
    const client = mockClient((url) => {
      capturedUrl = url;
      return jsonResponse({ resourceType: "ValueSet", expansion: { contains: [] } });
    });

    await client.expandValueSet({ id: "my-vs", filter: "mal", displayLanguage: "zh-CN" });

    expect(capturedUrl).toContain("/ValueSet/my-vs/$expand");
    expect(capturedUrl).toContain("filter=mal");
    expect(capturedUrl).toContain("displayLanguage=zh-CN");
  });

  it("POST with count and offset", async () => {
    let capturedBody = "";
    const client = mockClient((_url, init) => {
      capturedBody = (init?.body as string) ?? "";
      return jsonResponse({ resourceType: "ValueSet", expansion: { contains: [] } });
    });

    await client.expandValueSet({ url: "http://test.org/vs", count: 10, offset: 20 });

    const parsed = JSON.parse(capturedBody);
    const countParam = parsed.parameter.find((p: any) => p.name === "count");
    const offsetParam = parsed.parameter.find((p: any) => p.name === "offset");
    expect(countParam.valueInteger).toBe(10);
    expect(offsetParam.valueInteger).toBe(20);
  });
});

// =============================================================================
// 2. lookupCode
// =============================================================================

describe("lookupCode", () => {
  it("POST by system + code", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const client = mockClient((url, init) => {
      capturedUrl = url;
      capturedBody = (init?.body as string) ?? "";
      return jsonResponse({
        resourceType: "Parameters",
        parameter: [{ name: "name", valueString: "Test" }],
      });
    });

    await client.lookupCode({ system: "http://loinc.org", code: "12345-6" });

    expect(capturedUrl).toBe("http://localhost:8080/CodeSystem/$lookup");
    const parsed = JSON.parse(capturedBody);
    expect(parsed.parameter).toHaveLength(2);
    expect(parsed.parameter[0].valueUri).toBe("http://loinc.org");
    expect(parsed.parameter[1].valueCode).toBe("12345-6");
  });

  it("GET by id + code", async () => {
    let capturedUrl = "";
    const client = mockClient((url) => {
      capturedUrl = url;
      return jsonResponse({
        resourceType: "Parameters",
        parameter: [{ name: "name", valueString: "Test" }],
      });
    });

    await client.lookupCode({ id: "my-cs", code: "abc" });

    expect(capturedUrl).toContain("/CodeSystem/my-cs/$lookup");
    expect(capturedUrl).toContain("code=abc");
  });
});

// =============================================================================
// 3. validateCode
// =============================================================================

describe("validateCode", () => {
  it("POST against CodeSystem (default)", async () => {
    let capturedUrl = "";
    const client = mockClient((url) => {
      capturedUrl = url;
      return jsonResponse({
        resourceType: "Parameters",
        parameter: [{ name: "result", valueBoolean: true }],
      });
    });

    await client.validateCode({ system: "http://loinc.org", code: "12345-6" });

    expect(capturedUrl).toBe("http://localhost:8080/CodeSystem/$validate-code");
  });

  it("POST against ValueSet", async () => {
    let capturedUrl = "";
    const client = mockClient((url) => {
      capturedUrl = url;
      return jsonResponse({
        resourceType: "Parameters",
        parameter: [{ name: "result", valueBoolean: false }],
      });
    });

    await client.validateCode({
      url: "http://hl7.org/fhir/ValueSet/gender",
      code: "unknown",
      resourceType: "ValueSet",
    });

    expect(capturedUrl).toBe("http://localhost:8080/ValueSet/$validate-code");
  });

  it("GET by id", async () => {
    let capturedUrl = "";
    const client = mockClient((url) => {
      capturedUrl = url;
      return jsonResponse({
        resourceType: "Parameters",
        parameter: [{ name: "result", valueBoolean: true }],
      });
    });

    await client.validateCode({ id: "cs-1", code: "male" });

    expect(capturedUrl).toContain("/CodeSystem/cs-1/$validate-code");
    expect(capturedUrl).toContain("code=male");
  });
});

// =============================================================================
// 4. Conformance Helpers
// =============================================================================

describe("Conformance helpers", () => {
  it("getStructureDefinition searches by type", async () => {
    let capturedUrl = "";
    const client = mockClient((url) => {
      capturedUrl = url;
      return jsonResponse({
        resourceType: "Bundle",
        type: "searchset",
        entry: [{ resource: { resourceType: "StructureDefinition", id: "sd-patient" } }],
      });
    });

    const sd = await client.getStructureDefinition("Patient");

    expect(capturedUrl).toContain("StructureDefinition");
    expect(capturedUrl).toContain("type=Patient");
    expect(capturedUrl).toContain("_count=1");
    expect(sd?.resourceType).toBe("StructureDefinition");
  });

  it("getStructureDefinitionByUrl searches by url", async () => {
    let capturedUrl = "";
    const client = mockClient((url) => {
      capturedUrl = url;
      return jsonResponse({
        resourceType: "Bundle",
        type: "searchset",
        entry: [{ resource: { resourceType: "StructureDefinition", id: "sd-1" } }],
      });
    });

    await client.getStructureDefinitionByUrl("http://hl7.org/fhir/StructureDefinition/Patient");

    expect(capturedUrl).toContain("StructureDefinition");
    expect(capturedUrl).toContain("url=");
  });

  it("getValueSet searches by url", async () => {
    let capturedUrl = "";
    const client = mockClient((url) => {
      capturedUrl = url;
      return jsonResponse({
        resourceType: "Bundle",
        type: "searchset",
        entry: [],
      });
    });

    const result = await client.getValueSet("http://hl7.org/fhir/ValueSet/gender");

    expect(capturedUrl).toContain("ValueSet");
    expect(capturedUrl).toContain("url=");
    expect(result).toBeUndefined();
  });

  it("getCodeSystem searches by url", async () => {
    let capturedUrl = "";
    const client = mockClient((url) => {
      capturedUrl = url;
      return jsonResponse({
        resourceType: "Bundle",
        type: "searchset",
        entry: [{ resource: { resourceType: "CodeSystem", id: "cs-1" } }],
      });
    });

    const cs = await client.getCodeSystem("http://hl7.org/fhir/CodeSystem/gender");

    expect(capturedUrl).toContain("CodeSystem");
    expect(cs?.resourceType).toBe("CodeSystem");
  });
});
