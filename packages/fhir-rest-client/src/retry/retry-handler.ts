/**
 * Retry Handler
 *
 * Exponential backoff retry for transient HTTP errors.
 * Ported from MedXAIClient retry logic.
 *
 * @module fhir-client/retry
 */

import type { RetryConfig } from "../types/index.js";

// =============================================================================
// Section 1: Defaults
// =============================================================================

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 500;
const DEFAULT_MAX_DELAY = 30_000;
const DEFAULT_RETRY_ON = [429, 500, 502, 503, 504];

// =============================================================================
// Section 2: RetryHandler
// =============================================================================

export class RetryHandler {
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly retryOn: Set<number>;

  constructor(config?: RetryConfig) {
    this.maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelay = config?.baseDelay ?? DEFAULT_BASE_DELAY;
    this.maxDelay = config?.maxDelay ?? DEFAULT_MAX_DELAY;
    this.retryOn = new Set(config?.retryOn ?? DEFAULT_RETRY_ON);
  }

  /**
   * Execute a fetch with retry logic.
   *
   * @param fetchFn - Function that performs the actual fetch.
   * @returns The successful Response.
   */
  async execute(
    fetchFn: () => Promise<Response>,
  ): Promise<Response> {
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const response = await fetchFn();

      if (!this.shouldRetry(response.status) || attempt === this.maxRetries) {
        return response;
      }

      lastResponse = response;

      // Exponential backoff: baseDelay * 1.5^attempt, capped at maxDelay
      const delay = Math.min(
        this.baseDelay * Math.pow(1.5, attempt),
        this.maxDelay,
      );
      await sleep(delay);
    }

    // Unreachable, but TypeScript needs it
    return lastResponse!;
  }

  /**
   * Check if a status code is retryable.
   */
  shouldRetry(status: number): boolean {
    return this.retryOn.has(status);
  }
}

// =============================================================================
// Section 3: Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
