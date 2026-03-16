/**
 * JWT Key Management
 *
 * Manages ES256 key pairs for JWT signing/verification.
 * Uses the `jose` library for all cryptographic operations.
 *
 * Adapted from medxai/fhir-server auth/keys.ts — uses FhirEngine instead
 * of ResourceRepository, supports both DB-backed and in-memory key modes.
 *
 * @module fhir-server/auth
 */

import { exportJWK, generateKeyPair, importJWK, jwtVerify, SignJWT } from "jose";
import type { JWK, JWTPayload, JWTVerifyResult } from "jose";
import { randomBytes } from "node:crypto";
import type { FhirPersistence } from "../types/engine.js";

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

/** Options for initKeys(). */
export interface InitKeysOptions {
  /** FhirPersistence for DB-backed key storage. If omitted, keys are in-memory only. */
  persistence?: FhirPersistence;
  /** Base URL used as JWT issuer. */
  baseUrl: string;
}

// =============================================================================
// Section 2: Module State
// =============================================================================

type SigningKey = CryptoKey | Uint8Array;

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
 * Two modes:
 * 1. **DB-backed** (persistence provided): loads/generates keys via engine.persistence
 * 2. **In-memory** (no persistence): generates ephemeral key pair
 */
export async function initKeys(options: InitKeysOptions): Promise<void> {
  issuerUrl = options.baseUrl;

  if (options.persistence) {
    await initKeysFromDB(options.persistence);
  } else {
    await initKeysInMemory();
  }
}

/**
 * Initialize keys from database (searches for active JsonWebKey resources).
 */
async function initKeysFromDB(persistence: FhirPersistence): Promise<void> {
  const searchResult = await persistence.searchResources({
    resourceType: "JsonWebKey",
    params: { active: "true" },
    count: 10,
    offset: 0,
  });

  let keyResources = searchResult.resources as Array<Record<string, unknown> & { id: string }>;

  if (keyResources.length === 0) {
    const keyResource = await generateAndPersistKey(persistence);
    keyResources = [keyResource as Record<string, unknown> & { id: string }];
  }

  await loadKeysFromResources(keyResources);
}

/**
 * Initialize keys in-memory (ephemeral — lost on restart).
 */
async function initKeysInMemory(): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair(PREFERRED_ALG, { extractable: true });
  const publicJwk = await exportJWK(publicKey);

  const kid = generateSecret(8);

  signingKey = privateKey as SigningKey;
  signingKeyId = kid;

  const pubJwk: JWK = {
    kid,
    kty: publicJwk.kty,
    alg: PREFERRED_ALG,
    use: "sig",
    crv: publicJwk.crv,
    x: publicJwk.x,
    y: publicJwk.y,
  };

  publicKeys.set(kid, publicKey as SigningKey);
  jwks = { keys: [pubJwk] };
}

/**
 * Load keys from persisted JsonWebKey resources.
 */
async function loadKeysFromResources(keyResources: Array<Record<string, unknown> & { id: string }>): Promise<void> {
  const jwksKeys: JWK[] = [];

  for (const keyResource of keyResources) {
    const kid = keyResource.id as string;
    const alg = (keyResource.alg as string) || PREFERRED_ALG;

    const publicJwk: JWK = {
      kid,
      kty: keyResource.kty as string,
      alg,
      use: "sig",
    };

    if (alg === "ES256") {
      publicJwk.crv = keyResource.crv as string;
      publicJwk.x = keyResource.x as string;
      publicJwk.y = keyResource.y as string;
    } else if (alg === "RS256") {
      publicJwk.n = keyResource.n as string;
      publicJwk.e = keyResource.e as string;
    }

    jwksKeys.push(publicJwk);

    const importedKey = await importJWK(publicJwk, alg);
    publicKeys.set(kid, importedKey as SigningKey);

    if (!signingKey) {
      const privateJwk: JWK = { ...publicJwk };
      if (alg === "ES256") {
        privateJwk.d = keyResource.d as string;
      } else if (alg === "RS256") {
        privateJwk.d = keyResource.d as string;
        privateJwk.p = keyResource.p as string;
        privateJwk.q = keyResource.q as string;
        privateJwk.dp = keyResource.dp as string;
        privateJwk.dq = keyResource.dq as string;
        privateJwk.qi = keyResource.qi as string;
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
async function generateAndPersistKey(persistence: FhirPersistence): Promise<Record<string, unknown>> {
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
  };

  const created = await persistence.createResource("JsonWebKey", resource);
  return created as unknown as Record<string, unknown>;
}

// =============================================================================
// Section 4: Token Generation
// =============================================================================

/**
 * Generate an access token JWT.
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
 */
export function generateSecret(bytes: number = 32): string {
  return randomBytes(bytes).toString("hex");
}

// =============================================================================
// Section 7: Internal Helpers
// =============================================================================

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
