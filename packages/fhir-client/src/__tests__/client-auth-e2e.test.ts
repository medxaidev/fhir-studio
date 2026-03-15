/**
 * MedXAIClient Auth E2E Tests
 *
 * Tests signIn, signOut, refreshToken, and authenticated CRUD
 * against a real MedXAI FHIR server with auth enabled.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

import {
  DatabaseClient,
  FhirRepository,
  SearchParameterRegistry,
} from "@medxai/fhir-persistence";
import type { SearchParameterBundle } from "@medxai/fhir-persistence";
import { createApp } from "../../../fhir-server/src/app.js";
import { seedDatabase, initKeys, _resetKeysForTesting } from "../../../fhir-server/src/auth/index.js";
import type { SeedResult } from "../../../fhir-server/src/auth/index.js";

import { MedXAIClient } from "../client.js";
import { FhirClientError } from "../types.js";
import type { FhirResource } from "../types.js";

// =============================================================================
// Section 1: Setup
// =============================================================================

let db: DatabaseClient;
let systemRepo: FhirRepository;
let app: FastifyInstance;
let seedResult: SeedResult;

const RUN_ID = randomUUID().slice(0, 8);
const BASE_URL = "http://localhost:8080";
const ADMIN_EMAIL = `client-auth-${RUN_ID}@medxai.test`;
const ADMIN_PASSWORD = "Test1234!";

/**
 * Build a fetch implementation that uses Fastify's inject() instead of HTTP.
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

  systemRepo = new FhirRepository(db, spRegistry);

  _resetKeysForTesting();
  await initKeys(systemRepo, BASE_URL);

  seedResult = await seedDatabase(systemRepo, {
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
  });

  app = await createApp({
    repo: systemRepo,
    systemRepo,
    searchRegistry: spRegistry,
    logger: false,
    baseUrl: BASE_URL,
    enableAuth: true,
  });
}, 30_000);

afterAll(async () => {
  // Clean up seeded resources
  const types = [
    "Login", "ProjectMembership", "ClientApplication", "User",
    "JsonWebKey", "Project", "Patient", "Observation",
  ];
  for (const type of types) {
    try {
      await db.query(
        `DELETE FROM "${type}_History" WHERE "id" IN (SELECT "id" FROM "${type}" WHERE "content"::text LIKE $1)`,
        [`%${RUN_ID}%`],
      );
      await db.query(`DELETE FROM "${type}" WHERE "content"::text LIKE $1`, [`%${RUN_ID}%`]);
    } catch { /* ignore */ }
  }

  if (seedResult?.project?.id) {
    for (const type of ["Patient", "Observation"]) {
      try {
        await db.query(
          `DELETE FROM "${type}_History" WHERE "id" IN (SELECT "id" FROM "${type}" WHERE "projectId" = $1)`,
          [seedResult.project.id],
        );
        await db.query(`DELETE FROM "${type}" WHERE "projectId" = $1`, [seedResult.project.id]);
      } catch { /* ignore */ }
    }
  }

  _resetKeysForTesting();

  if (db && !db.isClosed) {
    await db.close();
  }
}, 15_000);

// =============================================================================
// Section 2: signIn
// =============================================================================

describe("MedXAIClient Auth — signIn", () => {
  it("signs in with email/password and sets access token", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    expect(client.getAccessToken()).toBeUndefined();

    const result = await client.signIn(ADMIN_EMAIL, ADMIN_PASSWORD);

    expect(result.accessToken).toBeDefined();
    expect(typeof result.accessToken).toBe("string");
    expect(result.expiresIn).toBeGreaterThan(0);
    expect(client.getAccessToken()).toBe(result.accessToken);
  });

  it("returns refresh token when offline scope is requested", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    const result = await client.signIn(ADMIN_EMAIL, ADMIN_PASSWORD, "openid offline");

    expect(result.refreshToken).toBeDefined();
    expect(typeof result.refreshToken).toBe("string");
    expect(client.getRefreshToken()).toBe(result.refreshToken);
  });

  it("throws on invalid credentials", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    await expect(
      client.signIn(ADMIN_EMAIL, "WrongPassword123!"),
    ).rejects.toThrow(FhirClientError);

    expect(client.getAccessToken()).toBeUndefined();
  });
});

// =============================================================================
// Section 3: signOut
// =============================================================================

describe("MedXAIClient Auth — signOut", () => {
  it("clears access and refresh tokens", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    await client.signIn(ADMIN_EMAIL, ADMIN_PASSWORD, "openid offline");
    expect(client.getAccessToken()).toBeDefined();
    expect(client.getRefreshToken()).toBeDefined();

    client.signOut();

    expect(client.getAccessToken()).toBeUndefined();
    expect(client.getRefreshToken()).toBeUndefined();
  });
});

// =============================================================================
// Section 4: refreshAccessToken
// =============================================================================

describe("MedXAIClient Auth — refreshAccessToken", () => {
  it("refreshes the access token using stored refresh token", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    const initial = await client.signIn(ADMIN_EMAIL, ADMIN_PASSWORD, "openid offline");
    expect(initial.refreshToken).toBeDefined();

    const refreshed = await client.refreshAccessToken();

    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.accessToken).not.toBe(initial.accessToken);
    expect(client.getAccessToken()).toBe(refreshed.accessToken);
  });

  it("rotates the refresh token", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    const initial = await client.signIn(ADMIN_EMAIL, ADMIN_PASSWORD, "openid offline");
    const oldRefresh = initial.refreshToken;

    const refreshed = await client.refreshAccessToken();

    expect(refreshed.refreshToken).toBeDefined();
    expect(refreshed.refreshToken).not.toBe(oldRefresh);
    expect(client.getRefreshToken()).toBe(refreshed.refreshToken);
  });

  it("throws if no refresh token is available", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    await expect(client.refreshAccessToken()).rejects.toThrow(FhirClientError);
  });
});

// =============================================================================
// Section 5: Authenticated CRUD
// =============================================================================

describe("MedXAIClient Auth — Authenticated CRUD", () => {
  it("creates and reads a resource with Bearer token", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    await client.signIn(ADMIN_EMAIL, ADMIN_PASSWORD);

    const patient = await client.createResource<FhirResource>({
      resourceType: "Patient",
      name: [{ family: `AuthCRUD-${RUN_ID}` }],
    });

    expect(patient.id).toBeDefined();
    expect(patient.resourceType).toBe("Patient");

    const read = await client.readResource("Patient", patient.id!);
    expect(read.id).toBe(patient.id);
  });
});

// =============================================================================
// Section 6: Low-level auth methods
// =============================================================================

describe("MedXAIClient Auth — Low-level", () => {
  it("startLogin returns login id and code", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    const result = await client.startLogin(ADMIN_EMAIL, ADMIN_PASSWORD, "openid offline");
    expect(result.login).toBeDefined();
    expect(result.code).toBeDefined();
    expect(typeof result.code).toBe("string");
  });

  it("exchangeCode returns token response", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    const loginResult = await client.startLogin(ADMIN_EMAIL, ADMIN_PASSWORD, "openid offline");
    const tokenResult = await client.exchangeCode(loginResult.code);

    expect(tokenResult.token_type).toBe("Bearer");
    expect(tokenResult.access_token).toBeDefined();
    expect(tokenResult.expires_in).toBeGreaterThan(0);
  });

  it("exchangeCode with invalid code throws", async () => {
    const client = new MedXAIClient({
      baseUrl: BASE_URL,
      fetchImpl: buildInjectFetch(app),
    });

    await expect(
      client.exchangeCode("invalid-code-xyz"),
    ).rejects.toThrow(FhirClientError);
  });
});
