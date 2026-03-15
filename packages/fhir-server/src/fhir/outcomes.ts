/**
 * FHIR OperationOutcome Builders
 *
 * Maps repository errors and other server errors to FHIR R4 OperationOutcome
 * resources with appropriate issue codes and HTTP status codes.
 *
 * Reference: https://hl7.org/fhir/R4/operationoutcome.html
 *
 * @module fhir-server/fhir
 */

import {
  RepositoryError,
  ResourceNotFoundError,
  ResourceGoneError,
  ResourceVersionConflictError,
} from "@medxai/fhir-persistence";

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * FHIR OperationOutcome issue severity.
 */
export type IssueSeverity = "fatal" | "error" | "warning" | "information";

/**
 * FHIR OperationOutcome issue type code (subset used by this server).
 *
 * See: https://hl7.org/fhir/R4/valueset-issue-type.html
 */
export type IssueCode =
  | "invalid"
  | "structure"
  | "required"
  | "value"
  | "not-found"
  | "deleted"
  | "conflict"
  | "exception"
  | "informational"
  | "not-supported";

/**
 * A single issue within an OperationOutcome.
 */
export interface OperationOutcomeIssue {
  severity: IssueSeverity;
  code: IssueCode;
  diagnostics?: string;
  expression?: string[];
}

/**
 * FHIR R4 OperationOutcome resource.
 */
export interface OperationOutcome {
  resourceType: "OperationOutcome";
  issue: OperationOutcomeIssue[];
}

/**
 * Mapping from OperationOutcome to HTTP status code.
 */
export interface OutcomeWithStatus {
  outcome: OperationOutcome;
  status: number;
}

// =============================================================================
// Section 2: Builders
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

// =============================================================================
// Section 3: Error → OutcomeWithStatus Mapping
// =============================================================================

/**
 * Map a repository error (or any Error) to an OutcomeWithStatus.
 *
 * This is the central error-to-FHIR mapping function used by the
 * global error handler.
 */
export function errorToOutcome(err: unknown): OutcomeWithStatus {
  if (err instanceof ResourceNotFoundError) {
    return {
      status: 404,
      outcome: notFound(err.resourceType, err.resourceId),
    };
  }

  if (err instanceof ResourceGoneError) {
    return {
      status: 410,
      outcome: gone(err.resourceType, err.resourceId),
    };
  }

  if (err instanceof ResourceVersionConflictError) {
    return {
      status: 409,
      outcome: conflict(err.message),
    };
  }

  if (err instanceof RepositoryError) {
    return {
      status: 400,
      outcome: badRequest(err.message),
    };
  }

  if (err instanceof Error) {
    return {
      status: 500,
      outcome: serverError(err.message),
    };
  }

  return {
    status: 500,
    outcome: serverError("Unknown error"),
  };
}

// =============================================================================
// Section 4: HTTP Status Helpers
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
    case "informational":
      return 200;
    case "exception":
    default:
      return 500;
  }
}
