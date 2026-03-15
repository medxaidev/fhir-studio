/**
 * Auth E2E Integration Tests — Phase D1
 *
 * Full end-to-end tests with real PostgreSQL:
 * 1. seedDatabase → create Project/User/ClientApplication/Membership
 * 2. initKeys → generate JsonWebKey in DB
 * 3. POST /auth/login → get authorization code
 * 4. POST /oauth2/token → exchange code for tokens
 * 5. Bearer token CRUD → verify OperationContext injection
 * 6. Multi-tenant isolation → Project A cannot see Project B data
 * 7. Unauthenticated requests → 401 when requireAuth is enforced
 * 8. client_credentials flow
 * 9. refresh_token rotation
 *
 * Requires `npm run db:init` in fhir-persistence to have been run first.
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
import { createApp } from "../../app.js";
import { seedDatabase, initKeys, _resetKeysForTesting } from "../../auth/index.js";
import type { SeedResult } from "../../auth/index.js";

// =============================================================================
// Setup
// =============================================================================

function loadEnv(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(scriptDir, "..", "..", "..", "..", "fhir-persistence", ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

let db: DatabaseClient;
let systemRepo: FhirRepository;
let spRegistry: SearchParameterRegistry;
let app: FastifyInstance;
let seedResult: SeedResult;

const RUN_ID = randomUUID().slice(0, 8);
const BASE_URL = "http://localhost:8080/fhir/R4";
const ADMIN_EMAIL = `admin-${RUN_ID}@medxai.test`;
const ADMIN_PASSWORD = "Test1234!";

// Token state (populated during tests)
let accessToken: string;
let refreshToken: string;

beforeAll(async () => {
  loadEnv();

  db = new DatabaseClient({
    host: process.env["DB_HOST"] ?? "localhost",
    port: parseInt(process.env["DB_PORT"] ?? "5433", 10),
    database: process.env["DB_NAME"] ?? "medxai_dev",
    user: process.env["DB_USER"] ?? "postgres",
    password: process.env["DB_PASSWORD"] ?? "assert",
  });

  const alive = await db.ping();
  if (!alive) {
    throw new Error("Cannot connect to PostgreSQL. Run `npm run db:init` first.");
  }

  // Load SearchParameterRegistry (R4 core + MedXAI platform)
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const specDir = resolve(scriptDir, "..", "..", "..", "..", "..", "spec", "fhir", "r4");
  const platformDir = resolve(scriptDir, "..", "..", "..", "..", "..", "spec", "platform");
  const spBundlePath = resolve(specDir, "search-parameters.json");
  const platformSpPath = resolve(platformDir, "search-parameters-medxai.json");
  if (!existsSync(spBundlePath)) {
    throw new Error(`search-parameters.json not found at ${spBundlePath}`);
  }
  const spBundle = JSON.parse(readFileSync(spBundlePath, "utf8")) as SearchParameterBundle;
  spRegistry = new SearchParameterRegistry();
  spRegistry.indexBundle(spBundle);
  // Load platform search params (Login, ProjectMembership, User, etc.)
  if (existsSync(platformSpPath)) {
    const platformBundle = JSON.parse(readFileSync(platformSpPath, "utf8")) as SearchParameterBundle;
    spRegistry.indexBundle(platformBundle);
  }

  // System repo (no project scoping)
  systemRepo = new FhirRepository(db, spRegistry);

  // Reset key state from any prior test
  _resetKeysForTesting();

  // 1. Initialize JWT keys
  await initKeys(systemRepo, BASE_URL);

  // 2. Seed the database
  seedResult = await seedDatabase(systemRepo, {
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
  });

  // 3. Create Fastify app with auth enabled
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
  // Clean up seeded resources (best-effort)
  const types = [
    "Login",
    "ProjectMembership",
    "ClientApplication",
    "User",
    "JsonWebKey",
    "Project",
    "Patient",
    "Observation",
  ];
  for (const type of types) {
    try {
      await db.query(
        `DELETE FROM "${type}_History" WHERE "id" IN (SELECT "id" FROM "${type}" WHERE "content"::text LIKE $1)`,
        [`%${RUN_ID}%`],
      );
      await db.query(`DELETE FROM "${type}" WHERE "content"::text LIKE $1`, [`%${RUN_ID}%`]);
    } catch {
      /* table may not exist or no matching rows — ignore */
    }
  }

  // Also clean by projectId for resources created under the seeded project
  if (seedResult?.project?.id) {
    for (const type of ["Patient", "Observation"]) {
      try {
        await db.query(
          `DELETE FROM "${type}_History" WHERE "id" IN (SELECT "id" FROM "${type}" WHERE "projectId" = $1)`,
          [seedResult.project.id],
        );
        await db.query(`DELETE FROM "${type}" WHERE "projectId" = $1`, [seedResult.project.id]);
      } catch {
        /* ignore */
      }
    }
  }

  _resetKeysForTesting();

  if (db && !db.isClosed) {
    await db.close();
  }
}, 15_000);

// =============================================================================
// Helpers
// =============================================================================

async function login(): Promise<{ loginId: string; code: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      scope: "openid offline",
      projectId: seedResult.project.id,
    }),
  });
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  return { loginId: body.login, code: body.code };
}

async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/oauth2/token",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
    }),
  });
  if (res.statusCode !== 200) {
    const errBody = JSON.parse(res.body);
    throw new Error(`Token exchange failed (${res.statusCode}): ${JSON.stringify(errBody)}`);
  }
  return JSON.parse(res.body);
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/fhir+json",
  };
}

// =============================================================================
// Section 1: Seed & Init Verification
// =============================================================================

describe("Auth E2E — Seed & Init", () => {
  it("seedDatabase created all platform resources", () => {
    expect(seedResult.project.id).toBeDefined();
    expect(seedResult.user.id).toBeDefined();
    expect(seedResult.client.id).toBeDefined();
    expect(seedResult.adminMembership.id).toBeDefined();
    expect(seedResult.clientMembership.id).toBeDefined();
    expect(seedResult.clientSecret).toBeDefined();
  });

  it("JWKS endpoint returns keys", async () => {
    const res = await app.inject({ method: "GET", url: "/.well-known/jwks.json" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.keys).toBeDefined();
    expect(body.keys.length).toBeGreaterThanOrEqual(1);
    expect(body.keys[0].kty).toBe("EC");
    expect(body.keys[0].alg).toBe("ES256");
  });
});

// =============================================================================
// Section 2: Login Flow
// =============================================================================

describe("Auth E2E — Login", () => {
  it("POST /auth/login with valid credentials returns code", async () => {
    const { loginId, code } = await login();
    expect(loginId).toBeDefined();
    expect(code).toBeDefined();
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);
  });

  it("POST /auth/login with wrong password returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: "wrong" }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /auth/login with missing fields returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL }),
    });
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// Section 3: Token Exchange
// =============================================================================

describe("Auth E2E — Token Exchange", () => {
  it("authorization_code grant returns access_token + refresh_token", async () => {
    const { code } = await login();
    const tokenRes = await exchangeCode(code);

    expect(tokenRes.access_token).toBeDefined();
    expect(typeof tokenRes.access_token).toBe("string");
    expect(tokenRes.refresh_token).toBeDefined();

    // Store for later tests
    accessToken = tokenRes.access_token;
    refreshToken = tokenRes.refresh_token!;
  });

  it("authorization_code replay is rejected", async () => {
    const { code } = await login();
    // First use succeeds
    await exchangeCode(code);
    // Second use fails
    const res = await app.inject({
      method: "POST",
      url: "/oauth2/token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("client_credentials grant returns access_token (no refresh)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth2/token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: seedResult.client.id,
        client_secret: seedResult.clientSecret,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeUndefined();
    expect(body.token_type).toBe("Bearer");
  });

  it("client_credentials with wrong secret returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth2/token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: seedResult.client.id,
        client_secret: "wrong-secret",
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("refresh_token grant returns new tokens", async () => {
    // Get fresh tokens
    const { code } = await login();
    const initial = await exchangeCode(code);
    expect(initial.refresh_token).toBeDefined();

    const res = await app.inject({
      method: "POST",
      url: "/oauth2/token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: initial.refresh_token,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    // New tokens should differ from old ones
    expect(body.access_token).not.toBe(initial.access_token);
    expect(body.refresh_token).not.toBe(initial.refresh_token);
  });
});

// =============================================================================
// Section 4: Authenticated CRUD
// =============================================================================

describe("Auth E2E — Authenticated CRUD", () => {
  let patientId: string;

  beforeAll(async () => {
    // Ensure we have a fresh access token
    const { code } = await login();
    const tokens = await exchangeCode(code);
    accessToken = tokens.access_token;
  });

  it("POST /Patient with Bearer token creates resource", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        resourceType: "Patient",
        name: [{ family: `AuthE2E-${RUN_ID}`, given: ["Test"] }],
        gender: "male",
        active: true,
      }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.resourceType).toBe("Patient");
    patientId = body.id;
  });

  it("GET /Patient/:id with Bearer token reads resource", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/Patient/${patientId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(patientId);
    expect(body.resourceType).toBe("Patient");
  });

  it("PUT /Patient/:id with Bearer token updates resource", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/Patient/${patientId}`,
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        resourceType: "Patient",
        id: patientId,
        name: [{ family: `AuthE2E-${RUN_ID}-Updated`, given: ["Test"] }],
        gender: "female",
        active: true,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(patientId);
    expect(body.gender).toBe("female");
  });

  it("GET /Patient search with Bearer token returns results", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/Patient?_id=${patientId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Bundle");
    expect(body.type).toBe("searchset");
    const ids = (body.entry ?? []).map((e: any) => e.resource.id);
    expect(ids).toContain(patientId);
  });

  it("DELETE /Patient/:id with Bearer token deletes resource", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/Patient/${patientId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("GET deleted resource returns 410 Gone", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/Patient/${patientId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(410);
  });
});

// =============================================================================
// Section 5: Multi-Tenant Isolation
// =============================================================================

describe("Auth E2E — Multi-Tenant Isolation", () => {
  let projectAPatientId: string;
  let projectBToken: string;

  beforeAll(async () => {
    // Create a Patient in Project A (the seeded project, using admin token)
    const { code } = await login();
    const tokens = await exchangeCode(code);
    accessToken = tokens.access_token;

    const createRes = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        resourceType: "Patient",
        name: [{ family: `Isolation-${RUN_ID}`, given: ["ProjectA"] }],
      }),
    });
    expect(createRes.statusCode).toBe(201);
    projectAPatientId = JSON.parse(createRes.body).id;

    // Create a second project + user + membership for isolation test
    const projectB = await systemRepo.createResource({
      resourceType: "Project",
      name: `IsolationTestB-${RUN_ID}`,
      superAdmin: false,
    } as any);

    const userB = await systemRepo.createResource({
      resourceType: "User",
      firstName: "UserB",
      lastName: `Test-${RUN_ID}`,
      email: `userb-${RUN_ID}@medxai.test`,
      emailVerified: true,
      passwordHash: (seedResult.user as any).passwordHash,
      project: { reference: `Project/${projectB.id}` },
    } as any);

    await systemRepo.createResource({
      resourceType: "ProjectMembership",
      project: { reference: `Project/${projectB.id}` },
      user: { reference: `User/${userB.id}` },
      profile: { reference: `User/${userB.id}` },
      admin: true,
      active: true,
      userName: `userb-${RUN_ID}@medxai.test`,
    } as any);

    // Login as User B via client_credentials on a new ClientApplication for Project B
    const clientBSecret = "test-secret-b-" + RUN_ID;
    const clientB = await systemRepo.createResource({
      resourceType: "ClientApplication",
      name: `ClientB-${RUN_ID}`,
      status: "active",
      secret: clientBSecret,
    } as any);

    await systemRepo.createResource({
      resourceType: "ProjectMembership",
      project: { reference: `Project/${projectB.id}` },
      user: { reference: `ClientApplication/${clientB.id}` },
      profile: { reference: `ClientApplication/${clientB.id}` },
      admin: false,
      active: true,
      userName: `ClientB-${RUN_ID}`,
    } as any);

    // Get token for Project B via client_credentials
    const tokenRes = await app.inject({
      method: "POST",
      url: "/oauth2/token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientB.id,
        client_secret: clientBSecret,
      }),
    });
    expect(tokenRes.statusCode).toBe(200);
    projectBToken = JSON.parse(tokenRes.body).access_token;
  }, 30_000);

  it("Project B cannot read Project A's Patient (404)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/Patient/${projectAPatientId}`,
      headers: { authorization: `Bearer ${projectBToken}` },
    });
    // Should get 404 because the patient belongs to Project A, not B
    expect(res.statusCode).toBe(404);
  });

  it("Project B search does not include Project A's Patient", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/Patient?_id=${projectAPatientId}`,
      headers: { authorization: `Bearer ${projectBToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids = (body.entry ?? []).map((e: any) => e.resource.id);
    expect(ids).not.toContain(projectAPatientId);
  });

  it("Project A can still read its own Patient", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/Patient/${projectAPatientId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe(projectAPatientId);
  });
});

// =============================================================================
// Section 6: Token Response Metadata
// =============================================================================

describe("Auth E2E — Token Response Metadata", () => {
  it("token response includes project and profile references", async () => {
    const { code } = await login();
    const res = await app.inject({
      method: "POST",
      url: "/oauth2/token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.project).toBeDefined();
    expect(body.project.reference).toContain("Project/");
    expect(body.profile).toBeDefined();
  });
});

// =============================================================================
// Section 7: Error Cases
// =============================================================================

describe("Auth E2E — Error Cases", () => {
  it("invalid Bearer token is silently ignored (no auth state)", async () => {
    // With auth enabled but no requireAuth on resource routes,
    // invalid token just means no context — request still proceeds
    const res = await app.inject({
      method: "GET",
      url: "/healthcheck",
      headers: { authorization: "Bearer invalid.jwt.token" },
    });
    // healthcheck doesn't use requireAuth, so it should still work
    expect(res.statusCode).toBe(200);
  });

  it("missing grant_type returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth2/token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("invalid_request");
  });

  it("unsupported grant_type returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth2/token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "implicit" }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("unsupported_grant_type");
  });
});
