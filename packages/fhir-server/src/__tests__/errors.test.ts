/**
 * Error Classes — Unit Tests
 *
 * Tests for fhir-server error hierarchy (ERR-01).
 */

import { describe, it, expect } from "vitest";
import {
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
} from "../error/errors.js";

// =============================================================================
// FhirServerError (base)
// =============================================================================

describe("FhirServerError", () => {
  it("carries statusCode, issueCode, and message", () => {
    const err = new FhirServerError(418, "processing", "I'm a teapot");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FhirServerError);
    expect(err.statusCode).toBe(418);
    expect(err.issueCode).toBe("processing");
    expect(err.message).toBe("I'm a teapot");
    expect(err.name).toBe("FhirServerError");
  });

  it("has a proper stack trace", () => {
    const err = new FhirServerError(500, "exception", "test");
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("FhirServerError");
  });
});

// =============================================================================
// 4xx Errors
// =============================================================================

describe("BadRequestError", () => {
  it("has status 400 and issue code 'invalid'", () => {
    const err = new BadRequestError("Missing field");
    expect(err.statusCode).toBe(400);
    expect(err.issueCode).toBe("invalid");
    expect(err.message).toBe("Missing field");
    expect(err.name).toBe("BadRequestError");
    expect(err).toBeInstanceOf(FhirServerError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("UnauthorizedError", () => {
  it("has status 401 and default message", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.issueCode).toBe("login");
    expect(err.message).toBe("Unauthorized");
    expect(err.name).toBe("UnauthorizedError");
  });

  it("accepts custom message", () => {
    const err = new UnauthorizedError("Token expired");
    expect(err.message).toBe("Token expired");
  });
});

describe("ForbiddenError", () => {
  it("has status 403 and default message", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.issueCode).toBe("forbidden");
    expect(err.message).toBe("Forbidden");
    expect(err.name).toBe("ForbiddenError");
  });

  it("accepts custom message", () => {
    const err = new ForbiddenError("Insufficient scope");
    expect(err.message).toBe("Insufficient scope");
  });
});

describe("ResourceNotFoundError", () => {
  it("has status 404 and carries resourceType/resourceId", () => {
    const err = new ResourceNotFoundError("Patient", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.issueCode).toBe("not-found");
    expect(err.resourceType).toBe("Patient");
    expect(err.resourceId).toBe("abc-123");
    expect(err.message).toBe("Patient/abc-123 not found");
    expect(err.name).toBe("ResourceNotFoundError");
  });
});

describe("MethodNotAllowedError", () => {
  it("has status 405", () => {
    const err = new MethodNotAllowedError("PATCH not supported for this resource");
    expect(err.statusCode).toBe(405);
    expect(err.issueCode).toBe("not-supported");
    expect(err.name).toBe("MethodNotAllowedError");
  });
});

describe("ConflictError", () => {
  it("has status 409", () => {
    const err = new ConflictError("Version mismatch: expected v1, got v2");
    expect(err.statusCode).toBe(409);
    expect(err.issueCode).toBe("conflict");
    expect(err.message).toContain("Version mismatch");
    expect(err.name).toBe("ConflictError");
  });
});

describe("ResourceGoneError", () => {
  it("has status 410 and carries resourceType/resourceId", () => {
    const err = new ResourceGoneError("Observation", "xyz");
    expect(err.statusCode).toBe(410);
    expect(err.issueCode).toBe("deleted");
    expect(err.resourceType).toBe("Observation");
    expect(err.resourceId).toBe("xyz");
    expect(err.message).toContain("has been deleted");
    expect(err.name).toBe("ResourceGoneError");
  });
});

describe("PreconditionFailedError", () => {
  it("has status 412 and default message", () => {
    const err = new PreconditionFailedError();
    expect(err.statusCode).toBe(412);
    expect(err.issueCode).toBe("conflict");
    expect(err.message).toBe("Precondition Failed");
    expect(err.name).toBe("PreconditionFailedError");
  });

  it("accepts custom message", () => {
    const err = new PreconditionFailedError("If-Match header mismatch");
    expect(err.message).toBe("If-Match header mismatch");
  });
});

describe("ValidationError", () => {
  it("has status 422 and carries issues array", () => {
    const issues = [
      { severity: "error", code: "required", diagnostics: "Patient.name is required" },
    ];
    const err = new ValidationError("Validation failed", issues);
    expect(err.statusCode).toBe(422);
    expect(err.issueCode).toBe("processing");
    expect(err.issues).toEqual(issues);
    expect(err.name).toBe("ValidationError");
  });

  it("creates default issues when none provided", () => {
    const err = new ValidationError("Bad resource");
    expect(err.issues).toHaveLength(1);
    expect(err.issues[0].diagnostics).toBe("Bad resource");
  });
});

describe("TooManyRequestsError", () => {
  it("has status 429 and default message", () => {
    const err = new TooManyRequestsError();
    expect(err.statusCode).toBe(429);
    expect(err.issueCode).toBe("throttled");
    expect(err.message).toBe("Rate limit exceeded");
    expect(err.name).toBe("TooManyRequestsError");
  });
});

// =============================================================================
// 5xx Errors
// =============================================================================

describe("InternalServerError", () => {
  it("has status 500 and default message", () => {
    const err = new InternalServerError();
    expect(err.statusCode).toBe(500);
    expect(err.issueCode).toBe("exception");
    expect(err.message).toBe("Internal server error");
    expect(err.name).toBe("InternalServerError");
  });

  it("accepts custom message", () => {
    const err = new InternalServerError("Database connection lost");
    expect(err.message).toBe("Database connection lost");
  });
});

// =============================================================================
// Inheritance chain
// =============================================================================

describe("Error inheritance chain", () => {
  it("all errors extend FhirServerError", () => {
    const errors = [
      new BadRequestError("x"),
      new UnauthorizedError(),
      new ForbiddenError(),
      new ResourceNotFoundError("Patient", "1"),
      new MethodNotAllowedError("x"),
      new ConflictError("x"),
      new ResourceGoneError("Patient", "1"),
      new PreconditionFailedError(),
      new ValidationError("x"),
      new TooManyRequestsError(),
      new InternalServerError(),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(FhirServerError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});
