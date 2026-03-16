/**
 * Resource Cache
 *
 * FHIR-aware cache strategy on top of LRUCache.
 * Handles read caching, search caching, and precise invalidation.
 *
 * @module fhir-client/cache
 */

import type { Resource, CacheConfig, RequestOptions } from "../types/index.js";
import { LRUCache } from "./lru-cache.js";

// =============================================================================
// Section 1: ResourceCache
// =============================================================================

export class ResourceCache {
  private readonly cache: LRUCache<unknown>;
  private readonly enabled: boolean;
  private readonly baseUrl: string;

  constructor(baseUrl: string, config?: CacheConfig) {
    this.baseUrl = baseUrl;
    this.enabled = config?.enabled !== false && (config?.maxSize ?? 1000) > 0;

    const maxSize = config?.maxSize ?? 1000;
    const ttl = config?.ttl ?? (typeof globalThis.window !== "undefined" ? 60_000 : 0);
    this.cache = new LRUCache<unknown>(maxSize, ttl);
  }

  // ===========================================================================
  // Read Cache
  // ===========================================================================

  /**
   * Try to get a cached resource by URL.
   * Returns undefined on miss or if cache/options say skip.
   */
  get<T>(url: string, options?: RequestOptions): T | undefined {
    if (!this.enabled) return undefined;
    if (options?.cache === "no-cache" || options?.cache === "reload") return undefined;
    return this.cache.get(url) as T | undefined;
  }

  /**
   * Store a value in cache.
   */
  set(url: string, value: unknown): void {
    if (!this.enabled) return;
    this.cache.set(url, value);
  }

  // ===========================================================================
  // Resource-specific helpers
  // ===========================================================================

  /**
   * Cache a resource by its canonical URL ({baseUrl}/{type}/{id}).
   */
  cacheResource(resource: Resource): void {
    if (!this.enabled || !resource.id) return;
    const url = `${this.baseUrl}/${resource.resourceType}/${resource.id}`;
    this.cache.set(url, resource);
  }

  /**
   * Get a cached resource synchronously.
   */
  getCachedResource<T extends Resource>(
    resourceType: string,
    id: string,
  ): T | undefined {
    if (!this.enabled) return undefined;
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    return this.cache.get(url) as T | undefined;
  }

  // ===========================================================================
  // Invalidation
  // ===========================================================================

  /**
   * Invalidate a specific resource and related search caches.
   */
  invalidateResource(resourceType: string, id: string): void {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    this.cache.delete(url);
    this.invalidateSearches(resourceType);
  }

  /**
   * Invalidate all search caches for a resource type.
   * Called after create/update/delete/patch.
   */
  invalidateSearches(resourceType: string): void {
    const prefix = `${this.baseUrl}/${resourceType}`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix) && (key.includes("?") || key === prefix)) {
        this.cache.delete(key);
      }
      if (key.includes("_history") && key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached data.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get underlying cache size.
   */
  get size(): number {
    return this.cache.size;
  }
}
