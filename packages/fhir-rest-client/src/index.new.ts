/**
 * `fhir-client` v0.1.0 — Public API
 *
 * FHIR R4 TypeScript HTTP SDK.
 * Zero fhir-* runtime dependencies, cross-platform (Browser + Node.js 18+).
 *
 * @packageDocumentation
 */

// Client
export { FhirClient } from "./client/fhir-client.js";

// Query Builder
export { SearchParamsBuilder } from "./query/search-params-builder.js";

// Subscription
export { ClientSubscriptionManager } from "./subscription/subscription-manager.js";
export type {
  SubscriptionEvent,
  SubscriptionNotificationEvent,
  SubscriptionManagerOptions,
} from "./subscription/subscription-manager.js";

// Auth utilities
export { generatePkceChallenge, base64UrlEncode } from "./auth/pkce.js";
export { TokenStore, MemoryTokenStorage, LocalStorageTokenStorage } from "./auth/token-store.js";
export { AuthManager } from "./auth/auth-manager.js";

// Cache
export { LRUCache } from "./cache/lru-cache.js";
export { ResourceCache } from "./cache/resource-cache.js";

// Errors
export {
  FhirClientError,
  OperationOutcomeError,
  NetworkError,
  UnauthenticatedError,
  ResourceNotFoundError,
} from "./errors/errors.js";

// Types
export type {
  Resource,
  Meta,
  Bundle,
  BundleLink,
  BundleEntry,
  OperationOutcome,
  OperationOutcomeIssue,
  CapabilityStatement,
  JsonPatch,
  FhirClientOptions,
  AuthConfig,
  AuthCredentials,
  LoginState,
  LoginResponse,
  TokenResponse,
  TokenStorage,
  CacheConfig,
  RetryConfig,
  BatchConfig,
  SearchParams,
  RequestOptions,
  ResourceArray,
  BatchQueueEntry,
  Logger,
} from "./types/index.js";
