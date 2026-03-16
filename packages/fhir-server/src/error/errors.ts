/**
 * FhirServer Error Classes
 *
 * Typed error hierarchy for fhir-server. Each error class maps to
 * a specific HTTP status code and OperationOutcome issue code.
 *
 * @module fhir-server/error
 */

// =============================================================================
// Section 1: Base Error
// =============================================================================

/**
 * Base error for all fhir-server errors.
 *
 * Carries an HTTP status code and an OperationOutcome issue code
 * for the global error handler to use.
 */
export class FhirServerError extends Error {
  readonly statusCode: number;
  readonly issueCode: string;

  constructor(statusCode: number, issueCode: string, message: string) {
    super(message);
    this.name = "FhirServerError";
    this.statusCode = statusCode;
    this.issueCode = issueCode;
  }
}

// =============================================================================
// Section 2: 4xx Errors
// =============================================================================

/**
 * 400 Bad Request — invalid input, malformed JSON, missing required fields.
 */
export class BadRequestError extends FhirServerError {
  constructor(message: string) {
    super(400, "invalid", message);
    this.name = "BadRequestError";
  }
}

/**
 * 401 Unauthorized — missing or invalid authentication.
 */
export class UnauthorizedError extends FhirServerError {
  constructor(message = "Unauthorized") {
    super(401, "login", message);
    this.name = "UnauthorizedError";
  }
}

/**
 * 403 Forbidden — authenticated but insufficient permissions.
 */
export class ForbiddenError extends FhirServerError {
  constructor(message = "Forbidden") {
    super(403, "forbidden", message);
    this.name = "ForbiddenError";
  }
}

/**
 * 404 Not Found — resource does not exist.
 */
export class ResourceNotFoundError extends FhirServerError {
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(404, "not-found", `${resourceType}/${resourceId} not found`);
    this.name = "ResourceNotFoundError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * 405 Method Not Allowed — unsupported interaction.
 */
export class MethodNotAllowedError extends FhirServerError {
  constructor(message: string) {
    super(405, "not-supported", message);
    this.name = "MethodNotAllowedError";
  }
}

/**
 * 409 Conflict — version conflict (ETag mismatch).
 */
export class ConflictError extends FhirServerError {
  constructor(message: string) {
    super(409, "conflict", message);
    this.name = "ConflictError";
  }
}

/**
 * 410 Gone — resource has been deleted.
 */
export class ResourceGoneError extends FhirServerError {
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(410, "deleted", `${resourceType}/${resourceId} has been deleted`);
    this.name = "ResourceGoneError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * 412 Precondition Failed — If-Match header mismatch.
 */
export class PreconditionFailedError extends FhirServerError {
  constructor(message = "Precondition Failed") {
    super(412, "conflict", message);
    this.name = "PreconditionFailedError";
  }
}

/**
 * 422 Unprocessable Entity — validation failure.
 */
export class ValidationError extends FhirServerError {
  readonly issues: Array<{ severity: string; code: string; diagnostics: string }>;

  constructor(message: string, issues?: Array<{ severity: string; code: string; diagnostics: string }>) {
    super(422, "processing", message);
    this.name = "ValidationError";
    this.issues = issues ?? [{ severity: "error", code: "processing", diagnostics: message }];
  }
}

/**
 * 429 Too Many Requests — rate limit exceeded.
 */
export class TooManyRequestsError extends FhirServerError {
  constructor(message = "Rate limit exceeded") {
    super(429, "throttled", message);
    this.name = "TooManyRequestsError";
  }
}

// =============================================================================
// Section 3: 5xx Errors
// =============================================================================

/**
 * 500 Internal Server Error — unexpected server failure.
 */
export class InternalServerError extends FhirServerError {
  constructor(message = "Internal server error") {
    super(500, "exception", message);
    this.name = "InternalServerError";
  }
}
