/**
 * OAuth2 Token Endpoint
 *
 * Implements `POST /oauth2/token` with three grant types:
 * - `authorization_code` — exchange login code for tokens
 * - `client_credentials` — service-to-service authentication
 * - `refresh_token` — refresh an expired access token
 *
 * @module fhir-server/auth
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository, PersistedResource } from "@medxai/fhir-persistence";
import { timingSafeEqual } from "node:crypto";
import {
  generateAccessToken,
  generateRefreshToken,
  generateSecret,
  verifyJwt,
} from "./keys.js";
import type { AccessTokenClaims, RefreshTokenClaims } from "./keys.js";

// =============================================================================
// Section 1: Types
// =============================================================================

interface TokenRequestBody {
  grant_type: string;
  code?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  scope?: string;
}

interface TokenResponse {
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  access_token: string;
  refresh_token?: string;
  project?: { reference: string };
  profile?: { reference: string };
}

// =============================================================================
// Section 2: Route Registration
// =============================================================================

/**
 * Register OAuth2 token routes on a Fastify instance.
 *
 * @param app - The Fastify app.
 * @param systemRepo - A system-level repository (no project/AccessPolicy restrictions).
 */
export function registerTokenRoutes(app: FastifyInstance, systemRepo: ResourceRepository): void {
  app.post("/oauth2/token", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as TokenRequestBody | undefined;

    if (!body?.grant_type) {
      return sendTokenError(reply, 400, "invalid_request", "grant_type is required");
    }

    try {
      let result: TokenResponse;

      switch (body.grant_type) {
        case "authorization_code":
          result = await handleAuthorizationCode(systemRepo, body);
          break;
        case "client_credentials":
          result = await handleClientCredentials(systemRepo, body);
          break;
        case "refresh_token":
          result = await handleRefreshToken(systemRepo, body);
          break;
        default:
          return sendTokenError(reply, 400, "unsupported_grant_type", `Unsupported grant_type: ${body.grant_type}`);
      }

      reply.status(200).header("content-type", "application/json").send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token request failed";
      const errorCode = message.includes("credentials") ? "invalid_client" : "invalid_grant";
      return sendTokenError(reply, 400, errorCode, message);
    }
  });
}

// =============================================================================
// Section 3: Authorization Code Grant
// =============================================================================

async function handleAuthorizationCode(
  repo: ResourceRepository,
  body: TokenRequestBody,
): Promise<TokenResponse> {
  if (!body.code) {
    throw new Error("code is required for authorization_code grant");
  }

  // Find Login by code
  const loginResult = await repo.searchResources({
    resourceType: "Login",
    params: [{ code: "code", values: [body.code] }],
    count: 1,
    offset: 0,
  });

  if (loginResult.resources.length === 0) {
    throw new Error("Invalid authorization code");
  }

  const login = loginResult.resources[0];
  const loginContent = login as Record<string, unknown>;

  // Validate login state
  if (loginContent.revoked) {
    throw new Error("Login has been revoked");
  }

  if (loginContent.granted) {
    // Code already used — revoke the login (prevent replay)
    await repo.updateResource({
      ...login,
      revoked: true,
    } as any);
    throw new Error("Authorization code already used");
  }

  if (!loginContent.membership) {
    throw new Error("Login has no associated membership — call POST /auth/login first");
  }

  // Mark as granted
  await repo.updateResource({
    ...login,
    granted: true,
  } as any);

  // Build token response
  return buildTokenResponse(repo, login);
}

// =============================================================================
// Section 4: Client Credentials Grant
// =============================================================================

async function handleClientCredentials(
  repo: ResourceRepository,
  body: TokenRequestBody,
): Promise<TokenResponse> {
  if (!body.client_id || !body.client_secret) {
    throw new Error("client_id and client_secret are required for client_credentials grant");
  }

  // Read ClientApplication
  let client: PersistedResource;
  try {
    client = await repo.readResource("ClientApplication", body.client_id);
  } catch {
    throw new Error("Invalid client credentials");
  }

  const clientContent = client as Record<string, unknown>;

  // Validate client status
  if (clientContent.status !== "active") {
    throw new Error("Client application is not active");
  }

  // Verify secret with timing-safe comparison
  const storedSecret = clientContent.secret as string | undefined;
  if (!storedSecret || !safeCompare(body.client_secret, storedSecret)) {
    throw new Error("Invalid client credentials");
  }

  // Find ProjectMembership for this client
  const membershipResult = await repo.searchResources({
    resourceType: "ProjectMembership",
    params: [{ code: "user", values: [`ClientApplication/${client.id}`] }],
    count: 1,
    offset: 0,
  });

  if (membershipResult.resources.length === 0) {
    throw new Error("No project membership found for client application");
  }

  const membership = membershipResult.resources[0];

  // Create Login (directly granted for client_credentials)
  const scope = body.scope ?? "openid";
  const login = await repo.createResource({
    resourceType: "Login",
    authMethod: "client",
    user: { reference: `ClientApplication/${client.id}` },
    client: { reference: `ClientApplication/${client.id}` },
    membership: { reference: `ProjectMembership/${membership.id}` },
    scope,
    granted: true,
    revoked: false,
    authTime: new Date().toISOString(),
  } as any);

  // Build token response (no refresh token for client_credentials)
  return buildTokenResponse(repo, login, { noRefresh: true });
}

// =============================================================================
// Section 5: Refresh Token Grant
// =============================================================================

async function handleRefreshToken(
  repo: ResourceRepository,
  body: TokenRequestBody,
): Promise<TokenResponse> {
  if (!body.refresh_token) {
    throw new Error("refresh_token is required");
  }

  // Verify the refresh token JWT
  let claims: RefreshTokenClaims;
  try {
    const { payload } = await verifyJwt(body.refresh_token);
    claims = payload as unknown as RefreshTokenClaims;
  } catch {
    throw new Error("Invalid refresh token");
  }

  if (!claims.login_id || !claims.refresh_secret) {
    throw new Error("Invalid refresh token claims");
  }

  // Read the Login resource
  let login: PersistedResource;
  try {
    login = await repo.readResource("Login", claims.login_id);
  } catch {
    throw new Error("Login not found");
  }

  const loginContent = login as Record<string, unknown>;

  // Validate login state
  if (loginContent.revoked) {
    throw new Error("Login has been revoked");
  }

  // Verify refresh secret with timing-safe comparison
  const storedSecret = loginContent.refreshSecret as string | undefined;
  if (!storedSecret || !safeCompare(claims.refresh_secret, storedSecret)) {
    throw new Error("Invalid refresh secret");
  }

  // Refresh Token Rotation: generate new secret, invalidate old token
  const newRefreshSecret = generateSecret(32);
  const updatedLogin = await repo.updateResource({
    ...login,
    refreshSecret: newRefreshSecret,
  } as any);

  // Build token response with new refresh token
  return buildTokenResponse(repo, updatedLogin);
}

// =============================================================================
// Section 6: Token Response Builder
// =============================================================================

interface BuildTokenOptions {
  noRefresh?: boolean;
}

async function buildTokenResponse(
  repo: ResourceRepository,
  login: PersistedResource,
  options?: BuildTokenOptions,
): Promise<TokenResponse> {
  const loginContent = login as Record<string, unknown>;

  // Read membership to get project/profile info
  const membershipRef = loginContent.membership as { reference?: string } | undefined;
  if (!membershipRef?.reference) {
    throw new Error("Login has no membership");
  }

  const membershipId = membershipRef.reference.split("/")[1];
  const membership = await repo.readResource("ProjectMembership", membershipId!);
  const membershipContent = membership as Record<string, unknown>;

  // Extract user reference for sub claim
  const userRef = loginContent.user as { reference?: string } | undefined;
  const sub = userRef?.reference?.split("/")[1] ?? login.id;

  // Extract profile reference
  const profileRef = membershipContent.profile as { reference?: string } | undefined;

  // Extract project reference
  const projectRef = membershipContent.project as { reference?: string } | undefined;

  const scope = (loginContent.scope as string) ?? "openid";
  const expiresIn = 3600; // 1 hour

  // Generate access token
  const accessTokenClaims: AccessTokenClaims = {
    login_id: login.id,
    sub,
    profile: profileRef?.reference,
    scope,
  };

  const accessToken = await generateAccessToken(accessTokenClaims, { expiresIn });

  // Build response
  const response: TokenResponse = {
    token_type: "Bearer",
    expires_in: expiresIn,
    scope,
    access_token: accessToken,
    project: projectRef?.reference ? { reference: projectRef.reference } : undefined,
    profile: profileRef?.reference ? { reference: profileRef.reference } : undefined,
  };

  // Generate refresh token (unless disabled or no refresh secret)
  if (!options?.noRefresh) {
    const refreshSecret = loginContent.refreshSecret as string | undefined;
    if (refreshSecret) {
      const refreshClaims: RefreshTokenClaims = {
        login_id: login.id,
        refresh_secret: refreshSecret,
      };
      response.refresh_token = await generateRefreshToken(refreshClaims);
    }
  }

  return response;
}

// =============================================================================
// Section 7: Helpers
// =============================================================================

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a constant-time compare to prevent length-based timing leak
    const dummy = Buffer.alloc(a.length, 0);
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Send an OAuth2 error response.
 */
function sendTokenError(
  reply: FastifyReply,
  status: number,
  error: string,
  description: string,
): void {
  reply.status(status).header("content-type", "application/json").send({
    error,
    error_description: description,
  });
}
