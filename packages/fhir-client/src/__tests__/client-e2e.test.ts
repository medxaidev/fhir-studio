/**
 * MedXAIClient E2E Tests
 *
 * Tests the FHIR client SDK against a real MedXAI FHIR server (Fastify inject).
 * Exercises full CRUD, search, history, and error handling.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import type { FastifyInstance } from "fastify";
import { createApp } from "../../../fhir-server/src/app.js";
import {
  DatabaseClient,
  FhirRepository,
  SearchParameterRegistry,
} from "@medxai/fhir-persistence";
import type { SearchParameterBundle } from "@medxai/fhir-persistence";
import { MedXAIClient } from "../client.js";
import { FhirClientError } from "../types.js";
import type { FhirResource, Bundle } from "../types.js";

// =============================================================================
// Section 1: Setup — spin up real server + client with inject-based fetch
// =============================================================================

let db: DatabaseClient;
let app: FastifyInstance;
let client: MedXAIClient;

/**
 * Build a fetch implementation that uses Fastify's inject() instead of HTTP.
 * This avoids needing to listen on a port during tests.
 */
function buildInjectFetch(fastify: FastifyInstance): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;

    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) {
        headers[k] = v;
      }
    }

    const result = await fastify.inject({
      method: (init?.method ?? "GET") as any,
      url: path,
      headers,
      payload: init?.body as string | undefined,
    });

    return new Response(result.body, {
      status: result.statusCode,
      statusText: result.statusMessage,
      headers: result.headers as Record<string, string>,
    });
  };
}

beforeAll(async () => {
  db = new DatabaseClient({
    host: process.env["DB_HOST"] ?? "localhost",
    port: Number(process.env["DB_PORT"] ?? 5433),
    database: process.env["DB_NAME"] ?? "medxai_dev",
    user: process.env["DB_USER"] ?? "postgres",
    password: process.env["DB_PASSWORD"] ?? "assert",
  });

  const alive = await db.ping();
  if (!alive) throw new Error("Cannot connect to PostgreSQL.");

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const specDir = resolve(scriptDir, "..", "..", "..", "..", "spec", "fhir", "r4");
  const platformDir = resolve(scriptDir, "..", "..", "..", "..", "spec", "platform");

  const spBundle = JSON.parse(
    readFileSync(resolve(specDir, "search-parameters.json"), "utf8"),
  ) as SearchParameterBundle;
  const spRegistry = new SearchParameterRegistry();
  spRegistry.indexBundle(spBundle);

  const platformSpPath = resolve(platformDir, "search-parameters-medxai.json");
  if (existsSync(platformSpPath)) {
    spRegistry.indexBundle(
      JSON.parse(readFileSync(platformSpPath, "utf8")) as SearchParameterBundle,
    );
  }

  const repo = new FhirRepository(db, spRegistry);
  app = await createApp({ repo, searchRegistry: spRegistry });

  client = new MedXAIClient({
    baseUrl: "http://localhost:8080",
    fetchImpl: buildInjectFetch(app),
  });
}, 30_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

// =============================================================================
// Section 2: Create
// =============================================================================

describe("MedXAIClient — Create", () => {
  it("creates a Patient resource", async () => {
    const patient = await client.createResource<FhirResource>({
      resourceType: "Patient",
      name: [{ family: "ClientTest", given: ["Create"] }],
    });

    expect(patient.resourceType).toBe("Patient");
    expect(patient.id).toBeDefined();
    expect(patient.meta?.versionId).toBeDefined();
    expect(patient.meta?.lastUpdated).toBeDefined();
  });

  it("creates an Observation resource", async () => {
    const obs = await client.createResource<FhirResource>({
      resourceType: "Observation",
      status: "final",
      code: { text: "ClientTest" },
    });

    expect(obs.resourceType).toBe("Observation");
    expect(obs.id).toBeDefined();
  });
});

// =============================================================================
// Section 3: Read
// =============================================================================

describe("MedXAIClient — Read", () => {
  it("reads a created resource", async () => {
    const created = await client.createResource<FhirResource>({
      resourceType: "Patient",
      name: [{ family: "ClientRead" }],
    });

    const read = await client.readResource("Patient", created.id!);
    expect(read.id).toBe(created.id);
    expect(read.resourceType).toBe("Patient");
  });

  it("throws 404 for non-existent resource", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    await expect(
      client.readResource("Patient", fakeId),
    ).rejects.toThrow(FhirClientError);

    try {
      await client.readResource("Patient", fakeId);
    } catch (err) {
      expect(err).toBeInstanceOf(FhirClientError);
      expect((err as FhirClientError).status).toBe(404);
    }
  });
});

// =============================================================================
// Section 4: Update
// =============================================================================

describe("MedXAIClient — Update", () => {
  it("updates an existing resource", async () => {
    const created = await client.createResource<FhirResource>({
      resourceType: "Patient",
      name: [{ family: "ClientUpdate" }],
    });

    const updated = await client.updateResource({
      ...created,
      name: [{ family: "ClientUpdated" }],
    });

    expect(updated.id).toBe(created.id);
    expect(updated.meta?.versionId).not.toBe(created.meta?.versionId);
    expect((updated as any).name[0].family).toBe("ClientUpdated");
  });

  it("throws on update without id", async () => {
    await expect(
      client.updateResource({ resourceType: "Patient" }),
    ).rejects.toThrow(FhirClientError);
  });
});

// =============================================================================
// Section 5: Delete
// =============================================================================

describe("MedXAIClient — Delete", () => {
  it("deletes a resource and returns OperationOutcome", async () => {
    const created = await client.createResource<FhirResource>({
      resourceType: "Patient",
      name: [{ family: "ClientDelete" }],
    });

    const outcome = await client.deleteResource("Patient", created.id!);
    expect(outcome.resourceType).toBe("OperationOutcome");
    expect(outcome.issue[0].severity).toBe("information");
  });

  it("throws 410 when reading deleted resource", async () => {
    const created = await client.createResource<FhirResource>({
      resourceType: "Patient",
      name: [{ family: "ClientDeleteGone" }],
    });

    await client.deleteResource("Patient", created.id!);

    try {
      await client.readResource("Patient", created.id!);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FhirClientError);
      expect((err as FhirClientError).status).toBe(410);
    }
  });
});

// =============================================================================
// Section 6: Search
// =============================================================================

describe("MedXAIClient — Search", () => {
  it("searches for resources by type", async () => {
    await client.createResource<FhirResource>({
      resourceType: "Patient",
      name: [{ family: "ClientSearchable" }],
    });

    const bundle = await client.search("Patient", { name: "ClientSearchable" });
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("searchset");
    expect(bundle.entry?.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty bundle for no matches", async () => {
    const bundle = await client.search("Patient", {
      name: "ZZZNoMatchClientTest999",
    });
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.entry ?? []).toHaveLength(0);
  });

  it("supports _count parameter", async () => {
    const bundle = await client.search("Patient", { _count: "1" });
    expect(bundle.entry?.length).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// Section 7: History
// =============================================================================

describe("MedXAIClient — History", () => {
  it("reads resource history", async () => {
    const created = await client.createResource<FhirResource>({
      resourceType: "Patient",
      name: [{ family: "ClientHistory" }],
    });

    // Update to create a second version
    await client.updateResource({
      ...created,
      name: [{ family: "ClientHistoryV2" }],
    });

    const history = await client.readHistory("Patient", created.id!);
    expect(history.resourceType).toBe("Bundle");
    expect(history.type).toBe("history");
    expect(history.entry?.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// Section 8: Metadata
// =============================================================================

describe("MedXAIClient — Metadata", () => {
  it("reads CapabilityStatement", async () => {
    const cap = await client.readMetadata();
    expect(cap.resourceType).toBe("CapabilityStatement");
  });
});

// =============================================================================
// Section 9: Auth token
// =============================================================================

describe("MedXAIClient — Token management", () => {
  it("set and get access token", () => {
    const c = new MedXAIClient({ baseUrl: "http://test" });
    expect(c.getAccessToken()).toBeUndefined();

    c.setAccessToken("my-token");
    expect(c.getAccessToken()).toBe("my-token");

    c.setAccessToken(undefined);
    expect(c.getAccessToken()).toBeUndefined();
  });
});
