/**
 * OperationOutcome Builders — Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  ResourceNotFoundError,
  ResourceGoneError,
  ResourceVersionConflictError,
  RepositoryError,
} from "@medxai/fhir-persistence";
import {
  operationOutcome,
  allOk,
  notFound,
  gone,
  conflict,
  badRequest,
  serverError,
  notSupported,
  errorToOutcome,
  issueCodeToStatus,
} from "../fhir/outcomes.js";

describe("OperationOutcome builders", () => {
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

  it("notFound creates a 404 outcome", () => {
    const oo = notFound("Patient", "123");
    expect(oo.issue[0].code).toBe("not-found");
    expect(oo.issue[0].diagnostics).toContain("Patient/123");
  });

  it("gone creates a 410 outcome", () => {
    const oo = gone("Patient", "123");
    expect(oo.issue[0].code).toBe("deleted");
    expect(oo.issue[0].diagnostics).toContain("deleted");
  });

  it("conflict creates a 409 outcome", () => {
    const oo = conflict("Version mismatch");
    expect(oo.issue[0].code).toBe("conflict");
    expect(oo.issue[0].diagnostics).toBe("Version mismatch");
  });

  it("badRequest creates a 400 outcome", () => {
    const oo = badRequest("Missing required field");
    expect(oo.issue[0].code).toBe("invalid");
  });

  it("serverError creates a 500 outcome", () => {
    const oo = serverError();
    expect(oo.issue[0].code).toBe("exception");
    expect(oo.issue[0].diagnostics).toBe("Internal server error");
  });

  it("notSupported creates a 405 outcome", () => {
    const oo = notSupported("PATCH not supported");
    expect(oo.issue[0].code).toBe("not-supported");
  });
});

describe("errorToOutcome", () => {
  it("maps ResourceNotFoundError to 404", () => {
    const err = new ResourceNotFoundError("Patient", "123");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(404);
    expect(outcome.issue[0].code).toBe("not-found");
  });

  it("maps ResourceGoneError to 410", () => {
    const err = new ResourceGoneError("Patient", "123");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(410);
    expect(outcome.issue[0].code).toBe("deleted");
  });

  it("maps ResourceVersionConflictError to 409", () => {
    const err = new ResourceVersionConflictError("Patient", "123", "v1", "v2");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(409);
    expect(outcome.issue[0].code).toBe("conflict");
  });

  it("maps generic RepositoryError to 400", () => {
    const err = new RepositoryError("Bad data");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(400);
    expect(outcome.issue[0].code).toBe("invalid");
  });

  it("maps generic Error to 500", () => {
    const err = new Error("Something broke");
    const { status, outcome } = errorToOutcome(err);
    expect(status).toBe(500);
    expect(outcome.issue[0].code).toBe("exception");
  });

  it("maps unknown value to 500", () => {
    const { status, outcome } = errorToOutcome("string error");
    expect(status).toBe(500);
    expect(outcome.issue[0].diagnostics).toBe("Unknown error");
  });
});

describe("issueCodeToStatus", () => {
  it("maps not-found to 404", () => expect(issueCodeToStatus("not-found")).toBe(404));
  it("maps deleted to 410", () => expect(issueCodeToStatus("deleted")).toBe(410));
  it("maps conflict to 409", () => expect(issueCodeToStatus("conflict")).toBe(409));
  it("maps invalid to 400", () => expect(issueCodeToStatus("invalid")).toBe(400));
  it("maps not-supported to 405", () => expect(issueCodeToStatus("not-supported")).toBe(405));
  it("maps informational to 200", () => expect(issueCodeToStatus("informational")).toBe(200));
  it("maps exception to 500", () => expect(issueCodeToStatus("exception")).toBe(500));
});
