/**
 * Capability Layer — Unit Tests (CAP-01, CAP-02)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateCapabilityStatement,
} from "../capability/capability-generator.js";
import {
  cacheCapabilityStatement,
  getCachedCapabilityStatement,
  getCachedJson,
  getCachedETag,
  isNotModified,
  invalidateCache,
  _resetCacheForTesting,
} from "../capability/capability-cache.js";
import type { FhirEngine } from "../types/engine.js";
import type { CapabilityStatement } from "../types/fhir.js";

// =============================================================================
// Helpers
// =============================================================================

function createMockEngine(overrides?: Partial<FhirEngine>): FhirEngine {
  return {
    persistence: {
      createResource: vi.fn(),
      readResource: vi.fn(),
      updateResource: vi.fn(),
      deleteResource: vi.fn(),
      readHistory: vi.fn(),
      readVersion: vi.fn(),
      searchResources: vi.fn(),
      processBundle: vi.fn(),
    },
    runtime: {
      validate: vi.fn(),
      evalFhirPath: vi.fn(),
      generateCapabilityStatement: vi.fn().mockReturnValue({
        resourceType: "CapabilityStatement",
        status: "active",
        kind: "instance",
        fhirVersion: "4.0.1",
        format: ["json"],
        rest: [{ mode: "server", resource: [{ type: "Patient" }] }],
      }),
    },
    definitions: {
      getStructureDefinition: vi.fn(),
      getValueSet: vi.fn(),
      getResourceTypes: vi.fn().mockReturnValue(["Patient", "Observation", "Encounter"]),
    },
    stop: vi.fn(),
    ...overrides,
  } as unknown as FhirEngine;
}

beforeEach(() => {
  _resetCacheForTesting();
});

// =============================================================================
// CAP-01: CapabilityStatement Generator
// =============================================================================

describe("generateCapabilityStatement", () => {
  it("delegates to engine.runtime.generateCapabilityStatement", () => {
    const engine = createMockEngine();
    const cs = generateCapabilityStatement({ engine, baseUrl: "http://localhost:8080" });
    expect(engine.runtime.generateCapabilityStatement).toHaveBeenCalledWith("http://localhost:8080");
    expect(cs.resourceType).toBe("CapabilityStatement");
  });

  it("augments with software info", () => {
    const engine = createMockEngine();
    const cs = generateCapabilityStatement({
      engine,
      baseUrl: "http://localhost:8080",
      softwareName: "test-server",
      softwareVersion: "1.0.0",
    });
    const software = (cs as Record<string, unknown>).software as Record<string, string>;
    expect(software.name).toBe("test-server");
    expect(software.version).toBe("1.0.0");
  });

  it("augments with implementation URL", () => {
    const engine = createMockEngine();
    const cs = generateCapabilityStatement({ engine, baseUrl: "http://localhost:8080" });
    const impl = (cs as Record<string, unknown>).implementation as Record<string, string>;
    expect(impl.url).toBe("http://localhost:8080");
  });

  it("adds security info when auth is enabled", () => {
    const engine = createMockEngine();
    const cs = generateCapabilityStatement({
      engine,
      baseUrl: "http://localhost:8080",
      auth: { enabled: true },
    });
    expect(cs.rest).toBeDefined();
    expect(cs.rest![0].security).toBeDefined();
    expect(cs.rest![0].security!.cors).toBe(true);
  });

  it("does not add security info when auth is disabled", () => {
    const engine = createMockEngine();
    const cs = generateCapabilityStatement({
      engine,
      baseUrl: "http://localhost:8080",
      auth: { enabled: false },
    });
    expect(cs.rest![0].security).toBeUndefined();
  });

  it("falls back to minimal CS if engine throws", () => {
    const engine = createMockEngine({
      runtime: {
        validate: vi.fn(),
        evalFhirPath: vi.fn(),
        generateCapabilityStatement: vi.fn().mockImplementation(() => {
          throw new Error("Not implemented");
        }),
      },
    } as any);
    const cs = generateCapabilityStatement({ engine, baseUrl: "http://localhost:8080" });
    expect(cs.resourceType).toBe("CapabilityStatement");
    expect(cs.fhirVersion).toBe("4.0.1");
    expect(cs.rest).toBeDefined();
    expect(cs.rest![0].resource!.length).toBe(3); // Patient, Observation, Encounter
  });

  it("uses default software name and version", () => {
    const engine = createMockEngine();
    const cs = generateCapabilityStatement({ engine, baseUrl: "http://localhost:8080" });
    const software = (cs as Record<string, unknown>).software as Record<string, string>;
    expect(software.name).toBe("fhir-server");
    expect(software.version).toBe("0.1.0");
  });
});

// =============================================================================
// CAP-02: CapabilityStatement Cache
// =============================================================================

describe("CapabilityStatement Cache", () => {
  const mockCS: CapabilityStatement = {
    resourceType: "CapabilityStatement",
    status: "active",
    kind: "instance",
    fhirVersion: "4.0.1",
    format: ["json"],
  };

  it("stores and retrieves CS", () => {
    cacheCapabilityStatement(mockCS);
    expect(getCachedCapabilityStatement()).toEqual(mockCS);
  });

  it("stores JSON representation", () => {
    cacheCapabilityStatement(mockCS);
    const json = getCachedJson();
    expect(json).toBeDefined();
    expect(JSON.parse(json!)).toEqual(mockCS);
  });

  it("computes ETag from content", () => {
    cacheCapabilityStatement(mockCS);
    const etag = getCachedETag();
    expect(etag).toBeDefined();
    expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
  });

  it("ETag changes when content changes", () => {
    cacheCapabilityStatement(mockCS);
    const etag1 = getCachedETag();

    const modifiedCS = { ...mockCS, status: "draft" as const };
    cacheCapabilityStatement(modifiedCS);
    const etag2 = getCachedETag();

    expect(etag1).not.toBe(etag2);
  });

  it("ETag is stable for same content", () => {
    cacheCapabilityStatement(mockCS);
    const etag1 = getCachedETag();

    _resetCacheForTesting();
    cacheCapabilityStatement(mockCS);
    const etag2 = getCachedETag();

    expect(etag1).toBe(etag2);
  });

  it("isNotModified returns true for matching ETag", () => {
    cacheCapabilityStatement(mockCS);
    const etag = getCachedETag()!;
    expect(isNotModified(etag)).toBe(true);
  });

  it("isNotModified returns false for non-matching ETag", () => {
    cacheCapabilityStatement(mockCS);
    expect(isNotModified('W/"different"')).toBe(false);
  });

  it("isNotModified returns true for wildcard *", () => {
    cacheCapabilityStatement(mockCS);
    expect(isNotModified("*")).toBe(true);
  });

  it("isNotModified returns false when no cache", () => {
    expect(isNotModified('W/"something"')).toBe(false);
  });

  it("isNotModified returns false for undefined header", () => {
    cacheCapabilityStatement(mockCS);
    expect(isNotModified(undefined)).toBe(false);
  });

  it("invalidateCache clears all cached data", () => {
    cacheCapabilityStatement(mockCS);
    expect(getCachedCapabilityStatement()).toBeDefined();

    invalidateCache();
    expect(getCachedCapabilityStatement()).toBeUndefined();
    expect(getCachedJson()).toBeUndefined();
    expect(getCachedETag()).toBeUndefined();
  });
});
