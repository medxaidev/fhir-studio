/**
 * HTTP Transport Layer
 *
 * Wraps the native fetch API with FHIR-specific defaults:
 * - Content-Type: application/fhir+json
 * - Authorization header injection
 * - Response JSON parsing
 * - Non-2xx → typed error mapping
 * - AbortSignal support
 * - Custom fetchImpl injection
 *
 * @module fhir-client/transport
 */

import type { OperationOutcome } from "../types/index.js";
import {
  FhirClientError,
  OperationOutcomeError,
  NetworkError,
  ResourceNotFoundError,
} from "../errors/errors.js";

// =============================================================================
// Section 1: Constants
// =============================================================================

export const FHIR_JSON = "application/fhir+json";

// =============================================================================
// Section 2: Types
// =============================================================================

/** Options for a single HTTP request. */
export interface TransportRequestOptions {
  method: string;
  url: string;
  body?: string | BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Configuration for the transport layer. */
export interface TransportConfig {
  /** Custom fetch implementation. */
  fetchImpl?: typeof fetch;
  /** Default headers for all requests. */
  defaultHeaders?: Record<string, string>;
  /** Function to get current access token. */
  getAccessToken?: () => string | undefined;
}

// =============================================================================
// Section 3: HttpTransport
// =============================================================================

export class HttpTransport {
  private readonly fetchFn: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly getAccessToken: () => string | undefined;

  constructor(config: TransportConfig = {}) {
    this.fetchFn = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.getAccessToken = config.getAccessToken ?? (() => undefined);
  }

  /**
   * Execute an HTTP request and return parsed JSON.
   */
  async request<T>(options: TransportRequestOptions): Promise<T> {
    const headers = this.buildHeaders(options.headers);
    let response: Response;

    try {
      response = await this.fetchFn(options.url, {
        method: options.method,
        headers,
        body: options.body,
        signal: options.signal,
      });
    } catch (err) {
      throw new NetworkError(
        `Network request failed: ${options.method} ${options.url}`,
        err instanceof Error ? err : undefined,
      );
    }

    return this.handleResponse<T>(response);
  }

  /**
   * Execute a raw fetch (for binary, streaming, etc.).
   * Returns the Response directly without JSON parsing.
   */
  async rawRequest(options: TransportRequestOptions): Promise<Response> {
    const headers = this.buildHeaders(options.headers);

    try {
      return await this.fetchFn(options.url, {
        method: options.method,
        headers,
        body: options.body,
        signal: options.signal,
      });
    } catch (err) {
      throw new NetworkError(
        `Network request failed: ${options.method} ${options.url}`,
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Build merged headers with defaults, auth, and per-request overrides.
   */
  private buildHeaders(
    extra?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": FHIR_JSON,
      accept: FHIR_JSON,
      ...this.defaultHeaders,
    };

    const token = this.getAccessToken();
    if (token) {
      headers["authorization"] = `Bearer ${token}`;
    }

    if (extra) {
      Object.assign(headers, extra);
    }

    return headers;
  }

  /**
   * Parse response body and map errors.
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown;

    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      if (!response.ok) {
        throw new FhirClientError(
          `Invalid JSON response: ${text.slice(0, 200)}`,
          response.status,
        );
      }
      // 2xx with non-JSON body — return text as unknown
      return text as unknown as T;
    }

    if (!response.ok) {
      this.throwTypedError(response.status, response.statusText, body);
    }

    return body as T;
  }

  /**
   * Map HTTP status + body to typed errors.
   */
  private throwTypedError(
    status: number,
    statusText: string,
    body: unknown,
  ): never {
    const outcome = isOperationOutcome(body) ? body : undefined;

    if (status === 404 && outcome) {
      throw new ResourceNotFoundError(outcome);
    }

    if (outcome) {
      throw new OperationOutcomeError(status, outcome);
    }

    // Non-OperationOutcome error (auth endpoints return { error, error_description })
    const obj = body as Record<string, unknown> | undefined;
    const message =
      (obj?.error_description as string) ??
      (obj?.error as string) ??
      `HTTP ${status} ${statusText}`;

    throw new FhirClientError(message, status);
  }
}

// =============================================================================
// Section 4: Helpers
// =============================================================================

function isOperationOutcome(value: unknown): value is OperationOutcome {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).resourceType === "OperationOutcome"
  );
}
