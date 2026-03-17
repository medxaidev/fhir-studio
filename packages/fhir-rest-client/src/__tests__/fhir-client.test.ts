/**
 * FhirClient Main Class Tests (TEST-01 to TEST-09)
 *
 * Uses mock fetchImpl — no real HTTP dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FhirClient } from "../client/fhir-client.js";
import { FhirClientError } from "../errors/errors.js";

// =============================================================================
// Mock fetch helper
// =============================================================================

function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>): typeof fetch {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    const bodyStr = typeof resp.body === "string" ? resp.body : JSON.stringify(resp.body);
    return new Response(bodyStr, {
      status: resp.status,
      headers: { "content-type": "application/fhir+json", ...resp.headers },
    });
  }) as unknown as typeof fetch;
}

function createClient(fetchImpl: typeof fetch) {
  return new FhirClient({
    baseUrl: "http://localhost:8080",
    fetchImpl,
  });
}

// =============================================================================
// CRUD Tests (TEST-01)
// =============================================================================

describe("CRUD operations", () => {
  const patient = { resourceType: "Patient", id: "p-1", meta: { versionId: "1" }, name: [{ family: "Smith" }] };

  it("createResource sends POST and returns created resource", async () => {
    const fetchFn = mockFetch([{ status: 201, body: patient }]);
    const client = createClient(fetchFn);
    const result = await client.createResource("Patient", { resourceType: "Patient", name: [{ family: "Smith" }] });
    expect(result.id).toBe("p-1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("http://localhost:8080/Patient");
    expect(opts.method).toBe("POST");
  });

  it("readResource sends GET and returns resource", async () => {
    const fetchFn = mockFetch([{ status: 200, body: patient }]);
    const client = createClient(fetchFn);
    const result = await client.readResource("Patient", "p-1");
    expect(result.id).toBe("p-1");
    const [url, opts] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("http://localhost:8080/Patient/p-1");
    expect(opts.method).toBe("GET");
  });

  it("updateResource sends PUT and returns updated resource", async () => {
    const updated = { ...patient, meta: { versionId: "2" } };
    const fetchFn = mockFetch([{ status: 200, body: updated }]);
    const client = createClient(fetchFn);
    const result = await client.updateResource("Patient", "p-1", patient as any);
    expect(result.meta?.versionId).toBe("2");
    const [url, opts] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("http://localhost:8080/Patient/p-1");
    expect(opts.method).toBe("PUT");
  });

  it("deleteResource sends DELETE", async () => {
    const fetchFn = mockFetch([{ status: 200, body: { resourceType: "OperationOutcome", issue: [] } }]);
    const client = createClient(fetchFn);
    await client.deleteResource("Patient", "p-1");
    const [url, opts] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("http://localhost:8080/Patient/p-1");
    expect(opts.method).toBe("DELETE");
  });

  it("patchResource sends PATCH with json-patch content type", async () => {
    const fetchFn = mockFetch([{ status: 200, body: patient }]);
    const client = createClient(fetchFn);
    await client.patchResource("Patient", "p-1", [{ op: "replace", path: "/active", value: true }]);
    const [, opts] = (fetchFn as any).mock.calls[0];
    expect(opts.method).toBe("PATCH");
    expect(opts.headers["content-type"]).toBe("application/json-patch+json");
  });

  it("updateResource throws for empty id", async () => {
    const fetchFn = mockFetch([]);
    const client = createClient(fetchFn);
    await expect(client.updateResource("Patient", "", patient as any)).rejects.toThrow("must have an id");
  });

  it("readResource throws FhirClientError on 404", async () => {
    const fetchFn = mockFetch([{
      status: 404,
      body: { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found", diagnostics: "Not found" }] },
    }]);
    const client = createClient(fetchFn);
    await expect(client.readResource("Patient", "missing")).rejects.toThrow();
  });
});

// =============================================================================
// Search Tests (TEST-02)
// =============================================================================

describe("Search operations", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "searchset",
    total: 1,
    entry: [{ resource: { resourceType: "Patient", id: "p-1" } }],
  };

  it("search returns Bundle", async () => {
    const fetchFn = mockFetch([{ status: 200, body: bundle }]);
    const client = createClient(fetchFn);
    const result = await client.search("Patient", { name: "Smith" });
    expect(result.type).toBe("searchset");
    expect(result.entry).toHaveLength(1);
  });

  it("search appends params to URL", async () => {
    const fetchFn = mockFetch([{ status: 200, body: bundle }]);
    const client = createClient(fetchFn);
    await client.search("Patient", { name: "Smith", _count: "10" });
    const [url] = (fetchFn as any).mock.calls[0];
    expect(url).toContain("name=Smith");
    expect(url).toContain("_count=10");
  });

  it("searchResources returns array with bundle property", async () => {
    const fetchFn = mockFetch([{ status: 200, body: bundle }]);
    const client = createClient(fetchFn);
    const result = await client.searchResources("Patient");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p-1");
    expect(result.bundle).toBeDefined();
    expect(result.bundle.type).toBe("searchset");
  });

  it("searchResourcePages yields pages", async () => {
    const page1 = {
      resourceType: "Bundle", type: "searchset",
      entry: [{ resource: { resourceType: "Patient", id: "p-1" } }],
      link: [{ relation: "next", url: "http://localhost:8080/Patient?_page=2" }],
    };
    const page2 = {
      resourceType: "Bundle", type: "searchset",
      entry: [{ resource: { resourceType: "Patient", id: "p-2" } }],
    };
    const fetchFn = mockFetch([{ status: 200, body: page1 }, { status: 200, body: page2 }]);
    const client = createClient(fetchFn);

    const pages: any[] = [];
    for await (const page of client.searchResourcePages("Patient")) {
      pages.push(page);
    }
    expect(pages).toHaveLength(2);
    expect(pages[0][0].id).toBe("p-1");
    expect(pages[1][0].id).toBe("p-2");
  });

  it("search handles array params", async () => {
    const fetchFn = mockFetch([{ status: 200, body: bundle }]);
    const client = createClient(fetchFn);
    await client.search("Patient", { status: ["active", "inactive"] });
    const [url] = (fetchFn as any).mock.calls[0];
    expect(url).toContain("status=active");
    expect(url).toContain("status=inactive");
  });
});

// =============================================================================
// Cache Tests (TEST-03)
// =============================================================================

describe("Cache behavior", () => {
  it("readResource caches on second call", async () => {
    const patient = { resourceType: "Patient", id: "p-1" };
    const fetchFn = mockFetch([{ status: 200, body: patient }]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      cache: { ttl: 60000 },
    });

    await client.readResource("Patient", "p-1");
    await client.readResource("Patient", "p-1");
    // Only one fetch call — second was cached
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("no-cache option bypasses cache", async () => {
    const patient = { resourceType: "Patient", id: "p-1" };
    const fetchFn = mockFetch([{ status: 200, body: patient }, { status: 200, body: patient }]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      cache: { ttl: 60000 },
    });

    await client.readResource("Patient", "p-1");
    await client.readResource("Patient", "p-1", { cache: "no-cache" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("invalidateAll clears cache", async () => {
    const patient = { resourceType: "Patient", id: "p-1" };
    const fetchFn = mockFetch([{ status: 200, body: patient }, { status: 200, body: patient }]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      cache: { ttl: 60000 },
    });

    await client.readResource("Patient", "p-1");
    client.invalidateAll();
    await client.readResource("Patient", "p-1");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("getCached returns undefined for uncached", () => {
    const client = createClient(mockFetch([]));
    expect(client.getCached("Patient", "p-1")).toBeUndefined();
  });

  it("cache disabled with maxSize=0", async () => {
    const patient = { resourceType: "Patient", id: "p-1" };
    const fetchFn = mockFetch([{ status: 200, body: patient }, { status: 200, body: patient }]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      cache: { maxSize: 0 },
    });

    await client.readResource("Patient", "p-1");
    await client.readResource("Patient", "p-1");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Auth Tests (TEST-04)
// =============================================================================

describe("Auth", () => {
  it("bearer auth sets access token", () => {
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: mockFetch([]),
      auth: { credentials: { type: "bearer", accessToken: "test-token" } },
    });
    expect(client.getAccessToken()).toBe("test-token");
  });

  it("Authorization header is sent", async () => {
    const fetchFn = mockFetch([{ status: 200, body: { resourceType: "Patient", id: "1" } }]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      auth: { credentials: { type: "bearer", accessToken: "my-token" } },
    });
    await client.readResource("Patient", "1");
    const [, opts] = (fetchFn as any).mock.calls[0];
    expect(opts.headers.authorization).toBe("Bearer my-token");
  });

  it("signOut clears tokens", () => {
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: mockFetch([]),
      auth: { credentials: { type: "bearer", accessToken: "tok" } },
    });
    expect(client.getAccessToken()).toBe("tok");
    client.signOut();
    expect(client.getAccessToken()).toBeUndefined();
  });

  it("password signIn calls /auth/login then /oauth2/token", async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { login: "L1", code: "CODE123" } },
      { status: 200, body: { token_type: "Bearer", access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "openid" } },
    ]);
    const client = createClient(fetchFn);
    const state = await client.signIn({ type: "password", email: "a@b.com", password: "pass" });
    expect(state.accessToken).toBe("at");
    expect(state.refreshToken).toBe("rt");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("client_credentials signIn", async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { token_type: "Bearer", access_token: "at2", expires_in: 3600, scope: "system" } },
    ]);
    const client = createClient(fetchFn);
    const state = await client.signIn({
      type: "client",
      clientId: "cid",
      clientSecret: "csec",
      tokenUrl: "http://localhost:8080/oauth2/token",
    });
    expect(state.accessToken).toBe("at2");
  });

  it("onUnauthenticated called on permanent 401", async () => {
    const onUnauth = vi.fn();
    const fetchFn = mockFetch([{ status: 401, body: { error: "unauthorized" } }]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      onUnauthenticated: onUnauth,
    });
    await expect(client.readResource("Patient", "1")).rejects.toThrow();
    expect(onUnauth).toHaveBeenCalled();
  });
});

// =============================================================================
// Retry Tests (TEST-05)
// =============================================================================

describe("Retry", () => {
  it("retries on 429", async () => {
    const fetchFn = mockFetch([
      { status: 429, body: {} },
      { status: 200, body: { resourceType: "Patient", id: "p-1" } },
    ]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      retry: { maxRetries: 2, baseDelay: 10, maxDelay: 50 },
    });
    const result = await client.readResource("Patient", "p-1");
    expect(result.id).toBe("p-1");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries on 500", async () => {
    const fetchFn = mockFetch([
      { status: 500, body: {} },
      { status: 200, body: { resourceType: "Patient", id: "p-1" } },
    ]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      retry: { maxRetries: 2, baseDelay: 10, maxDelay: 50 },
    });
    const result = await client.readResource("Patient", "p-1");
    expect(result.id).toBe("p-1");
  });

  it("does NOT retry on 404", async () => {
    const fetchFn = mockFetch([
      { status: 404, body: { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found" }] } },
    ]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      retry: { maxRetries: 3, baseDelay: 10 },
    });
    await expect(client.readResource("Patient", "missing")).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws after maxRetries exceeded", async () => {
    const fetchFn = mockFetch([
      { status: 503, body: {} },
      { status: 503, body: {} },
      { status: 503, body: {} },
    ]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      retry: { maxRetries: 2, baseDelay: 10, maxDelay: 20 },
    });
    await expect(client.readResource("Patient", "p-1")).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("no retry when success", async () => {
    const fetchFn = mockFetch([{ status: 200, body: { resourceType: "Patient", id: "p-1" } }]);
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchFn,
      retry: { maxRetries: 3, baseDelay: 10 },
    });
    await client.readResource("Patient", "p-1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// History Tests
// =============================================================================

describe("History", () => {
  it("readHistory returns Bundle", async () => {
    const histBundle = { resourceType: "Bundle", type: "history", entry: [] };
    const fetchFn = mockFetch([{ status: 200, body: histBundle }]);
    const client = createClient(fetchFn);
    const result = await client.readHistory("Patient", "p-1");
    expect(result.type).toBe("history");
    const [url] = (fetchFn as any).mock.calls[0];
    expect(url).toContain("Patient/p-1/_history");
  });

  it("readVersion returns specific version", async () => {
    const patient = { resourceType: "Patient", id: "p-1", meta: { versionId: "2" } };
    const fetchFn = mockFetch([{ status: 200, body: patient }]);
    const client = createClient(fetchFn);
    const result = await client.readVersion("Patient", "p-1", "2");
    expect(result.meta?.versionId).toBe("2");
    const [url] = (fetchFn as any).mock.calls[0];
    expect(url).toContain("Patient/p-1/_history/2");
  });
});

// =============================================================================
// Operation / Batch Tests (TEST-08)
// =============================================================================

describe("Operations and Batch", () => {
  it("executeBatch sends POST to base URL", async () => {
    const respBundle = { resourceType: "Bundle", type: "batch-response", entry: [] };
    const fetchFn = mockFetch([{ status: 200, body: respBundle }]);
    const client = createClient(fetchFn);
    const result = await client.executeBatch({
      resourceType: "Bundle", type: "batch",
      entry: [{ request: { method: "GET", url: "Patient/1" } }],
    });
    expect(result.type).toBe("batch-response");
    const [url, opts] = (fetchFn as any).mock.calls[0];
    expect(url).toBe("http://localhost:8080");
    expect(opts.method).toBe("POST");
  });

  it("validateResource sends POST to $validate", async () => {
    const oo = { resourceType: "OperationOutcome", issue: [{ severity: "information", code: "informational" }] };
    const fetchFn = mockFetch([{ status: 200, body: oo }]);
    const client = createClient(fetchFn);
    const result = await client.validateResource({ resourceType: "Patient" });
    expect(result.issue[0].severity).toBe("information");
    const [url] = (fetchFn as any).mock.calls[0];
    expect(url).toContain("Patient/$validate");
  });

  it("getCapabilities returns CapabilityStatement", async () => {
    const cs = { resourceType: "CapabilityStatement", status: "active", fhirVersion: "4.0.1" };
    const fetchFn = mockFetch([{ status: 200, body: cs }]);
    const client = createClient(fetchFn);
    const result = await client.getCapabilities();
    expect(result.status).toBe("active");
    const [url] = (fetchFn as any).mock.calls[0];
    expect(url).toContain("/metadata");
  });

  it("operation sends GET for no params", async () => {
    const fetchFn = mockFetch([{ status: 200, body: { resourceType: "Parameters" } }]);
    const client = createClient(fetchFn);
    await client.operation("Patient/1/$everything");
    const [, opts] = (fetchFn as any).mock.calls[0];
    expect(opts.method).toBe("GET");
  });

  it("operation sends POST with params body", async () => {
    const fetchFn = mockFetch([{ status: 200, body: { resourceType: "Parameters" } }]);
    const client = createClient(fetchFn);
    await client.operation("ValueSet/$expand", { resourceType: "Parameters" });
    const [, opts] = (fetchFn as any).mock.calls[0];
    expect(opts.method).toBe("POST");
  });
});

// =============================================================================
// buildSearchParams (utility)
// =============================================================================

describe("buildSearchParams", () => {
  it("returns a SearchParamsBuilder instance", () => {
    const client = createClient(mockFetch([]));
    const builder = client.buildSearchParams();
    expect(builder).toBeDefined();
    expect(typeof builder.where).toBe("function");
    expect(typeof builder.build).toBe("function");
  });
});
