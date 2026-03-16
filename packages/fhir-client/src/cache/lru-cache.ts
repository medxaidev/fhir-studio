/**
 * LRU Cache
 *
 * Simple Least Recently Used cache using Map insertion order.
 * Supports capacity + TTL dual eviction.
 *
 * @module fhir-client/cache
 */

// =============================================================================
// Section 1: Types
// =============================================================================

interface CacheItem<T> {
  value: T;
  insertedAt: number;
}

// =============================================================================
// Section 2: LRUCache
// =============================================================================

/**
 * LRU cache with capacity and per-item TTL support.
 *
 * Uses Map insertion order for O(1) LRU eviction.
 */
export class LRUCache<T> {
  private readonly maxSize: number;
  private readonly ttl: number;
  private readonly map = new Map<string, CacheItem<T>>();

  /**
   * @param maxSize - Maximum number of items (0 = unlimited).
   * @param ttl - Time-to-live in ms (0 = no expiry).
   */
  constructor(maxSize: number = 1000, ttl: number = 0) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Get a cached value. Moves the item to most-recently-used position.
   * Returns undefined if not found or expired.
   */
  get(key: string): T | undefined {
    const item = this.map.get(key);
    if (!item) return undefined;

    // Check TTL
    if (this.ttl > 0 && Date.now() - item.insertedAt > this.ttl) {
      this.map.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, item);
    return item.value;
  }

  /**
   * Set a value. Evicts the oldest item if at capacity.
   */
  set(key: string, value: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.maxSize > 0 && this.map.size >= this.maxSize) {
      // Evict oldest (first key)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, { value, insertedAt: Date.now() });
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const item = this.map.get(key);
    if (!item) return false;
    if (this.ttl > 0 && Date.now() - item.insertedAt > this.ttl) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a single key.
   */
  delete(key: string): boolean {
    return this.map.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * Get all keys.
   */
  keys(): IterableIterator<string> {
    return this.map.keys();
  }

  /**
   * Get the number of items.
   */
  get size(): number {
    return this.map.size;
  }
}
