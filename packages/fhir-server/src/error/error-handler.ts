/**
 * Fastify Global Error Handler
 *
 * Converts all errors to FHIR R4 OperationOutcome responses.
 * Registered via `fastify.setErrorHandler()`.
 *
 * @module fhir-server/error
 */

import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { FHIR_JSON } from "./response.js";
import { errorToOutcome } from "./outcomes.js";

// =============================================================================
// Section 1: Type Guards
// =============================================================================

/**
 * Fastify validation error shape (e.g., schema validation failures).
 */
interface FastifyValidationError extends Error {
  validation: unknown[];
  validationContext?: string;
}

/**
 * Type guard for Fastify validation errors.
 */
function isFastifyValidationError(error: unknown): error is FastifyValidationError {
  return (
    error instanceof Error &&
    "validation" in error &&
    Array.isArray((error as FastifyValidationError).validation)
  );
}

// =============================================================================
// Section 2: Error Handler
// =============================================================================

/**
 * Global Fastify error handler.
 *
 * Converts all errors into FHIR R4 OperationOutcome responses with
 * appropriate HTTP status codes.
 */
export function fhirErrorHandler(
  error: FastifyError | Error | unknown,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Fastify validation errors (e.g., missing body, schema validation)
  if (isFastifyValidationError(error)) {
    reply
      .status(400)
      .header("content-type", FHIR_JSON)
      .send({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "invalid",
            diagnostics: (error as Error).message,
          },
        ],
      });
    return;
  }

  // Map all other errors to OperationOutcome
  if (error instanceof Error) {
    console.error(`[ErrorHandler] ${error.name}: ${error.message}`);
    if (error.stack) console.error(error.stack.split("\n").slice(0, 3).join("\n"));
  }
  const { status, outcome } = errorToOutcome(error);
  reply.status(status).header("content-type", FHIR_JSON).send(outcome);
}
