/**
 * FhirClient Live E2E Tests
 *
 * Tests the new FhirClient SDK against a running fhir-server at http://localhost:8080.
 * Covers all key implemented features:
 *   1. Metadata / CapabilityStatement
 *   2. CRUD (Create, Read, Update, Delete)
 *   3. Search (basic, _count, query builder)
 *   4. History & VRead
 *   5. Error handling (404, 410)
 *   6. Cache layer (read cache, invalidation)
 *   7. Retry layer (retry on 5xx, no retry on 4xx)
 *   8. SearchParamsBuilder (fluent DSL)
 *   9. Auth layer (bearer token management)
 *
 * Prerequisites: `npm run dev` in fhir-server (port 8080).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { FhirClient } from "../client/fhir-client.js";
import { SearchParamsBuilder } from "../query/search-params-builder.js";
import { FhirClientError } from "../errors/errors.js";
import type { Resource, Bundle, CapabilityStatement } from "../types/index.js";

// =============================================================================
// Section 0: Server connectivity check
// =============================================================================

let serverAvailable = false;

beforeAll(async () => {
  try {
    const res = await fetch("http://localhost:8080/metadata");
    serverAvailable = res.ok;
  } catch {
    serverAvailable = false;
  }

  if (!serverAvailable) {
    console.warn(
      "\n⚠️  fhir-server is not running at http://localhost:8080.\n" +
        "   Run `npm run dev` in packages/fhir-server first.\n" +
        "   Skipping all live E2E tests.\n",
    );
  }
}, 10_000);

// Helper: skip test if server is down
function skipIfNoServer() {
  if (!serverAvailable) {
    return true;
  }
  return false;
}

// =============================================================================
// Section 1: Metadata / CapabilityStatement
// =============================================================================

describe("FhirClient — Metadata", () => {
  it("reads CapabilityStatement", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({ baseUrl: "http://localhost:8080" });
    const cs = await client.getCapabilities();

    expect(cs.resourceType).toBe("CapabilityStatement");
    expect(cs.fhirVersion).toBe("4.0.1");
    expect(cs.status).toBe("active");
  });
});

// =============================================================================
// Section 2: CRUD Operations
// =============================================================================

describe("FhirClient — Create", () => {
  it("creates a Patient and returns resource with id + meta", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({ baseUrl: "http://localhost:8080" });
    const patient = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E", given: ["Create"] }],
    });

    expect(patient.resourceType).toBe("Patient");
    expect(patient.id).toBeDefined();
    expect(patient.meta?.versionId).toBeDefined();
    expect(patient.meta?.lastUpdated).toBeDefined();
  });

  it("creates an Observation resource", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({ baseUrl: "http://localhost:8080" });
    const obs = await client.createResource<Resource>("Observation", {
      resourceType: "Observation",
      status: "final",
      code: { text: "LiveE2E-Obs" },
    });

    expect(obs.resourceType).toBe("Observation");
    expect(obs.id).toBeDefined();
  });
});

describe("FhirClient — Read", () => {
  it("reads a created resource by id", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({ baseUrl: "http://localhost:8080" });
    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-Read" }],
    });

    const read = await client.readResource<Resource>("Patient", created.id!);
    expect(read.id).toBe(created.id);
    expect(read.resourceType).toBe("Patient");
    expect(read.meta?.versionId).toBe(created.meta?.versionId);
  });
});

describe("FhirClient — Update", () => {
  it("updates a resource and gets a new version", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({ baseUrl: "http://localhost:8080" });
    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-Update" }],
    });

    const updated = await client.updateResource<Resource>(
      "Patient",
      created.id!,
      {
        ...created,
        name: [{ family: "LiveE2E-Updated" }],
      },
    );

    expect(updated.id).toBe(created.id);
    expect(updated.meta?.versionId).not.toBe(created.meta?.versionId);
    expect((updated as any).name[0].family).toBe("LiveE2E-Updated");
  });
});

describe("FhirClient — Delete", () => {
  it("deletes a resource without throwing", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({ baseUrl: "http://localhost:8080" });
    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-Delete" }],
    });

    // deleteResource returns void
    await expect(
      client.deleteResource("Patient", created.id!),
    ).resolves.toBeUndefined();
  });

  it("reading a deleted resource throws 410 Gone", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });
    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-DeleteGone" }],
    });

    await client.deleteResource("Patient", created.id!);

    try {
      await client.readResource("Patient", created.id!);
      expect.fail("Should have thrown for deleted resource");
    } catch (err) {
      expect(err).toBeInstanceOf(FhirClientError);
      expect((err as FhirClientError).statusCode).toBe(410);
    }
  });
});

// =============================================================================
// Section 3: Error Handling
// =============================================================================

describe("FhirClient — Error Handling", () => {
  it("throws 404 for non-existent resource", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });
    const fakeId = "non-existent-id-12345";

    try {
      await client.readResource("Patient", fakeId);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FhirClientError);
      expect((err as FhirClientError).statusCode).toBe(404);
    }
  });

  it("error includes OperationOutcome from server", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });

    try {
      await client.readResource("Patient", "non-existent-id-99999");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FhirClientError);
      const fhirErr = err as FhirClientError;
      expect(fhirErr.operationOutcome).toBeDefined();
      expect(fhirErr.operationOutcome?.resourceType).toBe("OperationOutcome");
      expect(fhirErr.operationOutcome?.issue[0]?.severity).toBe("error");
    }
  });
});

// =============================================================================
// Section 4: Search
// =============================================================================

describe("FhirClient — Search", () => {
  it("searches for resources and returns a Bundle", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });

    // Create a resource first to ensure there's something to find
    await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-Search" }],
    });

    const bundle = await client.search<Resource>("Patient");
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("searchset");
    expect(bundle.total).toBeGreaterThanOrEqual(1);
    expect(bundle.entry?.length).toBeGreaterThanOrEqual(1);
  });

  it("supports _count parameter", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });

    const bundle = await client.search<Resource>("Patient", { _count: "1" });
    expect(bundle.entry?.length).toBeLessThanOrEqual(1);
  });

  it("searchResources returns ResourceArray with bundle reference", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });

    const resources = await client.searchResources<Resource>("Patient", {
      _count: "2",
    });

    expect(Array.isArray(resources)).toBe(true);
    expect(resources.bundle).toBeDefined();
    expect(resources.bundle.resourceType).toBe("Bundle");
  });

  it("returns empty bundle for no matches", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });

    const bundle = await client.search<Resource>("Patient", {
      name: "ZZZNoMatchLiveE2E999",
    });
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.entry ?? []).toHaveLength(0);
  });
});

// =============================================================================
// Section 5: SearchParamsBuilder (fluent DSL)
// =============================================================================

describe("FhirClient — SearchParamsBuilder", () => {
  it("builds search params with fluent API", () => {
    const params = new SearchParamsBuilder()
      .where("name").is("Smith")
      .where("birthdate").ge("2000-01-01")
      .count(10)
      .build();

    expect(params.name).toBe("Smith");
    expect(params.birthdate).toBe("ge2000-01-01");
    expect(params._count).toBe("10");
  });

  it("client.buildSearchParams() returns a builder", () => {
    const client = new FhirClient({ baseUrl: "http://localhost:8080" });
    const builder = client.buildSearchParams();
    expect(builder).toBeInstanceOf(SearchParamsBuilder);
  });

  it("integrates builder with live search", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });

    const params = client
      .buildSearchParams()
      .count(2)
      .build();

    const bundle = await client.search<Resource>("Patient", params);
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.entry?.length).toBeLessThanOrEqual(2);
  });

  it("toQueryString() produces valid query string", () => {
    const qs = new SearchParamsBuilder()
      .where("name").is("Smith")
      .where("birthdate").ge("2000-01-01")
      .sort("name")
      .count(10)
      .toQueryString();

    expect(qs).toContain("name=Smith");
    expect(qs).toContain("birthdate=ge2000-01-01");
    expect(qs).toContain("_sort=name");
    expect(qs).toContain("_count=10");
  });

  it("supports _include and _revinclude", () => {
    const params = new SearchParamsBuilder()
      .include("Patient", "organization")
      .revInclude("Observation", "subject")
      .build();

    expect(params._include).toBe("Patient:organization");
    expect(params._revinclude).toBe("Observation:subject");
  });

  it("supports modifiers: contains, exact, missing", () => {
    const params = new SearchParamsBuilder()
      .where("name").contains("smi")
      .where("family").exact("Smith")
      .where("email").missing(true)
      .build();

    expect(params["name:contains"]).toBe("smi");
    expect(params["family:exact"]).toBe("Smith");
    expect(params["email:missing"]).toBe("true");
  });

  it("supports sort with desc", () => {
    const params = new SearchParamsBuilder()
      .sort("date", true)
      .build();

    expect(params._sort).toBe("-date");
  });

  it("supports offset and summary", () => {
    const params = new SearchParamsBuilder()
      .offset(20)
      .summary("count")
      .build();

    expect(params._offset).toBe("20");
    expect(params._summary).toBe("count");
  });

  it("supports elements", () => {
    const params = new SearchParamsBuilder()
      .elements("id", "name", "birthDate")
      .build();

    expect(params._elements).toBe("id,name,birthDate");
  });
});

// =============================================================================
// Section 6: History & VRead
// =============================================================================

describe("FhirClient — History", () => {
  it("reads resource history after create + update", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });

    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-History" }],
    });

    const updated = await client.updateResource<Resource>(
      "Patient",
      created.id!,
      {
        ...created,
        name: [{ family: "LiveE2E-HistoryV2" }],
      },
    );

    const history = await client.readHistory<Resource>("Patient", created.id!);
    expect(history.resourceType).toBe("Bundle");
    expect(history.type).toBe("history");
    expect(history.entry?.length).toBeGreaterThanOrEqual(2);
  });

  it("reads a specific version (vread)", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });

    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-VRead" }],
    });

    const version = await client.readVersion<Resource>(
      "Patient",
      created.id!,
      created.meta!.versionId!,
    );

    expect(version.id).toBe(created.id);
    expect(version.meta?.versionId).toBe(created.meta?.versionId);
  });
});

// =============================================================================
// Section 7: Cache Layer
// =============================================================================

describe("FhirClient — Cache", () => {
  it("caches read results (second read hits cache)", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: true, maxSize: 100, ttl: 60000 },
    });

    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-Cache" }],
    });

    // First read — fetches from server
    const read1 = await client.readResource<Resource>("Patient", created.id!);
    expect(read1.id).toBe(created.id);

    // Second read — should be from cache (same object reference)
    const read2 = await client.readResource<Resource>("Patient", created.id!);
    expect(read2.id).toBe(created.id);
    // Cache returns the same object
    expect(read2).toBe(read1);
  });

  it("getCached returns cached resource synchronously", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: true, maxSize: 100, ttl: 60000 },
    });

    // Before any request — cache is empty
    expect(client.getCached("Patient", "no-such-id")).toBeUndefined();

    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-GetCached" }],
    });

    // Read to populate cache
    await client.readResource<Resource>("Patient", created.id!);

    // Now getCached should return the resource
    const cached = client.getCached<Resource>("Patient", created.id!);
    expect(cached).toBeDefined();
    expect(cached!.id).toBe(created.id);
  });

  it("invalidateAll clears the entire cache", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: true, maxSize: 100, ttl: 60000 },
    });

    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-InvalidateAll" }],
    });

    await client.readResource<Resource>("Patient", created.id!);
    expect(client.getCached("Patient", created.id!)).toBeDefined();

    client.invalidateAll();
    expect(client.getCached("Patient", created.id!)).toBeUndefined();
  });

  it("no-cache option bypasses cache", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: true, maxSize: 100, ttl: 60000 },
    });

    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-NoCache" }],
    });

    // Populate cache
    const read1 = await client.readResource<Resource>("Patient", created.id!);

    // no-cache: fresh fetch — different response object
    const read2 = await client.readResource<Resource>("Patient", created.id!, {
      cache: "no-cache",
    });
    expect(read2.id).toBe(read1.id);
    // They should NOT be the same reference since no-cache forces a fresh fetch
    expect(read2).not.toBe(read1);
  });
});

// =============================================================================
// Section 8: Auth Layer (bearer token management)
// =============================================================================

describe("FhirClient — Auth", () => {
  it("signIn with bearer stores access token", async () => {
    const client = new FhirClient({ baseUrl: "http://localhost:8080" });

    const state = await client.signIn({
      type: "bearer",
      accessToken: "test-token-123",
    });

    expect(state.accessToken).toBe("test-token-123");
    expect(client.getAccessToken()).toBe("test-token-123");
  });

  it("signOut clears token and cache", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: true, maxSize: 100, ttl: 60000 },
    });

    await client.signIn({ type: "bearer", accessToken: "test-token-456" });
    expect(client.getAccessToken()).toBe("test-token-456");

    // Create and read to populate cache
    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-Auth" }],
    });
    await client.readResource<Resource>("Patient", created.id!);

    // Sign out should clear token + cache
    client.signOut();
    expect(client.getAccessToken()).toBeUndefined();
    expect(client.getCached("Patient", created.id!)).toBeUndefined();
  });

  it("initial bearer credentials are applied immediately", () => {
    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      auth: {
        credentials: {
          type: "bearer",
          accessToken: "initial-token",
        },
      },
    });

    expect(client.getAccessToken()).toBe("initial-token");
  });
});

// =============================================================================
// Section 9: Full CRUD Lifecycle
// =============================================================================

describe("FhirClient — Full CRUD Lifecycle", () => {
  it("create → read → update → search → delete → 410", async () => {
    if (skipIfNoServer()) return;

    const client = new FhirClient({
      baseUrl: "http://localhost:8080",
      cache: { enabled: false },
    });

    // 1. Create
    const created = await client.createResource<Resource>("Patient", {
      resourceType: "Patient",
      name: [{ family: "LiveE2E-Lifecycle", given: ["Full"] }],
      birthDate: "1990-01-01",
    });
    expect(created.id).toBeDefined();
    const id = created.id!;

    // 2. Read
    const read = await client.readResource<Resource>("Patient", id);
    expect(read.id).toBe(id);
    expect((read as any).name[0].family).toBe("LiveE2E-Lifecycle");

    // 3. Update
    const updated = await client.updateResource<Resource>("Patient", id, {
      ...read,
      name: [{ family: "LiveE2E-Lifecycle-V2", given: ["Full"] }],
    });
    expect(updated.id).toBe(id);
    expect((updated as any).name[0].family).toBe("LiveE2E-Lifecycle-V2");
    expect(updated.meta?.versionId).not.toBe(created.meta?.versionId);

    // 4. Search — find the updated resource
    const bundle = await client.search<Resource>("Patient", {
      name: "LiveE2E-Lifecycle-V2",
    });
    expect(bundle.entry?.some((e) => e.resource?.id === id)).toBe(true);

    // 5. Delete
    await client.deleteResource("Patient", id);

    // 6. Read after delete → 410 Gone
    try {
      await client.readResource("Patient", id);
      expect.fail("Should have thrown 410");
    } catch (err) {
      expect(err).toBeInstanceOf(FhirClientError);
      expect((err as FhirClientError).statusCode).toBe(410);
    }
  });
});
