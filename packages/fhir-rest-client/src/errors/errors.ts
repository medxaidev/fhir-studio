/**
 * fhir-client Error Types
 *
 * Typed error hierarchy for the FHIR client SDK.
 *
 * @module fhir-client/errors
 */

import type { OperationOutcome } from "../types/index.js";

// =============================================================================
// Section 1: Base Error
// =============================================================================

/**
 * Base error class for FHIR client errors.
 */
export class FhirClientError extends Error {
  readonly statusCode?: number;
  readonly operationOutcome?: OperationOutcome;

  constructor(
    message: string,
    statusCode?: number,
    operationOutcome?: OperationOutcome,
  ) {
    super(message);
    this.name = "FhirClientError";
    this.statusCode = statusCode;
    this.operationOutcome = operationOutcome;
  }
}

// =============================================================================
// Section 2: Specific Error Types
// =============================================================================

/**
 * Error with an OperationOutcome from the server.
 */
export class OperationOutcomeError extends FhirClientError {
  declare readonly operationOutcome: OperationOutcome;

  constructor(
    statusCode: number,
    operationOutcome: OperationOutcome,
    message?: string,
  ) {
    const msg =
      message ??
      operationOutcome.issue?.[0]?.diagnostics ??
      operationOutcome.issue?.[0]?.details?.text ??
      `Server error (${statusCode})`;
    super(msg, statusCode, operationOutcome);
    this.name = "OperationOutcomeError";
  }
}

/**
 * Network-level failure (no HTTP response received).
 */
export class NetworkError extends FhirClientError {
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, undefined, undefined);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/**
 * 401 and token refresh also failed.
 */
export class UnauthenticatedError extends FhirClientError {
  constructor(message?: string) {
    super(message ?? "Authentication failed", 401);
    this.name = "UnauthenticatedError";
  }
}

/**
 * 404 — Resource not found.
 */
export class ResourceNotFoundError extends OperationOutcomeError {
  constructor(operationOutcome: OperationOutcome, message?: string) {
    super(404, operationOutcome, message ?? "Resource not found");
    this.name = "ResourceNotFoundError";
  }
}
