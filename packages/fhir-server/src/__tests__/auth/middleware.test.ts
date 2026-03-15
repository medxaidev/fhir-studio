/**
 * Auth Middleware Tests
 *
 * Tests for buildAuthenticateToken, requireAuth, buildOperationContext, getOperationContext.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import {
  buildAuthenticateToken,
  requireAuth,
  buildOperationContext,
  getOperationContext,
} from "../../auth/middleware.js";
import type { AuthState } from "../../auth/middleware.js";
import {
  initKeys,
  generateAccessToken,
  _resetKeysForTesting,
} from "../../auth/keys.js";

// =============================================================================
// Mock Repository
// =============================================================================

function createMockSystemRepo(resources: Record<string, Record<string, unknown>>) {
  return {
    readResource: async (_type: string, id: string) => {
      const r = resources[id];
      if (!r) throw new Error(`Not found: ${id}`);
      return r;
    },
    searchResources: async (request: { resourceType: string }) => {
      const matching = Object.values(resources).filter(
        (r) => r.resourceType === request.resourceType && r.active === true,
      );
      return { resources: matching, total: matching.length };
    },
    createResource: async (resource: Record<string, unknown>) => {
      const id = `auto-${Date.now()}`;
      const persisted = {
        ...resource,
        id,
        meta: { versionId: "1", lastUpdated: new Date().toISOString() },
      };
      resources[id] = persisted;
      return persisted;
    },
  } as any;
}

// =============================================================================
// Tests
// =============================================================================

describe("Auth Middleware", () => {
  const loginId = "login-001";
  const membershipId = "membership-001";
  const projectId = "project-001";
  const userId = "user-001";

  const resources: Record<string, Record<string, unknown>> = {
    [loginId]: {
      id: loginId,
      resourceType: "Login",
      revoked: false,
      granted: true,
      membership: { reference: `ProjectMembership/${membershipId}` },
      user: { reference: `User/${userId}` },
      meta: { versionId: "1", lastUpdated: "2026-01-01T00:00:00Z" },
    },
    [membershipId]: {
      id: membershipId,
      resourceType: "ProjectMembership",
      active: true,
      project: { reference: `Project/${projectId}` },
      profile: { reference: `Practitioner/pract-001` },
      accessPolicy: { reference: `AccessPolicy/ap-001` },
      meta: { versionId: "1", lastUpdated: "2026-01-01T00:00:00Z" },
    },
    [projectId]: {
      id: projectId,
      resourceType: "Project",
      name: "Test Project",
      superAdmin: false,
      meta: { versionId: "1", lastUpdated: "2026-01-01T00:00:00Z" },
    },
  };

  const systemRepo = createMockSystemRepo(resources);
  let validToken: string;

  beforeAll(async () => {
    _resetKeysForTesting();
    await initKeys(systemRepo, "http://localhost:3000");

    validToken = await generateAccessToken({
      login_id: loginId,
      sub: userId,
      scope: "openid",
    });
  });

  afterAll(() => {
    _resetKeysForTesting();
  });

  describe("buildAuthenticateToken", () => {
    it("sets authState for valid Bearer token", async () => {
      const app = Fastify();
      const hook = buildAuthenticateToken(systemRepo);

      app.addHook("onRequest", hook);
      app.get("/test", async (request) => {
        return { hasAuth: !!request.authState, projectId: request.authState?.project?.id };
      });

      const response = await app.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.hasAuth).toBe(true);
      expect(body.projectId).toBe(projectId);

      await app.close();
    });

    it("leaves authState undefined for missing token", async () => {
      const app = Fastify();
      const hook = buildAuthenticateToken(systemRepo);

      app.addHook("onRequest", hook);
      app.get("/test", async (request) => {
        return { hasAuth: !!request.authState };
      });

      const response = await app.inject({
        method: "GET",
        url: "/test",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.hasAuth).toBe(false);

      await app.close();
    });

    it("leaves authState undefined for invalid token", async () => {
      const app = Fastify();
      const hook = buildAuthenticateToken(systemRepo);

      app.addHook("onRequest", hook);
      app.get("/test", async (request) => {
        return { hasAuth: !!request.authState };
      });

      const response = await app.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: "Bearer invalid.jwt.token" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.hasAuth).toBe(false);

      await app.close();
    });

    it("leaves authState undefined for revoked login", async () => {
      // Temporarily revoke the login
      resources[loginId].revoked = true;

      const app = Fastify();
      const hook = buildAuthenticateToken(systemRepo);
      app.addHook("onRequest", hook);
      app.get("/test", async (request) => ({ hasAuth: !!request.authState }));

      const response = await app.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: `Bearer ${validToken}` },
      });

      const body = JSON.parse(response.body);
      expect(body.hasAuth).toBe(false);

      // Restore
      resources[loginId].revoked = false;
      await app.close();
    });
  });

  describe("requireAuth", () => {
    it("allows authenticated requests", async () => {
      const app = Fastify();
      app.addHook("onRequest", buildAuthenticateToken(systemRepo));
      app.get("/protected", { preHandler: requireAuth }, async () => ({ ok: true }));

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it("returns 401 for unauthenticated requests", async () => {
      const app = Fastify();
      app.addHook("onRequest", buildAuthenticateToken(systemRepo));
      app.get("/protected", { preHandler: requireAuth }, async () => ({ ok: true }));

      const response = await app.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.resourceType).toBe("OperationOutcome");
      expect(body.issue[0].code).toBe("login");

      await app.close();
    });
  });

  describe("buildOperationContext", () => {
    it("builds context from AuthState", () => {
      const authState: AuthState = {
        login: resources[loginId] as any,
        project: resources[projectId] as any,
        membership: resources[membershipId] as any,
      };

      const ctx = buildOperationContext(authState);

      expect(ctx.project).toBe(projectId);
      expect(ctx.author).toBe("Practitioner/pract-001");
      expect(ctx.accessPolicy).toBe("ap-001");
      expect(ctx.superAdmin).toBe(false);
    });

    it("sets superAdmin from project", () => {
      const superAdminProject = {
        ...resources[projectId],
        superAdmin: true,
      };

      const authState: AuthState = {
        login: resources[loginId] as any,
        project: superAdminProject as any,
        membership: resources[membershipId] as any,
      };

      const ctx = buildOperationContext(authState);
      expect(ctx.superAdmin).toBe(true);
    });
  });

  describe("getOperationContext", () => {
    it("returns undefined for unauthenticated request", () => {
      const mockRequest = {} as any;
      expect(getOperationContext(mockRequest)).toBeUndefined();
    });

    it("returns context for authenticated request", () => {
      const mockRequest = {
        authState: {
          login: resources[loginId],
          project: resources[projectId],
          membership: resources[membershipId],
        },
      } as any;

      const ctx = getOperationContext(mockRequest);
      expect(ctx).toBeTruthy();
      expect(ctx!.project).toBe(projectId);
    });
  });
});
