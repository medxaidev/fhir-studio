/**
 * JWT Key Management Tests
 *
 * Tests for initKeys, generateAccessToken, generateRefreshToken, verifyJwt, getJwks.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initKeys,
  generateAccessToken,
  generateRefreshToken,
  verifyJwt,
  getJwks,
  getSigningKeyId,
  generateSecret,
  _resetKeysForTesting,
} from "../../auth/keys.js";
import type { AccessTokenClaims, RefreshTokenClaims } from "../../auth/keys.js";

// =============================================================================
// Mock Repository
// =============================================================================

function createMockRepo() {
  const resources: Record<string, Record<string, unknown>> = {};
  let idCounter = 0;

  return {
    searchResources: async (request: { resourceType: string }) => {
      const matching = Object.values(resources).filter(
        (r) => r.resourceType === request.resourceType && r.active === true,
      );
      return { resources: matching, total: matching.length };
    },
    createResource: async (resource: Record<string, unknown>) => {
      const id = `key-${++idCounter}`;
      const persisted = {
        ...resource,
        id,
        resourceType: resource.resourceType,
        meta: { versionId: "1", lastUpdated: new Date().toISOString() },
      };
      resources[id] = persisted;
      return persisted;
    },
    readResource: async (_type: string, id: string) => {
      return resources[id];
    },
  } as any;
}

// =============================================================================
// Tests
// =============================================================================

describe("JWT Key Management", () => {
  const mockRepo = createMockRepo();
  const baseUrl = "http://localhost:3000";

  afterAll(() => {
    _resetKeysForTesting();
  });

  describe("initKeys", () => {
    it("generates a new key pair when none exist", async () => {
      _resetKeysForTesting();
      await initKeys(mockRepo, baseUrl);

      expect(getSigningKeyId()).toBeTruthy();
      expect(getJwks().keys.length).toBe(1);

      const jwk = getJwks().keys[0];
      expect(jwk.kty).toBe("EC");
      expect(jwk.alg).toBe("ES256");
      expect(jwk.use).toBe("sig");
      expect(jwk.kid).toBeTruthy();
      expect(jwk.x).toBeTruthy();
      expect(jwk.y).toBeTruthy();
      // Private key fields should NOT be in JWKS
      expect(jwk.d).toBeUndefined();
    });

    it("loads existing key on second init", async () => {
      _resetKeysForTesting();
      await initKeys(mockRepo, baseUrl);

      const kid1 = getSigningKeyId();
      const keyCount1 = getJwks().keys.length;

      // Re-init should load the same key
      _resetKeysForTesting();
      await initKeys(mockRepo, baseUrl);

      expect(getSigningKeyId()).toBe(kid1);
      expect(getJwks().keys.length).toBe(keyCount1);
    });
  });

  describe("generateAccessToken + verifyJwt", () => {
    beforeAll(async () => {
      _resetKeysForTesting();
      await initKeys(mockRepo, baseUrl);
    });

    it("generates a valid access token", async () => {
      const claims: AccessTokenClaims = {
        login_id: "login-123",
        sub: "user-456",
        profile: "Practitioner/789",
        scope: "openid",
      };

      const token = await generateAccessToken(claims);
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // JWT has 3 parts
    });

    it("verifies a valid access token", async () => {
      const claims: AccessTokenClaims = {
        login_id: "login-123",
        sub: "user-456",
        scope: "openid",
      };

      const token = await generateAccessToken(claims);
      const result = await verifyJwt(token);

      expect(result.payload.login_id).toBe("login-123");
      expect(result.payload.sub).toBe("user-456");
      expect(result.payload.scope).toBe("openid");
      expect(result.payload.iss).toBe(baseUrl);
      expect(result.payload.exp).toBeTruthy();
      expect(result.payload.iat).toBeTruthy();
    });

    it("rejects a tampered token", async () => {
      const claims: AccessTokenClaims = {
        login_id: "login-123",
        sub: "user-456",
        scope: "openid",
      };

      const token = await generateAccessToken(claims);
      const tampered = token.slice(0, -5) + "XXXXX";

      await expect(verifyJwt(tampered)).rejects.toThrow();
    });

    it("respects custom expiresIn", async () => {
      const claims: AccessTokenClaims = {
        login_id: "login-123",
        sub: "user-456",
        scope: "openid",
      };

      const token = await generateAccessToken(claims, { expiresIn: 60 });
      const result = await verifyJwt(token);

      const exp = result.payload.exp as number;
      const iat = result.payload.iat as number;
      expect(exp - iat).toBe(60);
    });
  });

  describe("generateRefreshToken", () => {
    beforeAll(async () => {
      _resetKeysForTesting();
      await initKeys(mockRepo, baseUrl);
    });

    it("generates a valid refresh token", async () => {
      const claims: RefreshTokenClaims = {
        login_id: "login-123",
        refresh_secret: "secret-abc",
      };

      const token = await generateRefreshToken(claims);
      expect(typeof token).toBe("string");

      const result = await verifyJwt(token);
      expect(result.payload.login_id).toBe("login-123");
      expect(result.payload.refresh_secret).toBe("secret-abc");
    });

    it("defaults to 2-week lifetime", async () => {
      const claims: RefreshTokenClaims = {
        login_id: "login-123",
        refresh_secret: "secret-abc",
      };

      const token = await generateRefreshToken(claims);
      const result = await verifyJwt(token);

      const exp = result.payload.exp as number;
      const iat = result.payload.iat as number;
      expect(exp - iat).toBe(14 * 24 * 3600);
    });
  });

  describe("getJwks", () => {
    it("returns JWKS with at least one key", async () => {
      _resetKeysForTesting();
      await initKeys(mockRepo, baseUrl);

      const jwks = getJwks();
      expect(jwks.keys.length).toBeGreaterThanOrEqual(1);
      expect(jwks.keys[0].kid).toBeTruthy();
    });
  });

  describe("generateSecret", () => {
    it("generates hex string of expected length", () => {
      const secret = generateSecret(16);
      expect(secret.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it("generates unique values", () => {
      const a = generateSecret(16);
      const b = generateSecret(16);
      expect(a).not.toBe(b);
    });
  });
});
