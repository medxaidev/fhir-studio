/**
 * JWT Key Management — Unit Tests (AUTH-01)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  initKeys,
  generateAccessToken,
  generateRefreshToken,
  verifyJwt,
  getJwks,
  getSigningKeyId,
  generateSecret,
  _resetKeysForTesting,
} from "../auth-v2/keys.js";
import type { AccessTokenClaims, RefreshTokenClaims } from "../auth-v2/keys.js";

beforeEach(() => {
  _resetKeysForTesting();
});

// =============================================================================
// initKeys (in-memory mode)
// =============================================================================

describe("initKeys (in-memory)", () => {
  it("initializes keys without persistence", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    expect(getSigningKeyId()).toBeDefined();
    expect(getJwks().keys).toHaveLength(1);
  });

  it("generates ES256 key", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const jwks = getJwks();
    expect(jwks.keys[0].alg).toBe("ES256");
    expect(jwks.keys[0].kty).toBe("EC");
    expect(jwks.keys[0].crv).toBe("P-256");
  });

  it("includes kid in JWKS", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const jwks = getJwks();
    expect(jwks.keys[0].kid).toBeDefined();
    expect(jwks.keys[0].kid).toBe(getSigningKeyId());
  });

  it("sets use=sig in JWKS", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const jwks = getJwks();
    expect(jwks.keys[0].use).toBe("sig");
  });
});

// =============================================================================
// Token generation
// =============================================================================

describe("generateAccessToken", () => {
  it("generates a valid JWT", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const claims: AccessTokenClaims = {
      login_id: "login-1",
      sub: "user-1",
      profile: "Practitioner/p-1",
      scope: "openid",
    };
    const token = await generateAccessToken(claims);
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("token can be verified", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const claims: AccessTokenClaims = {
      login_id: "login-1",
      sub: "user-1",
    };
    const token = await generateAccessToken(claims);
    const result = await verifyJwt(token);
    expect(result.payload.login_id).toBe("login-1");
    expect(result.payload.sub).toBe("user-1");
  });

  it("respects custom expiresIn", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const claims: AccessTokenClaims = { login_id: "l-1", sub: "u-1" };
    const token = await generateAccessToken(claims, { expiresIn: 60 });
    const result = await verifyJwt(token);
    const exp = result.payload.exp as number;
    const iat = result.payload.iat as number;
    expect(exp - iat).toBe(60);
  });

  it("throws if keys not initialized", async () => {
    const claims: AccessTokenClaims = { login_id: "l-1", sub: "u-1" };
    await expect(generateAccessToken(claims)).rejects.toThrow("not initialized");
  });
});

describe("generateRefreshToken", () => {
  it("generates a valid JWT", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const claims: RefreshTokenClaims = {
      login_id: "login-1",
      refresh_secret: "secret-abc",
    };
    const token = await generateRefreshToken(claims);
    expect(token.split(".")).toHaveLength(3);
  });

  it("token contains refresh_secret claim", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const claims: RefreshTokenClaims = {
      login_id: "login-1",
      refresh_secret: "secret-xyz",
    };
    const token = await generateRefreshToken(claims);
    const result = await verifyJwt(token);
    expect(result.payload.refresh_secret).toBe("secret-xyz");
  });
});

// =============================================================================
// Token verification
// =============================================================================

describe("verifyJwt", () => {
  it("verifies a valid token", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const claims: AccessTokenClaims = { login_id: "l-1", sub: "u-1" };
    const token = await generateAccessToken(claims);
    const result = await verifyJwt(token);
    expect(result.payload.iss).toBe("http://localhost:8080");
  });

  it("rejects an invalid token", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    await expect(verifyJwt("invalid.token.here")).rejects.toThrow();
  });

  it("rejects a token from a different issuer", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const claims: AccessTokenClaims = { login_id: "l-1", sub: "u-1" };
    const token = await generateAccessToken(claims);

    // Re-init with different issuer
    _resetKeysForTesting();
    await initKeys({ baseUrl: "http://different:9090" });
    await expect(verifyJwt(token)).rejects.toThrow();
  });

  it("throws if keys not initialized", async () => {
    await expect(verifyJwt("some.token.here")).rejects.toThrow("not initialized");
  });
});

// =============================================================================
// JWKS
// =============================================================================

describe("getJwks", () => {
  it("returns empty keys before initialization", () => {
    expect(getJwks().keys).toHaveLength(0);
  });

  it("returns one key after initialization", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    expect(getJwks().keys).toHaveLength(1);
  });

  it("does not include private key material", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    const key = getJwks().keys[0];
    expect(key.d).toBeUndefined();
  });
});

// =============================================================================
// generateSecret
// =============================================================================

describe("generateSecret", () => {
  it("generates hex string of correct length", () => {
    const secret = generateSecret(16);
    expect(secret).toHaveLength(32); // 16 bytes = 32 hex chars
  });

  it("generates unique values", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });

  it("defaults to 32 bytes (64 hex chars)", () => {
    const secret = generateSecret();
    expect(secret).toHaveLength(64);
  });
});

// =============================================================================
// _resetKeysForTesting
// =============================================================================

describe("_resetKeysForTesting", () => {
  it("clears all state", async () => {
    await initKeys({ baseUrl: "http://localhost:8080" });
    expect(getSigningKeyId()).toBeDefined();

    _resetKeysForTesting();
    expect(getSigningKeyId()).toBeUndefined();
    expect(getJwks().keys).toHaveLength(0);
  });
});
