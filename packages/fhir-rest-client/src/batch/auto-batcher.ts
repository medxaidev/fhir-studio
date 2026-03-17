/**
 * Auto-Batcher
 *
 * Aggregates write operations into a single FHIR batch Bundle.
 * Ported from MedXAIClient auto-batch logic.
 *
 * @module fhir-client/batch
 */

import type {
  Resource,
  OperationOutcome,
  Bundle,
  BatchConfig,
  BatchQueueEntry,
} from "../types/index.js";
import { FhirClientError } from "../errors/errors.js";

// =============================================================================
// Section 1: AutoBatcher
// =============================================================================

export class AutoBatcher {
  private enabled: boolean;
  private readonly windowMs: number;
  private readonly maxSize: number;
  private queue: BatchQueueEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** The function that actually sends a Bundle to the server. */
  private executeBatch?: (bundle: Bundle) => Promise<Bundle>;

  constructor(config?: BatchConfig) {
    this.enabled = config?.enabled ?? false;
    this.windowMs = config?.windowMs ?? 20;
    this.maxSize = config?.maxSize ?? 20;
  }

  /** Bind the executeBatch function (called by FhirClient during init). */
  bind(executeBatch: (bundle: Bundle) => Promise<Bundle>): void {
    this.executeBatch = executeBatch;
  }

  /** Enable or disable auto-batching at runtime. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      if (this.queue.length > 0) {
        void this.flush();
      }
    }
  }

  /** Check if auto-batching is enabled. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enqueue a write operation for batching.
   * Returns a Promise that resolves when the batch is flushed.
   */
  enqueue<T extends Resource>(
    method: string,
    url: string,
    resource?: Resource,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        method,
        url,
        resource,
        resolve: resolve as (value: Resource | OperationOutcome) => void,
        reject,
      });

      // Flush immediately if at max size
      if (this.queue.length >= this.maxSize) {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        void this.flush();
        return;
      }

      // Start window timer if not already running
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.flush();
        }, this.windowMs);
      }
    });
  }

  /**
   * Flush all queued operations as a single batch Bundle.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const entries = this.queue.splice(0);
    if (entries.length === 0) return;

    if (!this.executeBatch) {
      for (const entry of entries) {
        entry.reject(new FhirClientError("AutoBatcher not bound to executeBatch"));
      }
      return;
    }

    const bundle: Bundle = {
      resourceType: "Bundle",
      type: "batch",
      entry: entries.map((e) => ({
        resource: e.resource,
        request: { method: e.method, url: e.url },
      })),
    };

    try {
      const response = await this.executeBatch(bundle);
      const responseEntries = response.entry ?? [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const respEntry = responseEntries[i];

        if (!respEntry) {
          entry.reject(
            new FhirClientError("No response entry for batch item", 500),
          );
          continue;
        }

        const status = parseInt(respEntry.response?.status ?? "500", 10);
        if (status >= 200 && status < 300) {
          entry.resolve(
            respEntry.resource ??
              ({ resourceType: "OperationOutcome", issue: [] } as OperationOutcome),
          );
        } else {
          entry.reject(
            new FhirClientError(
              `Batch entry failed with status ${respEntry.response?.status}`,
              status,
            ),
          );
        }
      }
    } catch (err) {
      for (const entry of entries) {
        entry.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /** Get the current queue size. */
  get pendingCount(): number {
    return this.queue.length;
  }
}
