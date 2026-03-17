/**
 * fhir-client Public Types
 *
 * Self-contained FHIR R4 types for the client SDK.
 * Zero fhir-* runtime dependencies.
 *
 * @module fhir-client/types
 */

// =============================================================================
// Section 1: FHIR R4 Base Types
// =============================================================================

/**
 * Minimal FHIR resource shape.
 * The client does not validate resource structure — that's the server's job.
 */
export interface Resource {
  resourceType: string;
  id?: string;
  meta?: Meta;
  [key: string]: unknown;
}

/** Resource metadata. */
export interface Meta {
  versionId?: string;
  lastUpdated?: string;
  [key: string]: unknown;
}

/** FHIR Bundle. */
export interface Bundle<T extends Resource = Resource> {
  resourceType: "Bundle";
  type: string;
  total?: number;
  link?: BundleLink[];
  entry?: BundleEntry<T>[];
}

/** Bundle link (pagination). */
export interface BundleLink {
  relation: string;
  url: string;
}

/** Bundle entry. */
export interface BundleEntry<T extends Resource = Resource> {
  fullUrl?: string;
  resource?: T;
  search?: { mode: string };
  request?: { method: string; url: string };
  response?: {
    status: string;
    location?: string;
    etag?: string;
    lastModified?: string;
  };
}

/** FHIR OperationOutcome. */
export interface OperationOutcome {
  resourceType: "OperationOutcome";
  issue: OperationOutcomeIssue[];
}

/** OperationOutcome issue. */
export interface OperationOutcomeIssue {
  severity: string;
  code: string;
  diagnostics?: string;
  details?: { text?: string };
}

/** FHIR CapabilityStatement (minimal shape). */
export interface CapabilityStatement {
  resourceType: "CapabilityStatement";
  status: string;
  fhirVersion?: string;
  [key: string]: unknown;
}

// =============================================================================
// Section 2: JSON Patch (RFC 6902)
// =============================================================================

/** A single JSON Patch operation. */
export interface JsonPatch {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

// =============================================================================
// Section 3: Client Configuration
// =============================================================================

/** Options for creating a FhirClient instance. */
export interface FhirClientOptions {
  /** Base URL of the FHIR server (e.g., "http://localhost:8080"). */
  baseUrl: string;
  /** Authentication configuration. */
  auth?: AuthConfig;
  /** Cache configuration. */
  cache?: CacheConfig;
  /** Retry configuration. */
  retry?: RetryConfig;
  /** Auto-batch configuration. */
  batch?: BatchConfig;
  /** Custom fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Default headers for all requests. */
  defaultHeaders?: Record<string, string>;
  /** Callback when authentication fails permanently (401 after refresh). */
  onUnauthenticated?: () => void;
  /** Logger function. */
  logger?: Logger;
}

// =============================================================================
// Section 4: Auth Types
// =============================================================================

/** Authentication configuration. */
export interface AuthConfig {
  /** Initial credentials. */
  credentials?: AuthCredentials;
  /** Token refresh grace period in ms (default: 300000 = 5 min). */
  refreshGracePeriod?: number;
  /** Token storage implementation. */
  tokenStorage?: TokenStorage;
}

/** Credential types for signIn(). */
export type AuthCredentials =
  | { type: "bearer"; accessToken: string; refreshToken?: string }
  | { type: "client"; clientId: string; clientSecret: string; tokenUrl: string }
  | {
      type: "pkce";
      clientId: string;
      redirectUri: string;
      authorizationUrl: string;
      tokenUrl: string;
    }
  | { type: "password"; email: string; password: string };

/** Stored login state. */
export interface LoginState {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/** Token storage interface. */
export interface TokenStorage {
  get(key: string): string | null | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/** Response from POST /auth/login. */
export interface LoginResponse {
  login: string;
  code: string;
  memberships?: Array<{
    id: string;
    project: { reference: string };
    profile?: { reference: string };
  }>;
}

/** Response from POST /oauth2/token. */
export interface TokenResponse {
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  access_token: string;
  refresh_token?: string;
  project?: { reference: string };
  profile?: { reference: string };
}

// =============================================================================
// Section 5: Cache Config
// =============================================================================

/** Cache configuration. */
export interface CacheConfig {
  /** Max number of cached items (default: 1000, 0 = disabled). */
  maxSize?: number;
  /** Cache TTL in ms (default: 60000 for browser, 0 for Node). */
  ttl?: number;
  /** Enable cache (default: true). */
  enabled?: boolean;
}

// =============================================================================
// Section 6: Retry Config
// =============================================================================

/** Retry configuration. */
export interface RetryConfig {
  /** Max retry attempts (default: 3). */
  maxRetries?: number;
  /** Base delay in ms (default: 500). */
  baseDelay?: number;
  /** Max delay in ms (default: 30000). */
  maxDelay?: number;
  /** HTTP status codes to retry on (default: [429, 500, 502, 503, 504]). */
  retryOn?: number[];
}

// =============================================================================
// Section 7: Batch Config
// =============================================================================

/** Auto-batch configuration. */
export interface BatchConfig {
  /** Enable auto-batching (default: false). */
  enabled?: boolean;
  /** Delay before flushing in ms (default: 20). */
  windowMs?: number;
  /** Max entries per batch (default: 20). */
  maxSize?: number;
}

// =============================================================================
// Section 8: Search / Request Types
// =============================================================================

/** Search parameters. */
export type SearchParams = Record<string, string | string[]>;

/** Per-request options. */
export interface RequestOptions {
  /** Override cache behavior. */
  cache?: "default" | "no-cache" | "reload";
  /** AbortSignal for timeout/cancellation. */
  signal?: AbortSignal;
  /** Extra headers for this request. */
  headers?: Record<string, string>;
}

/** An array of resources that also carries the original Bundle. */
export type ResourceArray<T extends Resource = Resource> = T[] & {
  bundle: Bundle<T>;
};

// =============================================================================
// Section 9: Batch Queue
// =============================================================================

/** A queued request in the auto-batch queue. */
export interface BatchQueueEntry {
  method: string;
  url: string;
  resource?: Resource;
  resolve: (value: Resource | OperationOutcome) => void;
  reject: (error: Error) => void;
}

// =============================================================================
// Section 10: Logger
// =============================================================================

/** Logger interface. */
export interface Logger {
  debug?(message: string, ...args: unknown[]): void;
  info?(message: string, ...args: unknown[]): void;
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}
