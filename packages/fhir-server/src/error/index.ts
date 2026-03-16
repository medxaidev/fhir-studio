/**
 * Error Layer — Barrel Export
 *
 * @module fhir-server/error
 */

// ── Error Classes ────────────────────────────────────────────────────────────
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
} from "./errors.js";

// ── OperationOutcome Builders ────────────────────────────────────────────────
export {
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
} from "./outcomes.js";
export type { OutcomeWithStatus } from "./outcomes.js";

// ── Response Helpers ─────────────────────────────────────────────────────────
export {
  FHIR_JSON,
  buildETag,
  parseETag,
  buildLastModified,
  buildLocationHeader,
  buildResourceHeaders,
} from "./response.js";
export type { FhirResponseHeaders } from "./response.js";

// ── Error Handler ────────────────────────────────────────────────────────────
export { fhirErrorHandler } from "./error-handler.js";
