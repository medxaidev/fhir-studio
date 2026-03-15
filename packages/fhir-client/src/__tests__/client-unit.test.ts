/**
 * MedXAIClient Unit Tests — G3 Features
 *
 * Tests new client methods using a mock fetch implementation.
 * Covers: patchResource, searchOne, searchResources, executeBatch,
 * readReference, createResourceIfNoneExist, upsertResource,
 * searchResourcePages, validateResource, readPatientEverything,
 * startClientLogin, setBasicAuth, LRU cache, auto-retry, token refresh,
 * 401 retry, cache invalidation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MedXAIClient } from "../client.js";
import { FhirClientError } from "../types.js";
import type {
  FhirResource,
  Bundle,
  PatchOperation,
  ResourceArray,
} from "../types.js";

// =============================================================================
// Mock helpers
// =============================================================================

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : `Error ${status}`,
    headers: { "content-type": "application/fhir+json" },
  });
}

function mockPatient(id = "p-1"): FhirResource {
  return {
    resourceType: "Patient",
    id,
    meta: { versionId: "v1", lastUpdated: "2026-01-01T00:00:00Z" },
    name: [{ family: "Test" }],
  };
}

function mockBundle<T extends FhirResource>(
  resources: T[],
  nextUrl?: string,
): Bundle<T> {
  return {
    resourceType: "Bundle",
    type: "searchset",
    total: resources.length,
    entry: resources.map((r) => ({ resource: r })),
    link: [
      { relation: "self", url: "http://test/Patient" },
      ...(nextUrl ? [{ relation: "next", url: nextUrl }] : []),
    ],
  };
}

// =============================================================================
// Section 1: patchResource
// =============================================================================

describe("patchResource", () => {
  it("sends PATCH with application/json-patch+json content type", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(mockPatient()));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    const ops: PatchOperation[] = [
      { op: "replace", path: "/name/0/family", value: "Patched" },
    ];
    await client.patchResource("Patient", "p-1", ops);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test/Patient/p-1");
    expect(init.method).toBe("PATCH");
    expect(init.headers["content-type"]).toBe("application/json-patch+json");
    expect(JSON.parse(init.body)).toEqual(ops);
  });

  it("returns the patched resource", async () => {
    const patched = { ...mockPatient(), name: [{ family: "Patched" }] };
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(patched)),
    });

    const result = await client.patchResource("Patient", "p-1", [
      { op: "replace", path: "/name/0/family", value: "Patched" },
    ]);
    expect((result as any).name[0].family).toBe("Patched");
  });
});

// =============================================================================
// Section 2: searchOne
// =============================================================================

describe("searchOne", () => {
  it("returns first matching resource", async () => {
    const bundle = mockBundle([mockPatient()]);
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(bundle)),
    });

    const result = await client.searchOne("Patient", { name: "Test" });
    expect(result).toBeDefined();
    expect(result!.id).toBe("p-1");
  });

  it("returns undefined when no matches", async () => {
    const bundle = mockBundle([]);
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(bundle)),
    });

    const result = await client.searchOne("Patient", { name: "None" });
    expect(result).toBeUndefined();
  });

  it("sets _count=1 in the request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(mockBundle([])));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    await client.searchOne("Patient", { name: "Test" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("_count=1");
  });
});

// =============================================================================
// Section 3: searchResources
// =============================================================================

describe("searchResources", () => {
  it("returns a ResourceArray with bundle property", async () => {
    const bundle = mockBundle([mockPatient("a"), mockPatient("b")]);
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(bundle)),
    });

    const result = await client.searchResources("Patient");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
    expect(result.bundle).toBeDefined();
    expect(result.bundle.resourceType).toBe("Bundle");
    expect(result.bundle.total).toBe(2);
  });

  it("returns empty array for no results", async () => {
    const bundle = mockBundle([]);
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(bundle)),
    });

    const result = await client.searchResources("Patient");
    expect(result).toHaveLength(0);
    expect(result.bundle).toBeDefined();
  });
});

// =============================================================================
// Section 4: executeBatch
// =============================================================================

describe("executeBatch", () => {
  it("sends a batch Bundle to the base URL", async () => {
    const responseBundle: Bundle = {
      resourceType: "Bundle",
      type: "batch-response",
      entry: [{ response: { status: "201 Created" } }],
    };
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(responseBundle));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    const inputBundle: Bundle = {
      resourceType: "Bundle",
      type: "batch",
      entry: [
        {
          request: { method: "POST", url: "Patient" },
          resource: { resourceType: "Patient", name: [{ family: "Batch" }] },
        },
      ],
    };

    const result = await client.executeBatch(inputBundle);
    expect(result.type).toBe("batch-response");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test");
    expect(init.method).toBe("POST");
  });

  it("sends a transaction Bundle", async () => {
    const responseBundle: Bundle = {
      resourceType: "Bundle",
      type: "transaction-response",
      entry: [],
    };
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(responseBundle)),
    });

    const result = await client.executeBatch({
      resourceType: "Bundle",
      type: "transaction",
      entry: [],
    });
    expect(result.type).toBe("transaction-response");
  });
});

// =============================================================================
// Section 5: readReference
// =============================================================================

describe("readReference", () => {
  it("reads a resource by reference string", async () => {
    const patient = mockPatient();
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(patient)),
    });

    const result = await client.readReference("Patient/p-1");
    expect(result.id).toBe("p-1");
  });
});

// =============================================================================
// Section 6: createResourceIfNoneExist
// =============================================================================

describe("createResourceIfNoneExist", () => {
  it("sends If-None-Exist header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(mockPatient()));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    await client.createResourceIfNoneExist(
      { resourceType: "Patient", name: [{ family: "Cond" }] },
      "name=Cond",
    );

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["if-none-exist"]).toBe("name=Cond");
  });
});

// =============================================================================
// Section 7: upsertResource
// =============================================================================

describe("upsertResource", () => {
  it("sends PUT with query string", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(mockPatient()));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    await client.upsertResource(
      { resourceType: "Patient", name: [{ family: "Upsert" }] },
      "name=Upsert",
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test/Patient?name=Upsert");
    expect(init.method).toBe("PUT");
  });
});

// =============================================================================
// Section 8: validateResource
// =============================================================================

describe("validateResource", () => {
  it("sends POST to $validate endpoint", async () => {
    const outcome = {
      resourceType: "OperationOutcome",
      issue: [{ severity: "information", code: "informational", diagnostics: "OK" }],
    };
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(outcome));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    const result = await client.validateResource({
      resourceType: "Patient",
      name: [{ family: "Valid" }],
    });
    expect(result.resourceType).toBe("OperationOutcome");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test/Patient/$validate");
  });
});

// =============================================================================
// Section 9: readPatientEverything
// =============================================================================

describe("readPatientEverything", () => {
  it("sends GET to Patient/$everything", async () => {
    const bundle: Bundle = { resourceType: "Bundle", type: "searchset", entry: [] };
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(bundle));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    await client.readPatientEverything("p-1");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test/Patient/p-1/$everything");
  });
});

// =============================================================================
// Section 10: searchResourcePages
// =============================================================================

describe("searchResourcePages", () => {
  it("yields multiple pages following next links", async () => {
    const page1 = mockBundle([mockPatient("a")], "http://test/Patient?_page=2");
    const page2 = mockBundle([mockPatient("b")]);

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));

    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    const pages: ResourceArray<FhirResource>[] = [];
    for await (const page of client.searchResourcePages("Patient")) {
      pages.push(page);
    }

    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(1);
    expect(pages[0][0].id).toBe("a");
    expect(pages[1]).toHaveLength(1);
    expect(pages[1][0].id).toBe("b");
  });

  it("yields single page when no next link", async () => {
    const page = mockBundle([mockPatient("x")]);
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(page)),
    });

    const pages: ResourceArray<FhirResource>[] = [];
    for await (const p of client.searchResourcePages("Patient")) {
      pages.push(p);
    }

    expect(pages).toHaveLength(1);
  });
});

// =============================================================================
// Section 11: startClientLogin
// =============================================================================

describe("startClientLogin", () => {
  it("exchanges client credentials for tokens", async () => {
    const tokenResponse = {
      access_token: "at-123",
      refresh_token: "rt-456",
      expires_in: 3600,
      project: { reference: "Project/proj-1" },
    };
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(tokenResponse));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    const result = await client.startClientLogin("client-id", "client-secret");

    expect(result.accessToken).toBe("at-123");
    expect(result.refreshToken).toBe("rt-456");
    expect(result.expiresIn).toBe(3600);
    expect(client.getAccessToken()).toBe("at-123");
    expect(client.getRefreshToken()).toBe("rt-456");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test/oauth2/token");
    expect(init.method).toBe("POST");
    expect(init.body).toContain("grant_type=client_credentials");
    expect(init.body).toContain("client_id=client-id");
  });
});

// =============================================================================
// Section 12: setBasicAuth
// =============================================================================

describe("setBasicAuth", () => {
  it("sets Basic auth header on subsequent requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(mockPatient()));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    client.setBasicAuth("user", "pass");
    await client.readResource("Patient", "p-1");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["authorization"]).toBe(`Basic ${btoa("user:pass")}`);
  });

  it("prefers Bearer token over Basic auth", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(mockPatient()));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "bearer-token",
    });

    client.setBasicAuth("user", "pass");
    await client.readResource("Patient", "p-1");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["authorization"]).toBe("Bearer bearer-token");
  });
});

// =============================================================================
// Section 13: signOut clears all state
// =============================================================================

describe("signOut", () => {
  it("clears tokens and cache", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(mockPatient()));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
      cacheTime: 60_000,
    });

    // Populate cache
    await client.readResource("Patient", "p-1");
    expect(client.getCached("Patient", "p-1")).toBeDefined();

    client.signOut();

    expect(client.getAccessToken()).toBeUndefined();
    expect(client.getRefreshToken()).toBeUndefined();
    expect(client.getCached("Patient", "p-1")).toBeUndefined();
  });
});

// =============================================================================
// Section 14: LRU Cache
// =============================================================================

describe("LRU cache", () => {
  it("returns cached resource on second read", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(mockPatient()));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      cacheTime: 60_000,
    });

    await client.readResource("Patient", "p-1");
    await client.readResource("Patient", "p-1");

    // Only one fetch call — second read served from cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("getCached returns resource after readResource", async () => {
    const patient = mockPatient();
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(patient)),
      cacheTime: 60_000,
    });

    await client.readResource("Patient", "p-1");
    const cached = client.getCached("Patient", "p-1");
    expect(cached).toBeDefined();
    expect(cached!.id).toBe("p-1");
  });

  it("bypasses cache with no-cache option", async () => {
    const mockFetch = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(mockPatient())));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      cacheTime: 60_000,
    });

    await client.readResource("Patient", "p-1");
    await client.readResource("Patient", "p-1", { cache: "no-cache" });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache when cacheTime is 0", async () => {
    const mockFetch = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(mockPatient())));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      cacheTime: 0,
    });

    await client.readResource("Patient", "p-1");
    await client.readResource("Patient", "p-1");

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("invalidates cache on create", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse(mockBundle([mockPatient()])),
    );
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      cacheTime: 60_000,
    });

    // Cache a search
    await client.search("Patient");

    // Create a resource (should invalidate search cache)
    mockFetch.mockResolvedValueOnce(jsonResponse(mockPatient("new-1")));
    await client.createResource({ resourceType: "Patient" });

    // Search again — should fetch, not use cache
    mockFetch.mockResolvedValueOnce(
      jsonResponse(mockBundle([mockPatient(), mockPatient("new-1")])),
    );
    await client.search("Patient");

    // 3 calls: initial search, create, second search
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("invalidates resource cache on delete", async () => {
    const mockFetch = vi.fn();
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      cacheTime: 60_000,
    });

    // Read and cache
    mockFetch.mockResolvedValueOnce(jsonResponse(mockPatient()));
    await client.readResource("Patient", "p-1");

    // Delete
    const outcome = {
      resourceType: "OperationOutcome",
      issue: [{ severity: "information", code: "informational" }],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(outcome));
    await client.deleteResource("Patient", "p-1");

    // getCached should be undefined
    expect(client.getCached("Patient", "p-1")).toBeUndefined();
  });

  it("write-through update caches new version", async () => {
    const mockFetch = vi.fn();
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      cacheTime: 60_000,
    });

    // Read old version
    mockFetch.mockResolvedValueOnce(jsonResponse(mockPatient()));
    await client.readResource("Patient", "p-1");

    // Update
    const updated = {
      ...mockPatient(),
      meta: { versionId: "v2", lastUpdated: "2026-02-01T00:00:00Z" },
      name: [{ family: "Updated" }],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(updated));
    await client.updateResource({
      resourceType: "Patient",
      id: "p-1",
      name: [{ family: "Updated" }],
    });

    // Cached version should be the updated one
    const cached = client.getCached("Patient", "p-1");
    expect(cached?.meta?.versionId).toBe("v2");
  });

  it("invalidateAll clears entire cache", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(mockPatient()));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      cacheTime: 60_000,
    });

    await client.readResource("Patient", "p-1");
    expect(client.getCached("Patient", "p-1")).toBeDefined();

    client.invalidateAll();
    expect(client.getCached("Patient", "p-1")).toBeUndefined();
  });

  it("evicts LRU entries when cache is full", async () => {
    const mockFetch = vi.fn();
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      cacheSize: 2,
      cacheTime: 60_000,
    });

    // Read 3 resources — cache can only hold 2
    for (const id of ["a", "b", "c"]) {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockPatient(id)));
      await client.readResource("Patient", id);
    }

    // "a" should be evicted (LRU)
    expect(client.getCached("Patient", "a")).toBeUndefined();
    // "b" and "c" should still be cached
    expect(client.getCached("Patient", "b")).toBeDefined();
    expect(client.getCached("Patient", "c")).toBeDefined();
  });
});

// =============================================================================
// Section 15: Auto-retry (429/5xx)
// =============================================================================

describe("auto-retry", () => {
  it("retries 429 responses with backoff", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse(mockPatient()));

    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      maxRetries: 2,
      maxRetryTime: 100,
    });

    const result = await client.readResource("Patient", "p-1");
    expect(result.id).toBe("p-1");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries 500 responses", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse(mockPatient()));

    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      maxRetries: 2,
      maxRetryTime: 100,
    });

    const result = await client.readResource("Patient", "p-1");
    expect(result.id).toBe("p-1");
  });

  it("gives up after maxRetries", async () => {
    const outcome = {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "exception", diagnostics: "Server Error" }],
    };
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(outcome, 500));

    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      maxRetries: 1,
      maxRetryTime: 50,
    });

    await expect(client.readResource("Patient", "p-1")).rejects.toThrow(FhirClientError);
    // 1 initial + 1 retry = 2 total
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry 400 errors", async () => {
    const outcome = {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "invalid", diagnostics: "Bad request" }],
    };
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(outcome, 400));

    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      maxRetries: 2,
    });

    await expect(client.readResource("Patient", "p-1")).rejects.toThrow(FhirClientError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry 404 errors", async () => {
    const outcome = {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "not-found", diagnostics: "Not found" }],
    };
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(outcome, 404));

    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      maxRetries: 2,
    });

    await expect(client.readResource("Patient", "p-1")).rejects.toThrow(FhirClientError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Section 16: Token auto-refresh + 401 retry
// =============================================================================

describe("token auto-refresh", () => {
  it("retries 401 with refreshed token", async () => {
    const tokenResponse = {
      access_token: "new-token",
      refresh_token: "new-refresh",
      expires_in: 3600,
    };
    const patient = mockPatient();

    const mockFetch = vi
      .fn()
      // First call: 401
      .mockResolvedValueOnce(jsonResponse({}, 401))
      // Token refresh call
      .mockResolvedValueOnce(jsonResponse(tokenResponse))
      // Retry with new token
      .mockResolvedValueOnce(jsonResponse(patient));

    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "old-token",
    });
    // Set refresh token to enable 401 retry
    client.setAccessToken("old-token", "old-refresh");

    const result = await client.readResource("Patient", "p-1");
    expect(result.id).toBe("p-1");
    expect(client.getAccessToken()).toBe("new-token");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("calls onUnauthenticated when refresh fails", async () => {
    const onUnauth = vi.fn();
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      // Token refresh fails
      .mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, 400));

    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "old-token",
      onUnauthenticated: onUnauth,
    });
    client.setAccessToken("old-token", "old-refresh");

    // The 401 handler returns undefined after sign-out,
    // then handleResponse throws on the original 401
    await expect(client.readResource("Patient", "p-1")).rejects.toThrow();
    expect(onUnauth).toHaveBeenCalledTimes(1);
    // Tokens cleared
    expect(client.getAccessToken()).toBeUndefined();
  });
});

// =============================================================================
// Section 17: setAccessToken with refreshToken
// =============================================================================

describe("setAccessToken extended", () => {
  it("accepts optional refreshToken parameter", () => {
    const client = new MedXAIClient({ baseUrl: "http://test" });
    client.setAccessToken("access", "refresh");
    expect(client.getAccessToken()).toBe("access");
    expect(client.getRefreshToken()).toBe("refresh");
  });

  it("does not change refreshToken when not provided", () => {
    const client = new MedXAIClient({ baseUrl: "http://test" });
    client.setAccessToken("a1", "r1");
    client.setAccessToken("a2");
    expect(client.getAccessToken()).toBe("a2");
    expect(client.getRefreshToken()).toBe("r1"); // unchanged
  });
});
