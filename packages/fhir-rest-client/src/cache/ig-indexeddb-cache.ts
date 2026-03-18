/**
 * L2 IndexedDB Cache for IG Resources
 *
 * Provides cross-session persistent caching for IG data.
 * Stores full StructureDefinition JSON and IG index data
 * keyed by URL, with IG version tracking for invalidation.
 *
 * Design:
 * - DB name: `fhir-client-ig-cache`
 * - Store name: `resources`
 * - Key: URL string (e.g., `{baseUrl}/_ig/{igId}/structure/{sdId}`)
 * - Fields: value (JSON), igVersion, etag, cachedAt
 * - Invalidation: by igId + version mismatch
 *
 * Default: disabled. Enable via `igCacheEnabled: true` in MedXAIClientConfig.
 *
 * @module fhir-rest-client/cache
 */

// =============================================================================
// Types
// =============================================================================

export interface IGCacheEntry {
  url: string;
  value: unknown;
  igId: string;
  igVersion: string;
  etag?: string;
  cachedAt: number;
}

// =============================================================================
// IGIndexedDBCache
// =============================================================================

const DB_NAME = "fhir-client-ig-cache";
const DB_VERSION = 1;
const STORE_NAME = "resources";

export class IGIndexedDBCache {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  /**
   * Open (or create) the IndexedDB database.
   * Safe to call multiple times — returns the same DB instance.
   */
  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.opening) return this.opening;

    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "url" });
          store.createIndex("igId", "igId", { unique: false });
          store.createIndex("igVersion", ["igId", "igVersion"], { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => {
        this.opening = null;
        reject(request.error);
      };
    });

    return this.opening;
  }

  /**
   * Get a cached resource by URL key.
   * Returns null if not found or DB is unavailable.
   */
  async get(key: string): Promise<IGCacheEntry | null> {
    try {
      const db = await this.open();
      return new Promise<IGCacheEntry | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  /**
   * Store a resource in the cache.
   */
  async set(
    key: string,
    value: unknown,
    igId: string,
    igVersion: string,
    etag?: string,
  ): Promise<void> {
    try {
      const db = await this.open();
      const entry: IGCacheEntry = {
        url: key,
        value,
        igId,
        igVersion,
        etag,
        cachedAt: Date.now(),
      };
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Silently fail — L2 cache is best-effort
    }
  }

  /**
   * Invalidate all cached entries for an IG that don't match the given version.
   * Called when IG version changes.
   */
  async invalidateIG(igId: string, currentVersion: string): Promise<void> {
    try {
      const db = await this.open();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const index = store.index("igId");
        const request = index.openCursor(IDBKeyRange.only(igId));

        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          const entry = cursor.value as IGCacheEntry;
          if (entry.igVersion !== currentVersion) {
            cursor.delete();
          }
          cursor.continue();
        };

        request.onerror = () => reject(request.error);
      });
    } catch {
      // Silently fail
    }
  }

  /**
   * Clear all entries in the cache.
   */
  async clear(): Promise<void> {
    try {
      const db = await this.open();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Silently fail
    }
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.opening = null;
    }
  }
}
