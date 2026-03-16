/**
 * FHIR OperationOutcome Builders
 *
 * Maps server errors to FHIR R4 OperationOutcome resources with
 * appropriate issue codes and HTTP status codes.
 *
 * Adapted from medxai/fhir-server outcomes.ts — no external dependencies.
 *
 * Reference: https://hl7.org/fhir/R4/operationoutcome.html
 *
 * @module fhir-server/error
 */

import type {
  IssueSeverity,
  IssueCode,
  OperationOutcome,
  OperationOutcomeIssue,
} from "../types/fhir.js";
import { FhirServerError } from "./errors.js";

// =============================================================================
// Section 1: Outcome Builders
// =============================================================================

/**
 * Build an OperationOutcome from a single issue.
 */
export function operationOutcome(
  severity: IssueSeverity,
  code: IssueCode,
  diagnostics?: string,
): OperationOutcome {
  const issue: OperationOutcomeIssue = { severity, code };
  if (diagnostics) {
    issue.diagnostics = diagnostics;
  }
  return { resourceType: "OperationOutcome", issue: [issue] };
}

/**
 * Build a success OperationOutcome (used for delete responses).
 */
export function allOk(diagnostics?: string): OperationOutcome {
  return operationOutcome("information", "informational", diagnostics ?? "All OK");
}

/**
 * Build a "not found" OperationOutcome.
 */
export function notFound(resourceType: string, id: string): OperationOutcome {
  return operationOutcome("error", "not-found", `${resourceType}/${id} not found`);
}

/**
 * Build a "gone" OperationOutcome (deleted resource).
 */
export function gone(resourceType: string, id: string): OperationOutcome {
  return operationOutcome("error", "deleted", `${resourceType}/${id} has been deleted`);
}

/**
 * Build a "conflict" OperationOutcome (version mismatch).
 */
export function conflict(diagnostics: string): OperationOutcome {
  return operationOutcome("error", "conflict", diagnostics);
}

/**
 * Build a "bad request" OperationOutcome (invalid input).
 */
export function badRequest(diagnostics: string): OperationOutcome {
  return operationOutcome("error", "invalid", diagnostics);
}

/**
 * Build an "internal server error" OperationOutcome.
 */
export function serverError(diagnostics?: string): OperationOutcome {
  return operationOutcome("error", "exception", diagnostics ?? "Internal server error");
}

/**
 * Build a "not supported" OperationOutcome.
 */
export function notSupported(diagnostics: string): OperationOutcome {
  return operationOutcome("error", "not-supported", diagnostics);
}

/**
 * Build an "unauthorized" OperationOutcome.
 */
export function unauthorized(diagnostics?: string): OperationOutcome {
  return operationOutcome("error", "login", diagnostics ?? "Unauthorized");
}

/**
 * Build a "forbidden" OperationOutcome.
 */
export function forbidden(diagnostics?: string): OperationOutcome {
  return operationOutcome("error", "forbidden", diagnostics ?? "Forbidden");
}

// =============================================================================
// Section 2: Outcome with Status
// =============================================================================

/**
 * OperationOutcome paired with HTTP status code.
 */
export interface OutcomeWithStatus {
  outcome: OperationOutcome;
  status: number;
}

/**
 * Map any error to an OutcomeWithStatus.
 *
 * This is the central error-to-FHIR mapping function used by the
 * global error handler.
 */
export function errorToOutcome(err: unknown): OutcomeWithStatus {
  // FhirServerError carries its own statusCode and issueCode
  if (err instanceof FhirServerError) {
    return {
      status: err.statusCode,
      outcome: operationOutcome("error", err.issueCode as IssueCode, err.message),
    };
  }

  // fhir-persistence RepositoryError subclasses (detected by error.name)
  if (err instanceof Error) {
    switch (err.name) {
      case "ResourceNotFoundError":
        return { status: 404, outcome: operationOutcome("error", "not-found", err.message) };
      case "ResourceGoneError":
        return { status: 410, outcome: operationOutcome("error", "deleted", err.message) };
      case "ResourceVersionConflictError":
        return { status: 409, outcome: operationOutcome("error", "conflict", err.message) };
    }

    // Generic Error
    return {
      status: 500,
      outcome: serverError(err.message),
    };
  }

  // Unknown
  return {
    status: 500,
    outcome: serverError("Unknown error"),
  };
}

// =============================================================================
// Section 3: HTTP Status Helpers
// =============================================================================

/**
 * Get the HTTP status code for an OperationOutcome issue code.
 */
export function issueCodeToStatus(code: IssueCode): number {
  switch (code) {
    case "not-found":
      return 404;
    case "deleted":
      return 410;
    case "conflict":
      return 409;
    case "invalid":
    case "structure":
    case "required":
    case "value":
      return 400;
    case "not-supported":
      return 405;
    case "login":
      return 401;
    case "forbidden":
      return 403;
    case "processing":
      return 422;
    case "throttled":
    case "too-costly":
      return 429;
    case "informational":
      return 200;
    case "security":
      return 403;
    case "exception":
    default:
      return 500;
  }
}
