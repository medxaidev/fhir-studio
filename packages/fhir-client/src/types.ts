/**
 * FHIR Client Types
 *
 * Minimal FHIR resource types for the client SDK.
 * These are intentionally loose — the client does not validate
 * resource structure (that's the server's job).
 *
 * @module fhir-client
 */

// =============================================================================
// Section 1: Resource Types
// =============================================================================

/**
 * Minimal FHIR resource shape.
 */
export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * FHIR Bundle resource.
 */
export interface Bundle<T extends FhirResource = FhirResource> {
  resourceType: "Bundle";
  type: string;
  total?: number;
  link?: Array<{ relation: string; url: string }>;
  entry?: Array<{
    fullUrl?: string;
    resource?: T;
    search?: { mode: string };
    request?: { method: string; url: string };
    response?: { status: string; location?: string; etag?: string; lastModified?: string };
  }>;
}

/**
 * FHIR OperationOutcome resource.
 */
export interface OperationOutcome {
  resourceType: "OperationOutcome";
  issue: Array<{
    severity: string;
    code: string;
    diagnostics?: string;
    details?: { text?: string };
  }>;
}

// =============================================================================
// Section 2: Auth Types
// =============================================================================

/**
 * Response from `POST /auth/login`.
 */
export interface LoginResponse {
  login: string;
  code: string;
  memberships?: Array<{
    id: string;
    project: { reference: string };
    profile?: { reference: string };
  }>;
}

/**
 * Response from `POST /oauth2/token`.
 */
export interface TokenResponse {
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  access_token: string;
  refresh_token?: string;
  project?: { reference: string };
  profile?: { reference: string };
}

/**
 * Combined result from the signIn convenience method.
 */
export interface SignInResult {
  /** The access token (already set on the client). */
  accessToken: string;
  /** The refresh token (if offline scope was requested). */
  refreshToken?: string;
  /** Token lifetime in seconds. */
  expiresIn: number;
  /** Project reference from the token response. */
  project?: { reference: string };
  /** Profile reference from the token response. */
  profile?: { reference: string };
}

// =============================================================================
// Section 3: JSON Patch Types
// =============================================================================

/**
 * A single JSON Patch operation (RFC 6902).
 */
export interface PatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

// =============================================================================
// Section 4: Client Configuration
// =============================================================================

/**
 * Configuration for the MedXAI FHIR client.
 */
export interface MedXAIClientConfig {
  /** Base URL of the FHIR server (e.g., "http://localhost:8080"). */
  baseUrl: string;
  /** Optional access token for authenticated requests. */
  accessToken?: string;
  /** Optional fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** LRU resource cache capacity (default: 1000, 0 = disabled). */
  cacheSize?: number;
  /** Cache TTL in milliseconds (default: 60000 for browser, 0 for Node). */
  cacheTime?: number;
  /** Max retry attempts for 429/5xx (default: 2, total 3 attempts). */
  maxRetries?: number;
  /** Max total retry wait in ms (default: 2000). */
  maxRetryTime?: number;
  /** Token refresh grace period in ms (default: 300000 = 5 min). */
  refreshGracePeriod?: number;
  /** Callback when authentication fails permanently. */
  onUnauthenticated?: () => void;
}

// =============================================================================
// Section 5: Request Options
// =============================================================================

/**
 * Per-request options for advanced control.
 */
export interface RequestOptions {
  /** Override cache behavior: 'no-cache' skips reading cache. */
  cache?: 'default' | 'no-cache' | 'reload';
  /** Signal to abort the request. */
  signal?: AbortSignal;
}

/**
 * An array of resources that also carries the original Bundle.
 */
export type ResourceArray<T extends FhirResource = FhirResource> = T[] & {
  bundle: Bundle<T>;
};

// =============================================================================
// Section 6: Auto-Batch Types
// =============================================================================

/**
 * A queued request in the auto-batch queue.
 */
export interface BatchQueueEntry {
  /** Bundle entry request method. */
  method: string;
  /** Bundle entry request URL (relative). */
  url: string;
  /** Resource body (for POST/PUT). */
  resource?: FhirResource;
  /** Resolve callback for the Promise returned to the caller. */
  resolve: (value: FhirResource | OperationOutcome) => void;
  /** Reject callback. */
  reject: (error: Error) => void;
}

// =============================================================================
// Section 7: Error Types
// =============================================================================

/**
 * Error thrown by the FHIR client when the server returns an error response.
 */
export class FhirClientError extends Error {
  readonly status: number;
  readonly outcome?: OperationOutcome;

  constructor(status: number, message: string, outcome?: OperationOutcome) {
    super(message);
    this.name = "FhirClientError";
    this.status = status;
    this.outcome = outcome;
  }
}
