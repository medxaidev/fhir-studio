/**
 * JWT Key Management
 *
 * Manages JsonWebKey resources for JWT signing/verification.
 * Uses the `jose` library for all cryptographic operations.
 *
 * - On server startup, loads active JsonWebKey from DB (or generates a new one)
 * - Signs access_token and refresh_token JWTs with ES256
 * - Verifies incoming JWTs using the public key set
 * - Exposes JWKS for `/.well-known/jwks.json`
 *
 * @module fhir-server/auth
 */

import { exportJWK, generateKeyPair, importJWK, jwtVerify, SignJWT } from "jose";
import type { JWK, JWTPayload, JWTVerifyResult } from "jose";
import type { ResourceRepository, PersistedResource } from "@medxai/fhir-persistence";
import { randomBytes } from "node:crypto";

// jose v5 uses CryptoKey | Uint8Array as key types; we alias for clarity.
type SigningKey = Parameters<InstanceType<typeof SignJWT>["sign"]>[0];

// =============================================================================
// Section 1: Types
// =============================================================================

/** Access token claims structure. */
export interface AccessTokenClaims extends JWTPayload {
  login_id: string;
  sub: string;
  profile?: string;
  scope?: string;
}

/** Refresh token claims structure. */
export interface RefreshTokenClaims extends JWTPayload {
  login_id: string;
  refresh_secret: string;
}

/** JWKS (JSON Web Key Set) structure. */
export interface JWKS {
  keys: JWK[];
}

/** Options for generating an access token. */
export interface GenerateAccessTokenOptions {
  /** Access token lifetime in seconds. Default: 3600 (1h). */
  expiresIn?: number;
}

/** Options for generating a refresh token. */
export interface GenerateRefreshTokenOptions {
  /** Refresh token lifetime in seconds. Default: 1209600 (2 weeks). */
  expiresIn?: number;
}

// =============================================================================
// Section 2: Module State
// =============================================================================

/** The active signing key (private). */
let signingKey: SigningKey | undefined;

/** The kid (key ID) of the active signing key. */
let signingKeyId: string | undefined;

/** Map of kid → public key (for verification). */
const publicKeys = new Map<string, SigningKey>();

/** The JWKS for the public endpoint. */
let jwks: JWKS = { keys: [] };

/** The issuer URL for JWT tokens. */
let issuerUrl: string = "";

/** Default access token lifetime: 1 hour. */
const DEFAULT_ACCESS_TOKEN_LIFETIME = 3600;

/** Default refresh token lifetime: 2 weeks. */
const DEFAULT_REFRESH_TOKEN_LIFETIME = 14 * 24 * 3600;

/** Preferred signing algorithm. */
const PREFERRED_ALG = "ES256" as const;

// =============================================================================
// Section 3: Initialization
// =============================================================================

/**
 * Initialize the JWT key infrastructure.
 *
 * 1. Searches for active JsonWebKey resources in the DB.
 * 2. If none found, generates a new ES256 key pair and persists it.
 * 3. Builds the public JWKS and in-memory verification key map.
 *
 * @param repo - A repository instance (typically SystemRepo — no project filter).
 * @param baseUrl - The server base URL (used as JWT issuer).
 */
export async function initKeys(repo: ResourceRepository, baseUrl: string): Promise<void> {
  issuerUrl = baseUrl;

  // Search for active JsonWebKey resources
  const searchResult = await repo.searchResources({
    resourceType: "JsonWebKey",
    params: [{ code: "active", values: ["true"] }],
    count: 10,
    offset: 0,
  });

  let keyResources = searchResult.resources;

  // If no active keys exist, generate one
  if (keyResources.length === 0) {
    const keyResource = await generateAndPersistKey(repo);
    keyResources = [keyResource];
  }

  // Build in-memory key structures
  const jwksKeys: JWK[] = [];

  for (const keyResource of keyResources) {
    const content = keyResource as Record<string, unknown>;
    const kid = keyResource.id;
    const alg = (content.alg as string) || PREFERRED_ALG;

    // Build public JWK for JWKS endpoint
    const publicJwk: JWK = {
      kid,
      kty: content.kty as string,
      alg,
      use: "sig",
    };

    if (alg === "ES256") {
      publicJwk.crv = content.crv as string;
      publicJwk.x = content.x as string;
      publicJwk.y = content.y as string;
    } else if (alg === "RS256") {
      publicJwk.n = content.n as string;
      publicJwk.e = content.e as string;
    }

    jwksKeys.push(publicJwk);

    // Import public key for verification
    const importedKey = await importJWK(publicJwk, alg);
    publicKeys.set(kid, importedKey as SigningKey);

    // First key becomes the signing key
    if (!signingKey) {
      // Build full private JWK for signing
      const privateJwk: JWK = { ...publicJwk };
      if (alg === "ES256") {
        privateJwk.d = content.d as string;
      } else if (alg === "RS256") {
        privateJwk.d = content.d as string;
        privateJwk.p = content.p as string;
        privateJwk.q = content.q as string;
        privateJwk.dp = content.dp as string;
        privateJwk.dq = content.dq as string;
        privateJwk.qi = content.qi as string;
      }

      const importedPrivate = await importJWK(privateJwk, alg);
      signingKey = importedPrivate as SigningKey;
      signingKeyId = kid;
    }
  }

  jwks = { keys: jwksKeys };
}

/**
 * Generate a new ES256 key pair and persist it as a JsonWebKey resource.
 */
async function generateAndPersistKey(repo: ResourceRepository): Promise<PersistedResource> {
  const { privateKey } = await generateKeyPair(PREFERRED_ALG, { extractable: true });
  const jwk = await exportJWK(privateKey);

  const resource = {
    resourceType: "JsonWebKey",
    active: true,
    kty: jwk.kty,
    alg: PREFERRED_ALG,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    d: jwk.d,
  } as Record<string, unknown>;

  return repo.createResource(resource as any);
}

// =============================================================================
// Section 4: Token Generation
// =============================================================================

/**
 * Generate an access token JWT.
 *
 * @param claims - The token claims (login_id, sub, profile, scope).
 * @param options - Optional lifetime override.
 * @returns Signed JWT string.
 */
export async function generateAccessToken(
  claims: AccessTokenClaims,
  options?: GenerateAccessTokenOptions,
): Promise<string> {
  assertInitialized();

  const expiresIn = options?.expiresIn ?? DEFAULT_ACCESS_TOKEN_LIFETIME;
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: PREFERRED_ALG, kid: signingKeyId })
    .setIssuer(issuerUrl)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + expiresIn)
    .sign(signingKey!);
}

/**
 * Generate a refresh token JWT.
 *
 * @param claims - The token claims (login_id, refresh_secret).
 * @param options - Optional lifetime override.
 * @returns Signed JWT string.
 */
export async function generateRefreshToken(
  claims: RefreshTokenClaims,
  options?: GenerateRefreshTokenOptions,
): Promise<string> {
  assertInitialized();

  const expiresIn = options?.expiresIn ?? DEFAULT_REFRESH_TOKEN_LIFETIME;
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: PREFERRED_ALG, kid: signingKeyId })
    .setIssuer(issuerUrl)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(signingKey!);
}

// =============================================================================
// Section 5: Token Verification
// =============================================================================

/**
 * Verify a JWT token and return the decoded payload.
 *
 * @param token - The JWT string to verify.
 * @returns The verified JWT result (payload + header).
 * @throws If the token is invalid, expired, or signed by an unknown key.
 */
export async function verifyJwt(token: string): Promise<JWTVerifyResult> {
  if (publicKeys.size === 0) {
    throw new Error("JWT keys not initialized — call initKeys() first");
  }

  return jwtVerify(token, getKeyForHeader, {
    issuer: issuerUrl,
    algorithms: [PREFERRED_ALG, "RS256"],
  });
}

/**
 * Key resolver for jose jwtVerify — looks up the public key by kid.
 */
function getKeyForHeader(protectedHeader: { kid?: string }): SigningKey {
  const kid = protectedHeader.kid;
  if (!kid) {
    throw new Error("JWT missing kid header");
  }
  const key = publicKeys.get(kid);
  if (!key) {
    throw new Error(`Unknown JWT kid: ${kid}`);
  }
  return key;
}

// =============================================================================
// Section 6: Public Accessors
// =============================================================================

/**
 * Get the current JWKS (for `/.well-known/jwks.json`).
 */
export function getJwks(): JWKS {
  return jwks;
}

/**
 * Get the current signing key ID.
 */
export function getSigningKeyId(): string | undefined {
  return signingKeyId;
}

/**
 * Generate a cryptographically secure random hex string.
 *
 * @param bytes - Number of random bytes (output will be 2x hex chars).
 */
export function generateSecret(bytes: number = 32): string {
  return randomBytes(bytes).toString("hex");
}

// =============================================================================
// Section 7: Internal Helpers
// =============================================================================

/**
 * Assert that initKeys() has been called.
 */
function assertInitialized(): void {
  if (!signingKey || !signingKeyId) {
    throw new Error("JWT signing key not initialized — call initKeys() first");
  }
}

/**
 * Reset module state (for testing only).
 * @internal
 */
export function _resetKeysForTesting(): void {
  signingKey = undefined;
  signingKeyId = undefined;
  publicKeys.clear();
  jwks = { keys: [] };
  issuerUrl = "";
}
