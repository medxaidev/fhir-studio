/**
 * Phase I: Admin Routes Tests
 *
 * Tests for:
 * - POST /admin/projects (create project)
 * - GET /admin/projects/:id (get project)
 * - POST /admin/projects/:id/invite (invite user)
 * - GET /admin/projects/:id/members (list members)
 * - POST /admin/clients (register client)
 * - GET /admin/clients/:id (get client)
 *
 * Uses mock repo with simulated auth state via Fastify inject().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockRepo, mockPersistedResource } from "./helpers.js";
import type { MockRepo } from "./helpers.js";
import { createApp } from "../app.js";

let app: FastifyInstance;
let repo: MockRepo;

/**
 * Helper to build a mock auth state and inject it into requests.
 * We simulate authentication by adding the authState to the request
 * via a custom hook in the test app.
 */
async function createAuthTestApp(
  mockRepo: MockRepo,
  authState?: Record<string, unknown>,
): Promise<FastifyInstance> {
  const testApp = await createApp({
    repo: mockRepo,
    systemRepo: mockRepo,
    logger: false,
  });

  // Add hook to inject mock auth state
  if (authState) {
    testApp.addHook("onRequest", async (request) => {
      (request as any).authState = authState;
    });
  }

  return testApp;
}

function buildSuperAdminAuthState(projectId: string) {
  return {
    login: mockPersistedResource("Login", { id: "login-1" }),
    project: {
      ...mockPersistedResource("Project", { id: projectId }),
      superAdmin: true,
    },
    membership: {
      ...mockPersistedResource("ProjectMembership", { id: "mem-1" }),
      project: { reference: `Project/${projectId}` },
      profile: { reference: "User/admin-1" },
      admin: true,
    },
  };
}

function buildRegularAuthState(projectId: string) {
  return {
    login: mockPersistedResource("Login", { id: "login-2" }),
    project: mockPersistedResource("Project", { id: projectId }),
    membership: {
      ...mockPersistedResource("ProjectMembership", { id: "mem-2" }),
      project: { reference: `Project/${projectId}` },
      profile: { reference: "User/user-1" },
      admin: false,
    },
  };
}

beforeEach(() => {
  repo = createMockRepo();
});

afterEach(async () => {
  if (app) await app.close();
});

// =============================================================================
// Auth Guard
// =============================================================================

describe("Admin auth guards", () => {
  it("returns 401 when not authenticated", async () => {
    app = await createAuthTestApp(repo); // No auth state

    const res = await app.inject({
      method: "POST",
      url: "/admin/projects",
      headers: { "content-type": "application/fhir+json" },
      payload: { name: "Test" },
    });

    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /admin/projects
// =============================================================================

describe("POST /admin/projects", () => {
  it("creates project when superAdmin", async () => {
    const authState = buildSuperAdminAuthState("proj-admin");
    app = await createAuthTestApp(repo, authState);

    const created = mockPersistedResource("Project", { id: "new-proj" });
    (created as any).name = "New Project";
    repo.createResource.mockResolvedValue(created);

    const res = await app.inject({
      method: "POST",
      url: "/admin/projects",
      headers: { "content-type": "application/fhir+json" },
      payload: { name: "New Project", description: "A test project" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Project");
    expect(body.name).toBe("New Project");
  });

  it("returns 403 when not superAdmin", async () => {
    const authState = buildRegularAuthState("proj-regular");
    app = await createAuthTestApp(repo, authState);

    const res = await app.inject({
      method: "POST",
      url: "/admin/projects",
      headers: { "content-type": "application/fhir+json" },
      payload: { name: "Unauthorized Project" },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.issue[0].diagnostics).toContain("superAdmin");
  });

  it("returns 400 when name is missing", async () => {
    const authState = buildSuperAdminAuthState("proj-admin");
    app = await createAuthTestApp(repo, authState);

    const res = await app.inject({
      method: "POST",
      url: "/admin/projects",
      headers: { "content-type": "application/fhir+json" },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// GET /admin/projects/:id
// =============================================================================

describe("GET /admin/projects/:id", () => {
  it("returns project details for superAdmin", async () => {
    const authState = buildSuperAdminAuthState("proj-admin");
    app = await createAuthTestApp(repo, authState);

    const project = mockPersistedResource("Project", { id: "proj-1" });
    (project as any).name = "My Project";
    repo.readResource.mockResolvedValue(project);

    const res = await app.inject({
      method: "GET",
      url: "/admin/projects/proj-1",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Project");
  });

  it("allows project member to view own project", async () => {
    const authState = buildRegularAuthState("proj-1");
    app = await createAuthTestApp(repo, authState);

    const project = mockPersistedResource("Project", { id: "proj-1" });
    repo.readResource.mockResolvedValue(project);

    const res = await app.inject({
      method: "GET",
      url: "/admin/projects/proj-1",
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 403 for non-member non-superAdmin", async () => {
    const authState = buildRegularAuthState("proj-other");
    app = await createAuthTestApp(repo, authState);

    const res = await app.inject({
      method: "GET",
      url: "/admin/projects/proj-1",
    });

    expect(res.statusCode).toBe(403);
  });
});

// =============================================================================
// POST /admin/projects/:id/invite
// =============================================================================

describe("POST /admin/projects/:id/invite", () => {
  it("creates membership when superAdmin", async () => {
    const authState = buildSuperAdminAuthState("proj-admin");
    app = await createAuthTestApp(repo, authState);

    const project = mockPersistedResource("Project", { id: "proj-1" });
    const user = mockPersistedResource("User", { id: "user-1" });
    const membership = mockPersistedResource("ProjectMembership", { id: "mem-new" });

    repo.readResource.mockImplementation(async (type: string, id: string) => {
      if (type === "Project") return project;
      if (type === "User") return user;
      throw new Error("Not found");
    });
    repo.createResource.mockResolvedValue(membership);

    const res = await app.inject({
      method: "POST",
      url: "/admin/projects/proj-1/invite",
      headers: { "content-type": "application/fhir+json" },
      payload: { userId: "user-1", admin: false },
    });

    expect(res.statusCode).toBe(201);
    expect(repo.createResource).toHaveBeenCalled();
  });

  it("returns 400 when userId missing", async () => {
    const authState = buildSuperAdminAuthState("proj-admin");
    app = await createAuthTestApp(repo, authState);

    const res = await app.inject({
      method: "POST",
      url: "/admin/projects/proj-1/invite",
      headers: { "content-type": "application/fhir+json" },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 403 for non-member non-superAdmin", async () => {
    const authState = buildRegularAuthState("proj-other");
    app = await createAuthTestApp(repo, authState);

    const res = await app.inject({
      method: "POST",
      url: "/admin/projects/proj-1/invite",
      headers: { "content-type": "application/fhir+json" },
      payload: { userId: "user-1" },
    });

    expect(res.statusCode).toBe(403);
  });
});

// =============================================================================
// POST /admin/clients
// =============================================================================

describe("POST /admin/clients", () => {
  it("creates client when superAdmin", async () => {
    const authState = buildSuperAdminAuthState("proj-admin");
    app = await createAuthTestApp(repo, authState);

    const client = mockPersistedResource("ClientApplication", { id: "client-1" });
    (client as any).name = "My Client";
    repo.createResource.mockResolvedValue(client);

    const res = await app.inject({
      method: "POST",
      url: "/admin/clients",
      headers: { "content-type": "application/fhir+json" },
      payload: { name: "My Client" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("ClientApplication");
    // Secret should be returned
    expect(body.secret).toBeDefined();
    expect(typeof body.secret).toBe("string");
  });

  it("returns 403 when not superAdmin", async () => {
    const authState = buildRegularAuthState("proj-regular");
    app = await createAuthTestApp(repo, authState);

    const res = await app.inject({
      method: "POST",
      url: "/admin/clients",
      headers: { "content-type": "application/fhir+json" },
      payload: { name: "Unauthorized Client" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 400 when name missing", async () => {
    const authState = buildSuperAdminAuthState("proj-admin");
    app = await createAuthTestApp(repo, authState);

    const res = await app.inject({
      method: "POST",
      url: "/admin/clients",
      headers: { "content-type": "application/fhir+json" },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// GET /admin/clients/:id
// =============================================================================

describe("GET /admin/clients/:id", () => {
  it("returns client details with secret redacted", async () => {
    const authState = buildSuperAdminAuthState("proj-admin");
    app = await createAuthTestApp(repo, authState);

    const client = {
      ...mockPersistedResource("ClientApplication", { id: "client-1" }),
      name: "My Client",
      secret: "should-be-redacted",
    };
    repo.readResource.mockResolvedValue(client);

    const res = await app.inject({
      method: "GET",
      url: "/admin/clients/client-1",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("ClientApplication");
    expect(body.secret).toBeUndefined();
  });

  it("returns 403 when not superAdmin", async () => {
    const authState = buildRegularAuthState("proj-regular");
    app = await createAuthTestApp(repo, authState);

    const res = await app.inject({
      method: "GET",
      url: "/admin/clients/client-1",
    });

    expect(res.statusCode).toBe(403);
  });
});
