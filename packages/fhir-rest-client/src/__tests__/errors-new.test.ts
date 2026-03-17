/**
 * Error Layer Tests (ERR-01)
 */

import { describe, it, expect } from "vitest";
import {
  FhirClientError,
  OperationOutcomeError,
  NetworkError,
  UnauthenticatedError,
  ResourceNotFoundError,
} from "../errors/errors.js";

describe("FhirClientError", () => {
  it("has message and statusCode", () => {
    const err = new FhirClientError("test error", 400);
    expect(err.message).toBe("test error");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("FhirClientError");
  });

  it("instanceof Error", () => {
    expect(new FhirClientError("x")).toBeInstanceOf(Error);
  });

  it("optional operationOutcome", () => {
    const oo = { resourceType: "OperationOutcome" as const, issue: [{ severity: "error", code: "invalid" }] };
    const err = new FhirClientError("x", 422, oo);
    expect(err.operationOutcome).toBe(oo);
  });

  it("statusCode is optional", () => {
    const err = new FhirClientError("no status");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("OperationOutcomeError", () => {
  const oo = { resourceType: "OperationOutcome" as const, issue: [{ severity: "error", code: "invalid", diagnostics: "Bad data" }] };

  it("extracts diagnostics as message", () => {
    const err = new OperationOutcomeError(422, oo);
    expect(err.message).toBe("Bad data");
    expect(err.statusCode).toBe(422);
    expect(err.operationOutcome).toBe(oo);
  });

  it("custom message overrides diagnostics", () => {
    const err = new OperationOutcomeError(422, oo, "custom msg");
    expect(err.message).toBe("custom msg");
  });

  it("instanceof FhirClientError", () => {
    expect(new OperationOutcomeError(400, oo)).toBeInstanceOf(FhirClientError);
  });

  it("name is OperationOutcomeError", () => {
    expect(new OperationOutcomeError(400, oo).name).toBe("OperationOutcomeError");
  });
});

describe("NetworkError", () => {
  it("has no statusCode", () => {
    const err = new NetworkError("offline");
    expect(err.statusCode).toBeUndefined();
    expect(err.name).toBe("NetworkError");
  });

  it("stores cause", () => {
    const cause = new TypeError("fetch failed");
    const err = new NetworkError("offline", cause);
    expect(err.cause).toBe(cause);
  });

  it("instanceof FhirClientError", () => {
    expect(new NetworkError("x")).toBeInstanceOf(FhirClientError);
  });
});

describe("UnauthenticatedError", () => {
  it("default message", () => {
    const err = new UnauthenticatedError();
    expect(err.message).toBe("Authentication failed");
    expect(err.statusCode).toBe(401);
  });

  it("custom message", () => {
    expect(new UnauthenticatedError("token expired").message).toBe("token expired");
  });

  it("instanceof FhirClientError", () => {
    expect(new UnauthenticatedError()).toBeInstanceOf(FhirClientError);
  });
});

describe("ResourceNotFoundError", () => {
  const oo = { resourceType: "OperationOutcome" as const, issue: [{ severity: "error", code: "not-found" }] };

  it("default message", () => {
    const err = new ResourceNotFoundError(oo);
    expect(err.message).toBe("Resource not found");
    expect(err.statusCode).toBe(404);
  });

  it("instanceof OperationOutcomeError", () => {
    expect(new ResourceNotFoundError(oo)).toBeInstanceOf(OperationOutcomeError);
  });

  it("instanceof FhirClientError", () => {
    expect(new ResourceNotFoundError(oo)).toBeInstanceOf(FhirClientError);
  });
});
