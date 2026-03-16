/**
 * Authentication Middleware — Unit Tests (AUTH-02)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import {
  initKeys,
  generateAccessToken,
  _resetKeysForTesting,
} from "../auth-v2/keys.js";
import type { AccessTokenClaims } from "../auth-v2/keys.js";
import {
  buildAuthenticateToken,
  requireAuth,
  buildOperationContext,
  getOperationContext,
} from "../auth-v2/middleware.js";
import type { FhirPersistence } from "../types/engine.js";

const BASE_URL = "http://localhost:8080";

let app: FastifyInstance;

function createMockPersistence(overrides?: Partial<FhirPersistence>): FhirPersistence {
  return {
    createResource: vi.fn().mockResolvedValue({}),
    readResource: vi.fn().mockResolvedValue({
      resourceType: "Login",
      id: "login-1",
      meta: { versionId: "1", lastUpdated: new Date().toISOString() },
      revoked: false,
      superAdmin: false,
    }),
    updateResource: vi.fn().mockResolvedValue({}),
    deleteResource: vi.fn().mockResolvedValue(undefined),
    readHistory: vi.fn().mockResolvedValue([]),
    readVersion: vi.fn().mockResolvedValue({}),
    searchResources: vi.fn().mockResolvedValue({ resources: [], total: 0 }),
    processBundle: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as FhirPersistence;
}

beforeEach(async () => {
  _resetKeysForTesting();
  await initKeys({ baseUrl: BASE_URL });
});

afterEach(async () => {
  if (app) await app.close();
  _resetKeysForTesting();
});

async function buildApp(persistence?: FhirPersistence): Promise<FastifyInstance> {
  const p = persistence ?? createMockPersistence();
  app = Fastify({ logger: false });
  app.addHook("onRequest", buildAuthenticateToken(p));

  // Public route
  app.get("/public", async (req) => ({
    authenticated: !!req.authState,
    profile: req.authState?.profile,
  }));

  // Protected route
  app.get("/protected", { preHandler: [requireAuth] }, async (req) => ({
    profile: req.authState?.profile,
  }));

  await app.ready();
  return app;
}

// =============================================================================
// Phase 1: best-effort JWT parse
// =============================================================================

describe("authenticateToken (Phase 1)", () => {
  it("sets authState when valid Bearer token is provided", async () => {
    await buildApp();
    const claims: AccessTokenClaims = {
      login_id: "login-1",
      sub: "user-1",
      profile: "Practitioner/p-1",
      scope: "openid",
    };
    const token = await generateAccessToken(claims);
    const res = await app.inject({
      method: "GET",
      url: "/public",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(res.body);
    expect(body.authenticated).toBe(true);
    expect(body.profile).toBe("Practitioner/p-1");
  });

  it("does not set authState when no token is provided", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/public" });
    const body = JSON.parse(res.body);
    expect(body.authenticated).toBe(false);
  });

  it("does not set authState for invalid token", async () => {
    await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/public",
      headers: { authorization: "Bearer invalid.jwt.token" },
    });
    const body = JSON.parse(res.body);
    expect(body.authenticated).toBe(false);
  });

  it("does not set authState when login is revoked", async () => {
    const persistence = createMockPersistence({
      readResource: vi.fn().mockResolvedValue({
        resourceType: "Login",
        id: "login-1",
        meta: { versionId: "1", lastUpdated: new Date().toISOString() },
        revoked: true,
      }),
    });
    await buildApp(persistence);
    const claims: AccessTokenClaims = { login_id: "login-1", sub: "u-1" };
    const token = await generateAccessToken(claims);
    const res = await app.inject({
      method: "GET",
      url: "/public",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(JSON.parse(res.body).authenticated).toBe(false);
  });

  it("does not set authState when login read fails", async () => {
    const persistence = createMockPersistence({
      readResource: vi.fn().mockRejectedValue(new Error("Not found")),
    });
    await buildApp(persistence);
    const claims: AccessTokenClaims = { login_id: "login-1", sub: "u-1" };
    const token = await generateAccessToken(claims);
    const res = await app.inject({
      method: "GET",
      url: "/public",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(JSON.parse(res.body).authenticated).toBe(false);
  });

  it("ignores non-Bearer auth headers", async () => {
    await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/public",
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(JSON.parse(res.body).authenticated).toBe(false);
  });
});

// =============================================================================
// Phase 2: requireAuth
// =============================================================================

describe("requireAuth (Phase 2)", () => {
  it("allows authenticated requests", async () => {
    await buildApp();
    const claims: AccessTokenClaims = {
      login_id: "login-1",
      sub: "user-1",
      profile: "Practitioner/p-1",
    };
    const token = await generateAccessToken(claims);
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 for unauthenticated requests", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
    expect(body.issue[0].code).toBe("login");
  });

  it("returns FHIR content type on 401", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.headers["content-type"]).toContain("application/fhir+json");
  });
});

// =============================================================================
// Context builders
// =============================================================================

describe("buildOperationContext", () => {
  it("extracts author from profile", () => {
    const ctx = buildOperationContext({
      login: { resourceType: "Login", id: "l-1", meta: { versionId: "1", lastUpdated: "" } },
      profile: "Practitioner/p-1",
      scope: "openid",
      superAdmin: false,
    });
    expect(ctx.author).toBe("Practitioner/p-1");
    expect(ctx.superAdmin).toBe(false);
    expect(ctx.scope).toBe("openid");
  });

  it("handles superAdmin flag", () => {
    const ctx = buildOperationContext({
      login: { resourceType: "Login", id: "l-1", meta: { versionId: "1", lastUpdated: "" } },
      superAdmin: true,
    });
    expect(ctx.superAdmin).toBe(true);
  });
});

describe("getOperationContext", () => {
  it("returns undefined for unauthenticated request", () => {
    const mockReq = { authState: undefined } as any;
    expect(getOperationContext(mockReq)).toBeUndefined();
  });

  it("returns context for authenticated request", () => {
    const mockReq = {
      authState: {
        login: { resourceType: "Login", id: "l-1", meta: { versionId: "1", lastUpdated: "" } },
        profile: "Patient/p-1",
        scope: "openid",
        superAdmin: false,
      },
    } as any;
    const ctx = getOperationContext(mockReq);
    expect(ctx).toBeDefined();
    expect(ctx!.author).toBe("Patient/p-1");
  });
});
