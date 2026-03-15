/**
 * FHIR Response Helpers
 *
 * Utilities for building FHIR-compliant HTTP response headers
 * (ETag, Location, Last-Modified, Content-Type).
 *
 * Reference: https://hl7.org/fhir/R4/http.html
 *
 * @module fhir-server/fhir
 */

import type { PersistedResource } from "@medxai/fhir-persistence";

// =============================================================================
// Section 1: Constants
// =============================================================================

/**
 * FHIR JSON content type.
 */
export const FHIR_JSON = "application/fhir+json; charset=utf-8";

// =============================================================================
// Section 2: Header Helpers
// =============================================================================

/**
 * Build an ETag header value from a versionId.
 *
 * Format: `W/"<versionId>"` (weak validator per FHIR R4 spec).
 */
export function buildETag(versionId: string): string {
  return `W/"${versionId}"`;
}

/**
 * Parse an ETag or If-Match header value to extract the versionId.
 *
 * Accepts:
 * - `W/"abc-123"` → `"abc-123"`
 * - `"abc-123"` → `"abc-123"`
 * - `abc-123` → `"abc-123"`
 */
export function parseETag(etag: string): string {
  let value = etag.trim();
  // Strip weak validator prefix
  if (value.startsWith('W/"') && value.endsWith('"')) {
    return value.slice(3, -1);
  }
  // Strip quotes
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Build a Last-Modified header value from an ISO 8601 timestamp.
 *
 * Format: HTTP-date (RFC 7231), e.g., `Sun, 23 Feb 2026 10:00:00 GMT`.
 */
export function buildLastModified(lastUpdated: string): string {
  return new Date(lastUpdated).toUTCString();
}

/**
 * Build a Location header value for a newly created resource.
 *
 * Format: `<baseUrl>/<resourceType>/<id>/_history/<versionId>`
 */
export function buildLocationHeader(
  baseUrl: string,
  resourceType: string,
  id: string,
  versionId: string,
): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/${resourceType}/${id}/_history/${versionId}`;
}

// =============================================================================
// Section 3: Response Header Sets
// =============================================================================

/**
 * Standard FHIR response headers for a resource.
 */
export interface FhirResponseHeaders {
  "content-type": string;
  etag: string;
  "last-modified": string;
}

/**
 * Build standard FHIR response headers from a persisted resource.
 */
export function buildResourceHeaders(resource: PersistedResource): FhirResponseHeaders {
  return {
    "content-type": FHIR_JSON,
    etag: buildETag(resource.meta.versionId),
    "last-modified": buildLastModified(resource.meta.lastUpdated),
  };
}
