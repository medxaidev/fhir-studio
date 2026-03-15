/**
 * Phase J: Client SDK Enhancement Tests
 *
 * J1: Auto-Batch — queue operations, flush as single Bundle
 * J2: Binary/Attachment — upload, download, createBinary
 * J3: PKCE Login — generatePkceChallenge, buildPkceAuthorizationUrl, exchangeCodeWithPkce
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MedXAIClient } from "../client.js";
import { FhirClientError } from "../types.js";
import type { FhirResource, Bundle } from "../types.js";

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
  };
}

// =============================================================================
// J1: Auto-Batch
// =============================================================================

describe("J1: Auto-Batch", () => {
  it("setAutoBatch enables and disables auto-batching", () => {
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: vi.fn(),
    });
    expect(client.isAutoBatchEnabled()).toBe(false);
    client.setAutoBatch(true);
    expect(client.isAutoBatchEnabled()).toBe(true);
    client.setAutoBatch(false);
    expect(client.isAutoBatchEnabled()).toBe(false);
  });

  it("pushToBatch queues entries and flushBatch sends a batch Bundle", async () => {
    const patient1 = mockPatient("p-1");
    const patient2 = mockPatient("p-2");

    const batchResponse: Bundle = {
      resourceType: "Bundle",
      type: "batch-response",
      entry: [
        { resource: patient1, response: { status: "200" } },
        { resource: patient2, response: { status: "200" } },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(batchResponse));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
    });
    client.setAutoBatch(true, 1000); // long delay — we flush manually

    const p1 = client.pushToBatch<FhirResource>("GET", "Patient/p-1");
    const p2 = client.pushToBatch<FhirResource>("GET", "Patient/p-2");

    // Nothing sent yet
    expect(mockFetch).not.toHaveBeenCalled();

    // Flush manually
    await client.flushBatch();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.id).toBe("p-1");
    expect(r2.id).toBe("p-2");

    // Verify the batch Bundle was sent
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test");
    const body = JSON.parse(opts.body);
    expect(body.resourceType).toBe("Bundle");
    expect(body.type).toBe("batch");
    expect(body.entry).toHaveLength(2);
  });

  it("flushBatch rejects entries on batch error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
    });
    client.setAutoBatch(true, 5000);

    const p1 = client.pushToBatch<FhirResource>("GET", "Patient/p-1");
    await client.flushBatch();

    await expect(p1).rejects.toThrow("network error");
  });

  it("flushBatch rejects individual entries with error status", async () => {
    const batchResponse: Bundle = {
      resourceType: "Bundle",
      type: "batch-response",
      entry: [
        { resource: mockPatient("p-1"), response: { status: "200" } },
        { response: { status: "404" } },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(batchResponse));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
    });
    client.setAutoBatch(true, 5000);

    const p1 = client.pushToBatch<FhirResource>("GET", "Patient/p-1");
    const p2 = client.pushToBatch<FhirResource>("GET", "Patient/p-2");
    await client.flushBatch();

    const r1 = await p1;
    expect(r1.id).toBe("p-1");
    await expect(p2).rejects.toThrow(/404/);
  });

  it("auto-flushes after delay", async () => {
    const batchResponse: Bundle = {
      resourceType: "Bundle",
      type: "batch-response",
      entry: [{ resource: mockPatient("p-1"), response: { status: "200" } }],
    };

    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(batchResponse));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
    });
    client.setAutoBatch(true, 10); // 10ms delay

    const p1 = client.pushToBatch<FhirResource>("GET", "Patient/p-1");

    // Wait for auto-flush
    const result = await p1;
    expect(result.id).toBe("p-1");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("flushBatch is a no-op when queue is empty", async () => {
    const mockFetch = vi.fn();
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    await client.flushBatch(); // Should not throw or call fetch
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// =============================================================================
// J2: Binary / Attachment
// =============================================================================

describe("J2: Binary/Attachment", () => {
  it("uploadBinary sends POST with custom content-type", async () => {
    const binaryResource: FhirResource = {
      resourceType: "Binary",
      id: "bin-1",
      contentType: "image/png",
    };

    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(binaryResource, 201));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
    });

    const result = await client.uploadBinary("raw-data", "image/png");
    expect(result.id).toBe("bin-1");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test/Binary");
    expect(opts.method).toBe("POST");
    expect(opts.headers["content-type"]).toBe("image/png");
  });

  it("uploadBinary includes security context header", async () => {
    const binaryResource: FhirResource = { resourceType: "Binary", id: "bin-2" };
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(binaryResource, 201));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
    });

    await client.uploadBinary("data", "text/plain", "Patient/p-1");

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers["x-security-context"]).toBe("Patient/p-1");
  });

  it("downloadBinary returns Blob", async () => {
    const blobData = new Blob(["hello"], { type: "text/plain" });
    const response = new Response(blobData, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
    const mockFetch = vi.fn().mockResolvedValue(response);
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
    });

    const blob = await client.downloadBinary("bin-1");
    expect(blob).toBeInstanceOf(Blob);
    const text = await blob.text();
    expect(text).toBe("hello");
  });

  it("downloadBinary throws on error", async () => {
    const response = new Response("", { status: 404, statusText: "Not Found" });
    const mockFetch = vi.fn().mockResolvedValue(response);
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
    });

    await expect(client.downloadBinary("missing")).rejects.toThrow(FhirClientError);
  });

  it("createBinary creates a Binary resource via FHIR CRUD", async () => {
    const binaryResource: FhirResource = {
      resourceType: "Binary",
      id: "bin-3",
      contentType: "application/pdf",
      data: "base64data",
    };
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(binaryResource, 201));
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
      accessToken: "tok",
    });

    const result = await client.createBinary("application/pdf", "base64data");
    expect(result.id).toBe("bin-3");
    expect(result.resourceType).toBe("Binary");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test/Binary");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.contentType).toBe("application/pdf");
    expect(body.data).toBe("base64data");
  });
});

// =============================================================================
// J3: PKCE Login Flow
// =============================================================================

describe("J3: PKCE Login", () => {
  it("generatePkceChallenge returns verifier and challenge", async () => {
    const { codeVerifier, codeChallenge } = await MedXAIClient.generatePkceChallenge();

    expect(typeof codeVerifier).toBe("string");
    expect(typeof codeChallenge).toBe("string");
    expect(codeVerifier.length).toBeGreaterThan(20);
    expect(codeChallenge.length).toBeGreaterThan(20);
    // Should be base64url encoded (no +, /, =)
    expect(codeVerifier).not.toMatch(/[+/=]/);
    expect(codeChallenge).not.toMatch(/[+/=]/);
    // Verifier and challenge should be different
    expect(codeVerifier).not.toBe(codeChallenge);
  });

  it("generatePkceChallenge produces unique values", async () => {
    const a = await MedXAIClient.generatePkceChallenge();
    const b = await MedXAIClient.generatePkceChallenge();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });

  it("buildPkceAuthorizationUrl constructs correct URL", () => {
    const client = new MedXAIClient({ baseUrl: "http://test" });
    const url = client.buildPkceAuthorizationUrl({
      clientId: "my-client",
      redirectUri: "http://localhost:3000/callback",
      codeChallenge: "abc123",
      scope: "openid offline",
      state: "state-xyz",
    });

    expect(url).toContain("http://test/oauth2/authorize?");
    expect(url).toContain("response_type=code");
    expect(url).toContain("client_id=my-client");
    expect(url).toContain("code_challenge=abc123");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("state=state-xyz");
    expect(url).toContain(encodeURIComponent("http://localhost:3000/callback"));
  });

  it("buildPkceAuthorizationUrl uses default scope", () => {
    const client = new MedXAIClient({ baseUrl: "http://test" });
    const url = client.buildPkceAuthorizationUrl({
      clientId: "c",
      redirectUri: "http://localhost/cb",
      codeChallenge: "ch",
    });

    expect(url).toContain("scope=openid+offline");
  });

  it("exchangeCodeWithPkce sends correct token request", async () => {
    const tokenResponse = {
      token_type: "Bearer",
      access_token: "new-token",
      refresh_token: "new-refresh",
      expires_in: 3600,
      scope: "openid offline",
      project: { reference: "Project/proj-1" },
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(tokenResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    const result = await client.exchangeCodeWithPkce(
      "auth-code-123",
      "verifier-abc",
      "http://localhost/cb",
    );

    expect(result.accessToken).toBe("new-token");
    expect(result.refreshToken).toBe("new-refresh");
    expect(result.expiresIn).toBe(3600);
    expect(client.getAccessToken()).toBe("new-token");

    // Verify the request
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://test/oauth2/token");
    expect(opts.method).toBe("POST");
    expect(opts.headers["content-type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(opts.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code-123");
    expect(body.get("code_verifier")).toBe("verifier-abc");
    expect(body.get("redirect_uri")).toBe("http://localhost/cb");
  });

  it("exchangeCodeWithPkce works without redirectUri", async () => {
    const tokenResponse = {
      token_type: "Bearer",
      access_token: "tok",
      expires_in: 3600,
      scope: "openid",
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(tokenResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    await client.exchangeCodeWithPkce("code", "verifier");

    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    expect(body.get("redirect_uri")).toBeNull();
  });

  it("exchangeCodeWithPkce throws on error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new MedXAIClient({
      baseUrl: "http://test",
      fetchImpl: mockFetch,
    });

    await expect(
      client.exchangeCodeWithPkce("bad-code", "verifier"),
    ).rejects.toThrow(FhirClientError);
  });
});
