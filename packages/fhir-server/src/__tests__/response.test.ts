/**
 * FHIR Response Helpers — Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  buildETag,
  parseETag,
  buildLastModified,
  buildLocationHeader,
  buildResourceHeaders,
  FHIR_JSON,
} from "../fhir/response.js";
import type { PersistedResource } from "@medxai/fhir-persistence";

describe("buildETag", () => {
  it("wraps versionId in weak validator format", () => {
    expect(buildETag("abc-123")).toBe('W/"abc-123"');
  });

  it("handles UUID versionId", () => {
    const vid = "550e8400-e29b-41d4-a716-446655440000";
    expect(buildETag(vid)).toBe(`W/"${vid}"`);
  });
});

describe("parseETag", () => {
  it("parses W/\"...\" format", () => {
    expect(parseETag('W/"abc-123"')).toBe("abc-123");
  });

  it("parses quoted format", () => {
    expect(parseETag('"abc-123"')).toBe("abc-123");
  });

  it("parses bare format", () => {
    expect(parseETag("abc-123")).toBe("abc-123");
  });

  it("trims whitespace", () => {
    expect(parseETag('  W/"abc-123"  ')).toBe("abc-123");
  });
});

describe("buildLastModified", () => {
  it("converts ISO 8601 to HTTP-date format", () => {
    const result = buildLastModified("2026-02-23T10:00:00.000Z");
    expect(result).toContain("Mon, 23 Feb 2026");
    expect(result).toContain("GMT");
  });
});

describe("buildLocationHeader", () => {
  it("builds correct Location URL", () => {
    const result = buildLocationHeader(
      "http://localhost:8080",
      "Patient",
      "123",
      "v1",
    );
    expect(result).toBe("http://localhost:8080/Patient/123/_history/v1");
  });

  it("strips trailing slash from baseUrl", () => {
    const result = buildLocationHeader(
      "http://localhost:8080/",
      "Patient",
      "123",
      "v1",
    );
    expect(result).toBe("http://localhost:8080/Patient/123/_history/v1");
  });
});

describe("buildResourceHeaders", () => {
  it("builds all standard FHIR response headers", () => {
    const resource: PersistedResource = {
      resourceType: "Patient",
      id: "123",
      meta: {
        versionId: "abc",
        lastUpdated: "2026-02-23T10:00:00.000Z",
      },
    };
    const headers = buildResourceHeaders(resource);
    expect(headers["content-type"]).toBe(FHIR_JSON);
    expect(headers.etag).toBe('W/"abc"');
    expect(headers["last-modified"]).toContain("GMT");
  });

  it("uses versionId from resource meta for etag", () => {
    const resource: PersistedResource = {
      resourceType: "Observation",
      id: "obs-1",
      meta: {
        versionId: "550e8400-e29b-41d4-a716-446655440000",
        lastUpdated: "2026-01-15T08:30:00.000Z",
      },
    };
    const headers = buildResourceHeaders(resource);
    expect(headers.etag).toBe('W/"550e8400-e29b-41d4-a716-446655440000"');
  });
});

describe("FHIR_JSON constant", () => {
  it("has correct FHIR content type", () => {
    expect(FHIR_JSON).toBe("application/fhir+json; charset=utf-8");
  });
});

describe("parseETag edge cases", () => {
  it("handles empty string", () => {
    expect(parseETag("")).toBe("");
  });

  it("handles single character", () => {
    expect(parseETag("x")).toBe("x");
  });

  it("handles W/ without closing quote", () => {
    expect(parseETag('W/"abc')).toBe('W/"abc');
  });

  it("handles numeric versionId", () => {
    expect(parseETag('W/"42"')).toBe("42");
  });
});
