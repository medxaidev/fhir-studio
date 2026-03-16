/**
 * `@medxai/fhir-server` �?Public API
 *
 * FHIR R4 REST API server built on Fastify v5.
 * Exposes the `fhir-persistence` repository layer as HTTP endpoints.
 *
 * @packageDocumentation
 */

// ─── App Factory ────────────────────────────────────────────────────────────
export { createApp } from "./app.js";
export type { AppOptions, ResourceValidator, ResourceValidationResult } from "./app.js";

// ─── FHIR Helpers ───────────────────────────────────────────────────────────
export {
  operationOutcome,
  allOk,
  notFound,
  gone,
  conflict,
  badRequest,
  serverError,
  notSupported,
  errorToOutcome,
  issueCodeToStatus,
} from "./fhir/outcomes.js";
export type {
  IssueSeverity,
  IssueCode,
  OperationOutcomeIssue,
  OperationOutcome,
  OutcomeWithStatus,
} from "./fhir/outcomes.js";

export {
  FHIR_JSON,
  buildETag,
  parseETag,
  buildLastModified,
  buildLocationHeader,
  buildResourceHeaders,
} from "./fhir/response.js";
export type { FhirResponseHeaders } from "./fhir/response.js";

export { buildCapabilityStatement } from "./fhir/metadata.js";
export type {
  CapabilityStatement,
  CapabilityStatementRest,
  CapabilityStatementRestResource,
  CapabilityStatementOptions,
} from "./fhir/metadata.js";

// ─── Routes ─────────────────────────────────────────────────────────────────
export { resourceRoutes } from "./routes/resource-routes.js";
export { metadataRoute } from "./routes/metadata-route.js";

// ─── Auth ───────────────────────────────────────────────────────────────────
export {
  initKeys,
  generateAccessToken,
  generateRefreshToken,
  verifyJwt,
  getJwks,
  generateSecret,
  buildAuthenticateToken,
  requireAuth,
  buildOperationContext,
  getOperationContext,
  registerLoginRoutes,
  registerTokenRoutes,
  seedDatabase,
} from "./auth/index.js";
export type {
  AccessTokenClaims,
  RefreshTokenClaims,
  JWKS,
  AuthState,
  OperationContext,
  SeedConfig,
  SeedResult,
} from "./auth/index.js";

// ─── Config ────────────────────────────────────────────────────────────────
export { loadConfig } from "./config.js";
export type {
  MedXAIServerConfig,
  DatabaseConfig,
  RedisConfig,
  SeedConfig as ServerSeedConfig,
} from "./config.js";

// ─── Terminology ───────────────────────────────────────────────────────────
export { seedConformanceResources } from "./terminology/seed-conformance.js";
export type {
  SeedConformanceOptions,
  SeedConformanceResult,
} from "./terminology/seed-conformance.js";

export { TerminologyService, TerminologyError } from "./terminology/terminology-service.js";
export type {
  Coding,
  ExpandResult,
  ValidateCodeResult,
  LookupResult,
} from "./terminology/terminology-service.js";
