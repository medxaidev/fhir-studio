/**
 * AccessPolicy — Unit Tests (AUTH-05)
 */

import { describe, it, expect } from "vitest";
import {
  supportsInteraction,
  canPerformInteraction,
  parseAccessPolicy,
  buildDefaultAccessPolicy,
  getSearchCriteria,
  parseCriteriaString,
} from "../auth-v2/access-policy.js";
import type {
  ParsedAccessPolicy,
  FhirInteraction,
} from "../auth-v2/access-policy.js";
import type { OperationContext } from "../auth-v2/middleware.js";
import type { PersistedResource } from "../types/fhir.js";

// =============================================================================
// Helpers
// =============================================================================

function ctx(overrides?: Partial<OperationContext>): OperationContext {
  return { author: "Practitioner/p-1", superAdmin: false, ...overrides };
}

function resource(type: string, id = "1"): PersistedResource {
  return { resourceType: type, id, meta: { versionId: "1", lastUpdated: "" } };
}

const wildcardPolicy: ParsedAccessPolicy = {
  resource: [{ resourceType: "*" }],
};

const readonlyPolicy: ParsedAccessPolicy = {
  resource: [{ resourceType: "*", readonly: true }],
};

const patientOnlyPolicy: ParsedAccessPolicy = {
  resource: [{ resourceType: "Patient" }],
};

const interactionPolicy: ParsedAccessPolicy = {
  resource: [{ resourceType: "Patient", interaction: ["read", "search"] }],
};

const criteriaPolicy: ParsedAccessPolicy = {
  resource: [
    { resourceType: "Patient", criteria: "Patient?general-practitioner=Practitioner/p-1" },
  ],
};

// =============================================================================
// Layer 1: supportsInteraction
// =============================================================================

describe("supportsInteraction (Layer 1)", () => {
  it("allows any interaction without AccessPolicy (superAdmin/system)", () => {
    expect(supportsInteraction("create", "Patient", ctx())).toBe(true);
    expect(supportsInteraction("delete", "Observation", ctx())).toBe(true);
  });

  it("blocks protected types for non-superAdmin", () => {
    expect(supportsInteraction("read", "Login", ctx())).toBe(false);
    expect(supportsInteraction("read", "JsonWebKey", ctx())).toBe(false);
  });

  it("allows protected types for superAdmin", () => {
    expect(supportsInteraction("read", "Login", ctx({ superAdmin: true }))).toBe(true);
  });

  it("matches wildcard policy for regular types", () => {
    expect(supportsInteraction("create", "Patient", ctx(), wildcardPolicy)).toBe(true);
    expect(supportsInteraction("read", "Observation", ctx(), wildcardPolicy)).toBe(true);
  });

  it("wildcard does NOT match admin types", () => {
    expect(supportsInteraction("read", "AccessPolicy", ctx(), wildcardPolicy)).toBe(false);
    expect(supportsInteraction("read", "User", ctx(), wildcardPolicy)).toBe(false);
  });

  it("explicit type policy matches only that type", () => {
    expect(supportsInteraction("read", "Patient", ctx(), patientOnlyPolicy)).toBe(true);
    expect(supportsInteraction("read", "Observation", ctx(), patientOnlyPolicy)).toBe(false);
  });

  it("readonly policy allows read interactions", () => {
    expect(supportsInteraction("read", "Patient", ctx(), readonlyPolicy)).toBe(true);
    expect(supportsInteraction("search", "Patient", ctx(), readonlyPolicy)).toBe(true);
    expect(supportsInteraction("history", "Patient", ctx(), readonlyPolicy)).toBe(true);
  });

  it("readonly policy blocks write interactions", () => {
    expect(supportsInteraction("create", "Patient", ctx(), readonlyPolicy)).toBe(false);
    expect(supportsInteraction("update", "Patient", ctx(), readonlyPolicy)).toBe(false);
    expect(supportsInteraction("delete", "Patient", ctx(), readonlyPolicy)).toBe(false);
  });

  it("interaction list restricts allowed interactions", () => {
    expect(supportsInteraction("read", "Patient", ctx(), interactionPolicy)).toBe(true);
    expect(supportsInteraction("search", "Patient", ctx(), interactionPolicy)).toBe(true);
    expect(supportsInteraction("create", "Patient", ctx(), interactionPolicy)).toBe(false);
    expect(supportsInteraction("delete", "Patient", ctx(), interactionPolicy)).toBe(false);
  });
});

// =============================================================================
// Layer 2: canPerformInteraction
// =============================================================================

describe("canPerformInteraction (Layer 2)", () => {
  it("allows all without AccessPolicy", () => {
    const entry = canPerformInteraction("read", resource("Patient"), ctx());
    expect(entry).toBeDefined();
    expect(entry!.resourceType).toBe("*");
  });

  it("blocks protected types for non-superAdmin", () => {
    expect(canPerformInteraction("read", resource("Login"), ctx())).toBeUndefined();
  });

  it("allows protected types for superAdmin", () => {
    const entry = canPerformInteraction("read", resource("Login"), ctx({ superAdmin: true }));
    expect(entry).toBeDefined();
  });

  it("finds matching policy entry", () => {
    const entry = canPerformInteraction("read", resource("Patient"), ctx(), patientOnlyPolicy);
    expect(entry).toBeDefined();
    expect(entry!.resourceType).toBe("Patient");
  });

  it("returns undefined for non-matching type", () => {
    expect(canPerformInteraction("read", resource("Observation"), ctx(), patientOnlyPolicy)).toBeUndefined();
  });
});

// =============================================================================
// Layer 3: getSearchCriteria
// =============================================================================

describe("getSearchCriteria (Layer 3)", () => {
  it("returns empty for no AccessPolicy", () => {
    expect(getSearchCriteria("Patient", ctx())).toEqual([]);
  });

  it("returns empty for superAdmin", () => {
    expect(getSearchCriteria("Patient", ctx({ superAdmin: true }), criteriaPolicy)).toEqual([]);
  });

  it("extracts criteria from matching entry", () => {
    const params = getSearchCriteria("Patient", ctx(), criteriaPolicy);
    expect(params).toHaveLength(1);
    expect(params[0].code).toBe("general-practitioner");
    expect(params[0].values).toEqual(["Practitioner/p-1"]);
  });

  it("returns empty for non-matching type", () => {
    expect(getSearchCriteria("Observation", ctx(), criteriaPolicy)).toEqual([]);
  });
});

// =============================================================================
// parseCriteriaString
// =============================================================================

describe("parseCriteriaString", () => {
  it("parses simple criteria", () => {
    const params = parseCriteriaString("Patient?name=John");
    expect(params).toHaveLength(1);
    expect(params[0].code).toBe("name");
    expect(params[0].values).toEqual(["John"]);
  });

  it("parses multiple parameters", () => {
    const params = parseCriteriaString("Patient?name=John&birthdate=2000-01-01");
    expect(params).toHaveLength(2);
  });

  it("parses modifier", () => {
    const params = parseCriteriaString("name:exact=John");
    expect(params[0].code).toBe("name");
    expect(params[0].modifier).toBe("exact");
  });

  it("parses comma-separated OR values", () => {
    const params = parseCriteriaString("status=active,inactive");
    expect(params[0].values).toEqual(["active", "inactive"]);
  });

  it("handles empty criteria string", () => {
    expect(parseCriteriaString("")).toEqual([]);
  });

  it("handles criteria without ResourceType prefix", () => {
    const params = parseCriteriaString("name=John&family=Doe");
    expect(params).toHaveLength(2);
  });

  it("decodes URL-encoded values", () => {
    const params = parseCriteriaString("name=John%20Doe");
    expect(params[0].values).toEqual(["John Doe"]);
  });
});

// =============================================================================
// parseAccessPolicy
// =============================================================================

describe("parseAccessPolicy", () => {
  it("parses resource entries", () => {
    const res = resource("AccessPolicy");
    (res as any).resource = [
      { resourceType: "Patient", readonly: true },
      { resourceType: "Observation" },
    ];
    const policy = parseAccessPolicy(res);
    expect(policy).toBeDefined();
    expect(policy!.resource).toHaveLength(2);
    expect(policy!.resource[0].readonly).toBe(true);
  });

  it("returns undefined for empty resource entries", () => {
    const res = resource("AccessPolicy");
    (res as any).resource = [];
    expect(parseAccessPolicy(res)).toBeUndefined();
  });

  it("returns undefined for missing resource field", () => {
    const res = resource("AccessPolicy");
    expect(parseAccessPolicy(res)).toBeUndefined();
  });
});

// =============================================================================
// buildDefaultAccessPolicy
// =============================================================================

describe("buildDefaultAccessPolicy", () => {
  it("returns wildcard allow-all policy", () => {
    const policy = buildDefaultAccessPolicy();
    expect(policy.resource).toHaveLength(1);
    expect(policy.resource[0].resourceType).toBe("*");
  });
});
