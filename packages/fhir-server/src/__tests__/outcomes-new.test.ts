/**
 * OperationOutcome Builders — Unit Tests (New Error Layer)
 *
 * Tests for fhir-server/error/outcomes.ts (ERR-02).
 */

import { describe, it, expect } from "vitest";
import {
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
} from "../error/outcomes.js";
import {
  FhirServerError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ResourceNotFoundError,
  ConflictError,
  ResourceGoneError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
} from "../error/errors.js";

// =============================================================================
// Outcome Builders
// =============================================================================

describe("OperationOutcome builders (new)", () => {
  it("operationOutcome creates a valid OperationOutcome", () => {
    const oo = operationOutcome("error", "not-found", "Patient/123 not found");
    expect(oo.resourceType).toBe("OperationOutcome");
    expect(oo.issue).toHaveLength(1);
    expect(oo.issue[0].severity).toBe("error");
    expect(oo.issue[0].code).toBe("not-found");
    expect(oo.issue[0].diagnostics).toBe("Patient/123 not found");
  });

  it("operationOutcome omits diagnostics when not provided", () => {
    const oo = operationOutcome("warning", "invalid");
    expect(oo.issue[0].diagnostics).toBeUndefined();
  });

  it("allOk creates an informational outcome", () => {
    const oo = allOk();
    expect(oo.issue[0].severity).toBe("information");
    expect(oo.issue[0].code).toBe("informational");
    expect(oo.issue[0].diagnostics).toBe("All OK");
  });

  it("allOk accepts custom diagnostics", () => {
    const oo = allOk("Deleted Patient/123");
    expect(oo.issue[0].diagnostics).toBe("Deleted Patient/123");
  });

  it("notFound creates outcome with not-found code", () => {
    const oo = notFound("Patient", "123");
    expect(oo.issue[0].code).toBe("not-found");
    expect(oo.issue[0].diagnostics).toContain("Patient/123");
  });

  it("gone creates outcome with deleted code", () => {
    const oo = gone("Patient", "123");
    expect(oo.issue[0].code).toBe("deleted");
    expect(oo.issue[0].diagnostics).toContain("deleted");
  });

  it("conflict creates outcome with conflict code", () => {
    const oo = conflict("Version mismatch");
    expect(oo.issue[0].code).toBe("conflict");
    expect(oo.issue[0].diagnostics).toBe("Version mismatch");
  });

  it("badRequest creates outcome with invalid code", () => {
    const oo = badRequest("Missing required field");
    expect(oo.issue[0].code).toBe("invalid");
  });

  it("serverError creates outcome with exception code", () => {
    const oo = serverError();
    expect(oo.issue[0].code).toBe("exception");
    expect(oo.issue[0].diagnostics).toBe("Internal server error");
  });

  it("serverError accepts custom diagnostics", () => {
    const oo = serverError("DB connection lost");
    expect(oo.issue[0].diagnostics).toBe("DB connection lost");
  });

  it("notSupported creates outcome with not-supported code", () => {
    const oo = notSupported("PATCH not supported");
    expect(oo.issue[0].code).toBe("not-supported");
  });

  it("unauthorized creates outcome with login code", () => {
    const oo = unauthorized();
    expect(oo.issue[0].code).toBe("login");
    expect(oo.issue[0].diagnostics).toBe("Unauthorized");
  });

  it("unauthorized accepts custom diagnostics", () => {
    const oo = unauthorized("Token expired");
    expect(oo.issue[0].diagnostics).toBe("Token expired");
  });

  it("forbidden creates outcome with forbidden code", () => {
    const oo = forbidden();
    expect(oo.issue[0].code).toBe("forbidden");
    expect(oo.issue[0].diagnostics).toBe("Forbidden");
  });

  it("forbidden accepts custom diagnostics", () => {
    const oo = forbidden("Insufficient scope");
    expect(oo.issue[0].diagnostics).toBe("Insufficient scope");
  });
});

// =============================================================================
// errorToOutcome
// =============================================================================

describe("errorToOutcome (new)", () => {
  it("maps BadRequestError to 400", () => {
    const err = new BadRequestError("Bad input");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(400);
    expect(outcome.issue[0].code).toBe("invalid");
    expect(outcome.issue[0].diagnostics).toBe("Bad input");
  });

  it("maps UnauthorizedError to 401", () => {
    const err = new UnauthorizedError();
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(401);
    expect(outcome.issue[0].code).toBe("login");
  });

  it("maps ForbiddenError to 403", () => {
    const err = new ForbiddenError();
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(403);
    expect(outcome.issue[0].code).toBe("forbidden");
  });

  it("maps ResourceNotFoundError to 404", () => {
    const err = new ResourceNotFoundError("Patient", "123");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(404);
    expect(outcome.issue[0].code).toBe("not-found");
  });

  it("maps ConflictError to 409", () => {
    const err = new ConflictError("Version mismatch");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(409);
    expect(outcome.issue[0].code).toBe("conflict");
  });

  it("maps ResourceGoneError to 410", () => {
    const err = new ResourceGoneError("Patient", "123");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(410);
    expect(outcome.issue[0].code).toBe("deleted");
  });

  it("maps ValidationError to 422", () => {
    const err = new ValidationError("Invalid resource");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(422);
    expect(outcome.issue[0].code).toBe("processing");
  });

  it("maps TooManyRequestsError to 429", () => {
    const err = new TooManyRequestsError();
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(429);
    expect(outcome.issue[0].code).toBe("throttled");
  });

  it("maps InternalServerError to 500", () => {
    const err = new InternalServerError();
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(500);
    expect(outcome.issue[0].code).toBe("exception");
  });

  it("maps FhirServerError with custom codes", () => {
    const err = new FhirServerError(418, "processing", "I'm a teapot");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(418);
    expect(outcome.issue[0].code).toBe("processing");
    expect(outcome.issue[0].diagnostics).toBe("I'm a teapot");
  });

  it("maps generic Error to 500", () => {
    const err = new Error("Something broke");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(500);
    expect(outcome.issue[0].code).toBe("exception");
    expect(outcome.issue[0].diagnostics).toBe("Something broke");
  });

  it("maps unknown value to 500", () => {
    const { status, outcome } = errorToOutcome("string error");
    expect(status).toBe(500);
    expect(outcome.issue[0].diagnostics).toBe("Unknown error");
  });

  it("maps null to 500", () => {
    const { status, outcome } = errorToOutcome(null);
    expect(status).toBe(500);
    expect(outcome.issue[0].diagnostics).toBe("Unknown error");
  });
});

// =============================================================================
// issueCodeToStatus
// =============================================================================

describe("issueCodeToStatus (new)", () => {
  it("maps not-found to 404", () => expect(issueCodeToStatus("not-found")).toBe(404));
  it("maps deleted to 410", () => expect(issueCodeToStatus("deleted")).toBe(410));
  it("maps conflict to 409", () => expect(issueCodeToStatus("conflict")).toBe(409));
  it("maps invalid to 400", () => expect(issueCodeToStatus("invalid")).toBe(400));
  it("maps structure to 400", () => expect(issueCodeToStatus("structure")).toBe(400));
  it("maps required to 400", () => expect(issueCodeToStatus("required")).toBe(400));
  it("maps value to 400", () => expect(issueCodeToStatus("value")).toBe(400));
  it("maps not-supported to 405", () => expect(issueCodeToStatus("not-supported")).toBe(405));
  it("maps login to 401", () => expect(issueCodeToStatus("login")).toBe(401));
  it("maps forbidden to 403", () => expect(issueCodeToStatus("forbidden")).toBe(403));
  it("maps processing to 422", () => expect(issueCodeToStatus("processing")).toBe(422));
  it("maps throttled to 429", () => expect(issueCodeToStatus("throttled")).toBe(429));
  it("maps too-costly to 429", () => expect(issueCodeToStatus("too-costly")).toBe(429));
  it("maps informational to 200", () => expect(issueCodeToStatus("informational")).toBe(200));
  it("maps security to 403", () => expect(issueCodeToStatus("security")).toBe(403));
  it("maps exception to 500", () => expect(issueCodeToStatus("exception")).toBe(500));
});
