/**
 * Capability Layer — Barrel Export
 *
 * @module fhir-server/capability
 */

export { generateCapabilityStatement } from "./capability-generator.js";
export type { CapabilityGeneratorOptions } from "./capability-generator.js";

export {
  cacheCapabilityStatement,
  getCachedCapabilityStatement,
  getCachedJson,
  getCachedETag,
  isNotModified,
  invalidateCache,
  _resetCacheForTesting,
} from "./capability-cache.js";
