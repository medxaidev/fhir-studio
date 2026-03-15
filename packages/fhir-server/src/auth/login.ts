/**
 * Auth Login Handler
 *
 * Implements `POST /auth/login` — password-based authentication.
 *
 * Flow:
 * 1. Validate email + password
 * 2. Find User by email
 * 3. bcrypt.compare password
 * 4. Create Login resource with authorization code
 * 5. Find ProjectMembership, bind to Login
 * 6. Return { login, code }
 *
 * @module fhir-server/auth
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository, PersistedResource } from "@medxai/fhir-persistence";
import { compare } from "bcryptjs";
import { generateSecret } from "./keys.js";

// =============================================================================
// Section 1: Types
// =============================================================================

interface LoginRequestBody {
  email: string;
  password: string;
  scope?: string;
  clientId?: string;
  projectId?: string;
}

interface LoginResponse {
  login: string;
  code: string;
  memberships?: Array<{
    id: string;
    project: { reference: string };
    profile?: { reference: string };
  }>;
}

// =============================================================================
// Section 2: Route Registration
// =============================================================================

/**
 * Register auth login routes on a Fastify instance.
 *
 * @param app - The Fastify app.
 * @param systemRepo - A system-level repository (no project/AccessPolicy restrictions).
 */
export function registerLoginRoutes(app: FastifyInstance, systemRepo: ResourceRepository): void {
  app.post("/auth/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as LoginRequestBody | undefined;

    if (!body?.email || !body?.password) {
      reply.status(400).header("content-type", "application/fhir+json").send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "Email and password are required" }],
      });
      return;
    }

    try {
      const result = await handleLogin(systemRepo, body);
      reply.status(200).header("content-type", "application/json").send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      const status = message === "Invalid email or password" ? 401 : 400;
      reply.status(status).header("content-type", "application/fhir+json").send({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: status === 401 ? "login" : "invalid", diagnostics: message }],
      });
    }
  });
}

// =============================================================================
// Section 3: Login Logic
// =============================================================================

async function handleLogin(
  systemRepo: ResourceRepository,
  request: LoginRequestBody,
): Promise<LoginResponse> {
  // 1. Find User by email
  const user = await findUserByEmail(systemRepo, request.email, request.projectId);
  if (!user) {
    throw new Error("Invalid email or password");
  }

  const userContent = user as Record<string, unknown>;

  // 2. Verify password
  const passwordHash = userContent.passwordHash as string | undefined;
  if (!passwordHash) {
    throw new Error("Invalid email or password");
  }

  const valid = await compare(request.password, passwordHash);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  // 3. Create Login resource
  const scope = request.scope ?? "openid";
  const code = generateSecret(16);
  const refreshSecret = scope.includes("offline") ? generateSecret(32) : undefined;

  const loginResource = await systemRepo.createResource({
    resourceType: "Login",
    authMethod: "password",
    user: { reference: `User/${user.id}` },
    code,
    refreshSecret,
    scope,
    granted: false,
    revoked: false,
    authTime: new Date().toISOString(),
    remoteAddress: undefined,
  } as any);

  // 4. Find ProjectMembership(s) for this user
  const memberships = await findMembershipsForUser(systemRepo, user.id, request.projectId);

  if (memberships.length === 0) {
    throw new Error("No project membership found for user");
  }

  // 5. If exactly one membership, bind it to the Login
  if (memberships.length === 1) {
    const membership = memberships[0];
    await systemRepo.updateResource({
      ...loginResource,
      membership: { reference: `ProjectMembership/${membership.id}` },
    } as any);
  }

  // 6. Return result
  const result: LoginResponse = {
    login: loginResource.id,
    code,
  };

  if (memberships.length > 1) {
    result.memberships = memberships.map((m) => {
      const mc = m as Record<string, unknown>;
      return {
        id: m.id,
        project: mc.project as { reference: string },
        profile: mc.profile as { reference: string } | undefined,
      };
    });
  }

  return result;
}

// =============================================================================
// Section 4: Helper Functions
// =============================================================================

/**
 * Find a User by email address.
 */
async function findUserByEmail(
  repo: ResourceRepository,
  email: string,
  projectId?: string,
): Promise<PersistedResource | undefined> {
  const params: Array<{ code: string; values: string[] }> = [
    { code: "email", values: [email] },
  ];

  const result = await repo.searchResources({
    resourceType: "User",
    params,
    count: 1,
    offset: 0,
  });

  if (result.resources.length === 0) return undefined;

  // If projectId specified, filter by project
  if (projectId) {
    const matching = result.resources.find((r) => {
      const content = r as Record<string, unknown>;
      const projectRef = content.project as { reference?: string } | undefined;
      return projectRef?.reference === `Project/${projectId}`;
    });
    return matching;
  }

  return result.resources[0];
}

/**
 * Find ProjectMembership(s) for a given User ID.
 */
async function findMembershipsForUser(
  repo: ResourceRepository,
  userId: string,
  projectId?: string,
): Promise<PersistedResource[]> {
  const params: Array<{ code: string; values: string[] }> = [
    { code: "user", values: [`User/${userId}`] },
  ];

  if (projectId) {
    params.push({ code: "project", values: [`Project/${projectId}`] });
  }

  const result = await repo.searchResources({
    resourceType: "ProjectMembership",
    params,
    count: 100,
    offset: 0,
  });

  return result.resources;
}
