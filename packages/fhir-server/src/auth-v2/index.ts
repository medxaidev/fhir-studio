/**
 * Auth Layer — Barrel Export
 *
 * @module fhir-server/auth
 */

// ── JWT Key Management ───────────────────────────────────────────────────────
export {
  initKeys,
  generateAccessToken,
  generateRefreshToken,
  verifyJwt,
  getJwks,
  getSigningKeyId,
  generateSecret,
  _resetKeysForTesting,
} from "./keys.js";
export type {
  AccessTokenClaims,
  RefreshTokenClaims,
  JWKS,
  GenerateAccessTokenOptions,
  GenerateRefreshTokenOptions,
  InitKeysOptions,
} from "./keys.js";

// ── Authentication Middleware ─────────────────────────────────────────────────
export {
  buildAuthenticateToken,
  requireAuth,
  buildOperationContext,
  getOperationContext,
} from "./middleware.js";
export type {
  AuthState,
  OperationContext,
} from "./middleware.js";

// ── Access Policy ────────────────────────────────────────────────────────────
export {
  supportsInteraction,
  canPerformInteraction,
  parseAccessPolicy,
  buildDefaultAccessPolicy,
  getSearchCriteria,
  parseCriteriaString,
} from "./access-policy.js";
export type {
  FhirInteraction,
  AccessPolicyResourceEntry,
  ParsedAccessPolicy,
  ParsedSearchParam,
} from "./access-policy.js";
