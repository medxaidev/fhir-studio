/**
 * CapabilityStatement Cache
 *
 * Caches the generated CapabilityStatement at startup and provides
 * ETag-based conditional GET support for the /metadata endpoint.
 *
 * @module fhir-server/capability
 */

import { createHash } from "node:crypto";
import type { CapabilityStatement } from "../types/fhir.js";

// =============================================================================
// Section 1: Module State
// =============================================================================

/** Cached CapabilityStatement. */
let cachedCS: CapabilityStatement | undefined;

/** Cached serialized JSON (for fast response). */
let cachedJson: string | undefined;

/** ETag based on content hash. */
let cachedETag: string | undefined;

// =============================================================================
// Section 2: Cache Operations
// =============================================================================

/**
 * Store a CapabilityStatement in cache and compute its ETag.
 */
export function cacheCapabilityStatement(cs: CapabilityStatement): void {
  cachedCS = cs;
  cachedJson = JSON.stringify(cs);
  cachedETag = computeETag(cachedJson);
}

/**
 * Get the cached CapabilityStatement.
 */
export function getCachedCapabilityStatement(): CapabilityStatement | undefined {
  return cachedCS;
}

/**
 * Get the cached JSON string.
 */
export function getCachedJson(): string | undefined {
  return cachedJson;
}

/**
 * Get the cached ETag.
 */
export function getCachedETag(): string | undefined {
  return cachedETag;
}

/**
 * Check if an If-None-Match header matches the cached ETag.
 *
 * @returns true if the client's cached version is still valid (304 Not Modified).
 */
export function isNotModified(ifNoneMatch: string | undefined): boolean {
  if (!ifNoneMatch || !cachedETag) return false;
  // Handle comma-separated ETags and wildcard
  const tags = ifNoneMatch.split(",").map((t) => t.trim());
  return tags.includes(cachedETag) || tags.includes("*");
}

/**
 * Invalidate the cache (e.g., after config change).
 */
export function invalidateCache(): void {
  cachedCS = undefined;
  cachedJson = undefined;
  cachedETag = undefined;
}

// =============================================================================
// Section 3: Helpers
// =============================================================================

/**
 * Compute a weak ETag from JSON content using SHA-256 truncated to 16 chars.
 */
function computeETag(json: string): string {
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
}

/**
 * Reset cache state (for testing only).
 * @internal
 */
export function _resetCacheForTesting(): void {
  invalidateCache();
}
