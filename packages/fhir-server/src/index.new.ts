/**
 * fhir-server — FHIR R4 REST API Server
 *
 * Public API barrel for the fhir-server package (v0.1.0).
 *
 * Architecture: Layer 3 HTTP wrapper over fhir-engine.
 * See: devdocs/architecture/ARCHITECTURE-fhir-server.md
 *
 * @module fhir-server
 */

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  // FHIR R4 Base Types
  ResourceMeta,
  Coding,
  Resource,
  PersistedResource,
  BundleLink,
  BundleEntryRequest,
  BundleEntryResponse,
  BundleEntry,
  Bundle,
  IssueSeverity,
  IssueCode,
  OperationOutcomeIssue,
  OperationOutcome,
  CapabilityStatement,
  CapabilityStatementRest,
  CapabilityStatementRestResource,
  HistoryEntry,
  SearchOptions,
  SearchResult,
  // Engine Interface Contract
  FhirEngine,
  FhirPersistence,
  FhirRuntime,
  FhirDefinitions,
  ValidationResult,
  EngineContext,
  FhirEnginePlugin,
  // Server Configuration
  FhirServerOptions,
  AuthConfig,
  CorsConfig,
  RateLimitConfig,
} from "./types/index.js";

// ─── Server ──────────────────────────────────────────────────────────────────
export { FhirServer } from "./server/index.js";

// ─── Error ───────────────────────────────────────────────────────────────────
export {
  FhirServerError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ResourceNotFoundError,
  MethodNotAllowedError,
  ConflictError,
  ResourceGoneError,
  PreconditionFailedError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
  operationOutcome,
  allOk,
  notFound,
  gone,
  conflict,
  badRequest,
  serverError,
  notSupported,
  unauthorized,
  forbidden,
  errorToOutcome,
  issueCodeToStatus,
  FHIR_JSON,
  buildETag,
  parseETag,
  buildLastModified,
  buildLocationHeader,
  buildResourceHeaders,
  fhirErrorHandler,
} from "./error/index.js";
export type { OutcomeWithStatus, FhirResponseHeaders } from "./error/index.js";

// ─── Middleware ──────────────────────────────────────────────────────────────
export { registerSecurityHeaders } from "./middleware/security.js";
export { registerCors } from "./middleware/cors.js";
export { registerRateLimit } from "./middleware/rate-limit.js";
export { registerRequestLogger } from "./middleware/request-logger.js";
export { registerRequestContext } from "./middleware/context.js";

// ─── Router ─────────────────────────────────────────────────────────────────
export { fhirRouter } from "./router/fhir-router.js";

// ─── Capability ─────────────────────────────────────────────────────────────
export {
  generateCapabilityStatement,
  cacheCapabilityStatement,
} from "./capability/index.js";
