/**
 * AccessPolicy Execution Tests
 *
 * Tests for supportsInteraction, canPerformInteraction, parseAccessPolicy.
 */

import { describe, it, expect } from "vitest";
import {
  supportsInteraction,
  canPerformInteraction,
  parseAccessPolicy,
  buildDefaultAccessPolicy,
  getSearchCriteria,
  parseCriteriaString,
} from "../../auth/access-policy.js";
import type {
  ParsedAccessPolicy,
  FhirInteraction,
} from "../../auth/access-policy.js";
import type { OperationContext } from "../../auth/middleware.js";

// =============================================================================
// Helpers
// =============================================================================

function makeResource(resourceType: string, id: string = "test-id") {
  return {
    resourceType,
    id,
    meta: { versionId: "1", lastUpdated: new Date().toISOString() },
  } as any;
}

function makeContext(overrides?: Partial<OperationContext>): OperationContext {
  return {
    project: "project-1",
    ...overrides,
  };
}

// =============================================================================
// Layer 1: supportsInteraction
// =============================================================================

describe("supportsInteraction (Layer 1)", () => {
  describe("protectedResourceTypes", () => {
    it("blocks non-superAdmin from Project", () => {
      const ctx = makeContext({ superAdmin: false });
      expect(supportsInteraction("read", "Project", ctx)).toBe(false);
    });

    it("blocks non-superAdmin from JsonWebKey", () => {
      const ctx = makeContext({ superAdmin: false });
      expect(supportsInteraction("read", "JsonWebKey", ctx)).toBe(false);
    });

    it("allows superAdmin to access Project", () => {
      const ctx = makeContext({ superAdmin: true });
      expect(supportsInteraction("read", "Project", ctx)).toBe(true);
    });

    it("allows superAdmin to access JsonWebKey", () => {
      const ctx = makeContext({ superAdmin: true });
      expect(supportsInteraction("read", "JsonWebKey", ctx)).toBe(true);
    });
  });

  describe("no AccessPolicy", () => {
    it("allows all interactions when no policy", () => {
      const ctx = makeContext();
      expect(supportsInteraction("create", "Patient", ctx)).toBe(true);
      expect(supportsInteraction("read", "Patient", ctx)).toBe(true);
      expect(supportsInteraction("update", "Patient", ctx)).toBe(true);
      expect(supportsInteraction("delete", "Patient", ctx)).toBe(true);
      expect(supportsInteraction("search", "Patient", ctx)).toBe(true);
    });
  });

  describe("with AccessPolicy", () => {
    const policy: ParsedAccessPolicy = {
      resource: [
        { resourceType: "Patient" },
        { resourceType: "Observation", readonly: true },
      ],
    };

    it("allows listed resource type", () => {
      const ctx = makeContext();
      expect(supportsInteraction("create", "Patient", ctx, policy)).toBe(true);
      expect(supportsInteraction("read", "Patient", ctx, policy)).toBe(true);
    });

    it("blocks unlisted resource type", () => {
      const ctx = makeContext();
      expect(supportsInteraction("read", "Encounter", ctx, policy)).toBe(false);
    });

    it("allows read on readonly resource", () => {
      const ctx = makeContext();
      expect(supportsInteraction("read", "Observation", ctx, policy)).toBe(true);
      expect(supportsInteraction("search", "Observation", ctx, policy)).toBe(true);
    });

    it("blocks write on readonly resource", () => {
      const ctx = makeContext();
      expect(supportsInteraction("create", "Observation", ctx, policy)).toBe(false);
      expect(supportsInteraction("update", "Observation", ctx, policy)).toBe(false);
      expect(supportsInteraction("delete", "Observation", ctx, policy)).toBe(false);
    });
  });

  describe("wildcard policy", () => {
    const policy: ParsedAccessPolicy = {
      resource: [{ resourceType: "*" }],
    };

    it("matches regular resource types", () => {
      const ctx = makeContext();
      expect(supportsInteraction("read", "Patient", ctx, policy)).toBe(true);
      expect(supportsInteraction("create", "Observation", ctx, policy)).toBe(true);
    });

    it("does NOT match projectAdminResourceTypes", () => {
      const ctx = makeContext();
      expect(supportsInteraction("read", "ProjectMembership", ctx, policy)).toBe(false);
      expect(supportsInteraction("read", "ClientApplication", ctx, policy)).toBe(false);
      expect(supportsInteraction("read", "AccessPolicy", ctx, policy)).toBe(false);
      expect(supportsInteraction("read", "User", ctx, policy)).toBe(false);
      expect(supportsInteraction("read", "Login", ctx, policy)).toBe(false);
    });
  });

  describe("explicit interaction list", () => {
    const policy: ParsedAccessPolicy = {
      resource: [
        { resourceType: "Patient", interaction: ["read", "search"] as FhirInteraction[] },
      ],
    };

    it("allows listed interactions", () => {
      const ctx = makeContext();
      expect(supportsInteraction("read", "Patient", ctx, policy)).toBe(true);
      expect(supportsInteraction("search", "Patient", ctx, policy)).toBe(true);
    });

    it("blocks unlisted interactions", () => {
      const ctx = makeContext();
      expect(supportsInteraction("create", "Patient", ctx, policy)).toBe(false);
      expect(supportsInteraction("update", "Patient", ctx, policy)).toBe(false);
      expect(supportsInteraction("delete", "Patient", ctx, policy)).toBe(false);
    });
  });
});

// =============================================================================
// Layer 2: canPerformInteraction
// =============================================================================

describe("canPerformInteraction (Layer 2)", () => {
  it("blocks non-superAdmin from protected types", () => {
    const resource = makeResource("Project");
    const ctx = makeContext({ superAdmin: false });
    expect(canPerformInteraction("read", resource, ctx)).toBeUndefined();
  });

  it("allows superAdmin for protected types", () => {
    const resource = makeResource("Project");
    const ctx = makeContext({ superAdmin: true });
    expect(canPerformInteraction("read", resource, ctx)).toBeTruthy();
  });

  it("returns allow-all entry when no policy", () => {
    const resource = makeResource("Patient");
    const ctx = makeContext();
    const entry = canPerformInteraction("read", resource, ctx);
    expect(entry).toBeTruthy();
    expect(entry?.resourceType).toBe("*");
  });

  it("returns matching policy entry", () => {
    const resource = makeResource("Patient");
    const ctx = makeContext();
    const policy: ParsedAccessPolicy = {
      resource: [
        { resourceType: "Patient" },
        { resourceType: "Observation", readonly: true },
      ],
    };
    const entry = canPerformInteraction("read", resource, ctx, policy);
    expect(entry).toBeTruthy();
    expect(entry?.resourceType).toBe("Patient");
  });

  it("blocks write on readonly policy", () => {
    const resource = makeResource("Observation");
    const ctx = makeContext();
    const policy: ParsedAccessPolicy = {
      resource: [{ resourceType: "Observation", readonly: true }],
    };
    expect(canPerformInteraction("update", resource, ctx, policy)).toBeUndefined();
  });

  it("allows read on readonly policy", () => {
    const resource = makeResource("Observation");
    const ctx = makeContext();
    const policy: ParsedAccessPolicy = {
      resource: [{ resourceType: "Observation", readonly: true }],
    };
    expect(canPerformInteraction("read", resource, ctx, policy)).toBeTruthy();
  });
});

// =============================================================================
// parseAccessPolicy
// =============================================================================

describe("parseAccessPolicy", () => {
  it("parses AccessPolicy resource entries", () => {
    const resource = makeResource("AccessPolicy");
    (resource as any).resource = [
      { resourceType: "Patient" },
      { resourceType: "Observation", readonly: true },
      { resourceType: "Encounter", interaction: ["read", "search"] },
    ];

    const parsed = parseAccessPolicy(resource);
    expect(parsed).toBeTruthy();
    expect(parsed!.resource.length).toBe(3);
    expect(parsed!.resource[0].resourceType).toBe("Patient");
    expect(parsed!.resource[0].readonly).toBeFalsy();
    expect(parsed!.resource[1].resourceType).toBe("Observation");
    expect(parsed!.resource[1].readonly).toBe(true);
    expect(parsed!.resource[2].interaction).toEqual(["read", "search"]);
  });

  it("returns undefined for empty resource array", () => {
    const resource = makeResource("AccessPolicy");
    (resource as any).resource = [];
    expect(parseAccessPolicy(resource)).toBeUndefined();
  });

  it("returns undefined for missing resource array", () => {
    const resource = makeResource("AccessPolicy");
    expect(parseAccessPolicy(resource)).toBeUndefined();
  });
});

// =============================================================================
// buildDefaultAccessPolicy
// =============================================================================

describe("buildDefaultAccessPolicy", () => {
  it("creates wildcard policy", () => {
    const policy = buildDefaultAccessPolicy();
    expect(policy.resource.length).toBe(1);
    expect(policy.resource[0].resourceType).toBe("*");
  });
});

// =============================================================================
// Layer 3: parseCriteriaString
// =============================================================================

describe("parseCriteriaString", () => {
  it("parses ResourceType?param=value format", () => {
    const params = parseCriteriaString("Patient?organization=Organization/123");
    expect(params).toHaveLength(1);
    expect(params[0].code).toBe("organization");
    expect(params[0].values).toEqual(["Organization/123"]);
  });

  it("parses multiple params", () => {
    const params = parseCriteriaString("Observation?subject=Patient/1&status=final");
    expect(params).toHaveLength(2);
    expect(params[0].code).toBe("subject");
    expect(params[0].values).toEqual(["Patient/1"]);
    expect(params[1].code).toBe("status");
    expect(params[1].values).toEqual(["final"]);
  });

  it("parses modifier in key", () => {
    const params = parseCriteriaString("Patient?name:exact=Zhang");
    expect(params).toHaveLength(1);
    expect(params[0].code).toBe("name");
    expect(params[0].modifier).toBe("exact");
    expect(params[0].values).toEqual(["Zhang"]);
  });

  it("parses comma-separated values (OR)", () => {
    const params = parseCriteriaString("Observation?status=final,amended");
    expect(params).toHaveLength(1);
    expect(params[0].values).toEqual(["final", "amended"]);
  });

  it("handles bare query string without ResourceType? prefix", () => {
    const params = parseCriteriaString("organization=Organization/abc");
    expect(params).toHaveLength(1);
    expect(params[0].code).toBe("organization");
  });

  it("returns empty array for empty criteria", () => {
    expect(parseCriteriaString("")).toEqual([]);
    expect(parseCriteriaString("Patient?")).toEqual([]);
  });

  it("skips pairs without = separator", () => {
    const params = parseCriteriaString("Patient?invalidparam&status=final");
    expect(params).toHaveLength(1);
    expect(params[0].code).toBe("status");
  });

  it("decodes URL-encoded values", () => {
    const params = parseCriteriaString("Patient?name=%E5%BC%A0");
    expect(params).toHaveLength(1);
    expect(params[0].values).toEqual(["张"]);
  });
});

// =============================================================================
// Layer 3: getSearchCriteria
// =============================================================================

describe("getSearchCriteria (Layer 3)", () => {
  it("returns empty for no policy", () => {
    const ctx = makeContext();
    expect(getSearchCriteria("Patient", ctx)).toEqual([]);
  });

  it("returns empty for superAdmin", () => {
    const ctx = makeContext({ superAdmin: true });
    const policy: ParsedAccessPolicy = {
      resource: [{ resourceType: "Patient", criteria: "Patient?organization=Organization/1" }],
    };
    expect(getSearchCriteria("Patient", ctx, policy)).toEqual([]);
  });

  it("returns parsed criteria params for matching entry", () => {
    const ctx = makeContext();
    const policy: ParsedAccessPolicy = {
      resource: [{ resourceType: "Patient", criteria: "Patient?organization=Organization/1" }],
    };
    const params = getSearchCriteria("Patient", ctx, policy);
    expect(params).toHaveLength(1);
    expect(params[0].code).toBe("organization");
    expect(params[0].values).toEqual(["Organization/1"]);
  });

  it("returns empty when entry has no criteria", () => {
    const ctx = makeContext();
    const policy: ParsedAccessPolicy = {
      resource: [{ resourceType: "Patient" }],
    };
    expect(getSearchCriteria("Patient", ctx, policy)).toEqual([]);
  });

  it("returns empty for non-matching resource type", () => {
    const ctx = makeContext();
    const policy: ParsedAccessPolicy = {
      resource: [{ resourceType: "Patient", criteria: "Patient?organization=Organization/1" }],
    };
    expect(getSearchCriteria("Observation", ctx, policy)).toEqual([]);
  });

  it("uses wildcard entry criteria for regular types", () => {
    const ctx = makeContext();
    const policy: ParsedAccessPolicy = {
      resource: [{ resourceType: "*", criteria: "?_tag=http://example.com|restricted" }],
    };
    const params = getSearchCriteria("Patient", ctx, policy);
    expect(params).toHaveLength(1);
    expect(params[0].code).toBe("_tag");
  });
});
