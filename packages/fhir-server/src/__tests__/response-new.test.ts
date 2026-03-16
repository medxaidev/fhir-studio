/**
 * Response Helpers — Unit Tests (New Error Layer)
 *
 * Tests for fhir-server/error/response.ts (ERR-03).
 */

import { describe, it, expect } from "vitest";
import {
  FHIR_JSON,
  buildETag,
  parseETag,
  buildLastModified,
  buildLocationHeader,
  buildResourceHeaders,
} from "../error/response.js";
import type { PersistedResource } from "../types/fhir.js";

// =============================================================================
// Constants
// =============================================================================

describe("FHIR_JSON constant", () => {
  it("is application/fhir+json with charset", () => {
    expect(FHIR_JSON).toBe("application/fhir+json; charset=utf-8");
  });
});

// =============================================================================
// buildETag
// =============================================================================

describe("buildETag", () => {
  it("wraps versionId in weak ETag format", () => {
    expect(buildETag("v1")).toBe('W/"v1"');
  });

  it("handles UUID versionId", () => {
    const vid = "550e8400-e29b-41d4-a716-446655440000";
    expect(buildETag(vid)).toBe(`W/"${vid}"`);
  });

  it("handles empty string", () => {
    expect(buildETag("")).toBe('W/""');
  });
});

// =============================================================================
// parseETag
// =============================================================================

describe("parseETag", () => {
  it("parses weak ETag: W/\"abc-123\"", () => {
    expect(parseETag('W/"abc-123"')).toBe("abc-123");
  });

  it("parses quoted ETag: \"abc-123\"", () => {
    expect(parseETag('"abc-123"')).toBe("abc-123");
  });

  it("parses bare ETag: abc-123", () => {
    expect(parseETag("abc-123")).toBe("abc-123");
  });

  it("trims whitespace", () => {
    expect(parseETag('  W/"v1"  ')).toBe("v1");
  });

  it("handles UUID versionId", () => {
    const vid = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseETag(`W/"${vid}"`)).toBe(vid);
  });
});

// =============================================================================
// buildLastModified
// =============================================================================

describe("buildLastModified", () => {
  it("converts ISO 8601 to HTTP-date format", () => {
    const result = buildLastModified("2026-01-15T10:30:00.000Z");
    expect(result).toContain("2026");
    expect(result).toContain("GMT");
    // Should be a valid date string
    expect(new Date(result).toISOString()).toBeTruthy();
  });

  it("handles different ISO formats", () => {
    const result = buildLastModified("2026-06-01T00:00:00Z");
    expect(result).toContain("GMT");
  });
});

// =============================================================================
// buildLocationHeader
// =============================================================================

describe("buildLocationHeader", () => {
  it("builds correct location with trailing slash baseUrl", () => {
    const loc = buildLocationHeader("http://localhost:8080/", "Patient", "123", "v1");
    expect(loc).toBe("http://localhost:8080/Patient/123/_history/v1");
  });

  it("builds correct location without trailing slash", () => {
    const loc = buildLocationHeader("http://localhost:8080", "Patient", "123", "v1");
    expect(loc).toBe("http://localhost:8080/Patient/123/_history/v1");
  });

  it("handles different resource types", () => {
    const loc = buildLocationHeader("http://fhir.example.com/fhir", "Observation", "obs-1", "v2");
    expect(loc).toBe("http://fhir.example.com/fhir/Observation/obs-1/_history/v2");
  });

  it("handles UUID ids", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const loc = buildLocationHeader("http://localhost", "Patient", id, "v1");
    expect(loc).toContain(id);
  });
});

// =============================================================================
// buildResourceHeaders
// =============================================================================

describe("buildResourceHeaders", () => {
  const resource: PersistedResource = {
    resourceType: "Patient",
    id: "123",
    meta: {
      versionId: "v1",
      lastUpdated: "2026-01-15T10:30:00.000Z",
    },
  };

  it("includes content-type header", () => {
    const headers = buildResourceHeaders(resource);
    expect(headers["content-type"]).toBe(FHIR_JSON);
  });

  it("includes etag header", () => {
    const headers = buildResourceHeaders(resource);
    expect(headers.etag).toBe('W/"v1"');
  });

  it("includes last-modified header", () => {
    const headers = buildResourceHeaders(resource);
    expect(headers["last-modified"]).toContain("GMT");
  });

  it("returns all three headers", () => {
    const headers = buildResourceHeaders(resource);
    expect(Object.keys(headers)).toHaveLength(3);
    expect(headers).toHaveProperty("content-type");
    expect(headers).toHaveProperty("etag");
    expect(headers).toHaveProperty("last-modified");
  });
});
