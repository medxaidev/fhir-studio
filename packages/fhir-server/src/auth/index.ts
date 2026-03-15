/**
 * Auth Module — Public API
 *
 * @module fhir-server/auth
 */

// Keys
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
} from "./keys.js";

// Middleware
export {
  buildAuthenticateToken,
  requireAuth,
  buildOperationContext,
  getOperationContext,
} from "./middleware.js";
export type { AuthState, OperationContext } from "./middleware.js";

// Login
export { registerLoginRoutes } from "./login.js";

// Token
export { registerTokenRoutes } from "./token.js";

// AccessPolicy
export {
  supportsInteraction,
  canPerformInteraction,
  parseAccessPolicy,
  buildDefaultAccessPolicy,
} from "./access-policy.js";
export type {
  FhirInteraction,
  AccessPolicyResourceEntry,
  ParsedAccessPolicy,
} from "./access-policy.js";

// Seed
export { seedDatabase } from "./seed.js";
export type { SeedConfig, SeedResult } from "./seed.js";
