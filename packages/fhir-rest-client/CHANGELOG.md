# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-18

### Added

#### Phase 005: IG Data Loading + Layered Cache

- **`loadIGList()`** — Task 5.1
  - `GET /_admin/ig/list` → returns `IGSummary[]`
  - Cached in L1 (session-level LRU)

- **`loadIGIndex(igId)`** — Task 5.2
  - `GET /_ig/{igId}/index` → returns `IGIndex` (profiles, extensions, valueSets, codeSystems, searchParameters)
  - ETag/If-None-Match support for cache revalidation

- **`loadIGStructure(igId, sdId)`** — Task 5.3
  - `GET /_ig/{igId}/structure/{sdId}` → returns `IGStructureResult` (full SD + dependencies[])
  - ETag/304 support — avoids re-downloading unchanged SDs

- **`loadIGBundle(igId, resourceRefs[])`** — Task 5.4
  - `POST /_ig/{igId}/bundle` → batch-loads multiple resources as FHIR Collection Bundle
  - L1 cache deduplication — already-cached resources are not re-requested
  - Parses standard `entry[].resource` format (ADR-002)

- **ETag / If-None-Match Support** — Task 5.5
  - `CacheEntry` now stores `etag` field
  - New `cachedGetWithETag()` private method: sends `If-None-Match`, handles 304
  - Used by `loadIGIndex()` and `loadIGStructure()`

- **IG Type Definitions** — Task 5.6
  - `IGSummary` — IG summary from server
  - `IGIndex` — IG content index (lightweight navigation data)
  - `IGResourceRef` — reference to a resource within an IG
  - `IGStructureResult` — SD + dependencies result
  - All types exported from package root

- **L2 IndexedDB Cache** — Task 5.7
  - `IGIndexedDBCache` class in `src/cache/ig-indexeddb-cache.ts`
  - DB: `fhir-client-ig-cache`, store: `resources`
  - Lookup chain: L1 memory → L2 IndexedDB → L3 server
  - `invalidateIG(igId, version)` for version-aware cache busting
  - Default disabled; enable via `igCacheEnabled: true` in config

#### Testing

- 14 new tests for IG client methods (all passing)
  - `loadIGList()`: 2 tests
  - `loadIGIndex()`: 3 tests
  - `loadIGStructure()`: 3 tests
  - `loadIGBundle()`: 3 tests
  - ETag/If-None-Match: 2 tests
  - Type exports: 1 test

### Changed

- **`MedXAIClientConfig`** — Added `igCacheEnabled?: boolean` option
- **`CacheEntry`** — Added optional `etag` field for ETag storage

### Dependencies

- Requires `fhir-server` v0.2.0+ (Phase-fhir-server-004 `/_ig/` routes)
- Still zero runtime dependencies

---

## [0.1.0] - 2026-03-17

### Added

#### Core Features

- **FhirClient** main class with complete FHIR R4 REST API support
- Zero runtime dependencies - fully self-contained
- Cross-platform support (Browser + Node.js 18+)
- Full TypeScript support with comprehensive type definitions

#### Authentication (AUTH-01~03)

- Multiple authentication methods:
  - Bearer token authentication
  - Client credentials flow (OAuth2)
  - Resource owner password flow (OAuth2)
  - PKCE (Proof Key for Code Exchange) for browser apps
- **TokenStore** with pluggable storage:
  - `MemoryTokenStorage` for Node.js/testing
  - `LocalStorageTokenStorage` for browsers
- **AuthManager** with automatic token refresh
- **PKCE utilities**: `generatePkceChallenge()`, `base64UrlEncode()`

#### CRUD Operations (CLI-01)

- `create()` - Create new resources
- `read()` - Read resources by ID
- `update()` - Update existing resources
- `patch()` - JSON Patch support
- `delete()` - Delete resources
- `capabilities()` - Fetch server CapabilityStatement

#### Search & Query (CLI-02, QUERY-01)

- `search()` - Type-level and system-level search
- `searchByUrl()` - Search by full URL for pagination
- **SearchParamsBuilder** - Fluent query builder with:
  - `where()` - Add search parameters
  - `sort()` - Sort results
  - `count()` - Page size
  - `include()` - Include related resources
  - `revInclude()` - Reverse includes
  - `summary()` - Summary mode
  - `elements()` - Element filtering

#### History (CLI-02)

- `history()` - Resource version history
- Instance, type, and system-level history support

#### Caching (CACHE-01~02)

- **LRUCache** - Generic LRU cache with TTL support
- **ResourceCache** - FHIR-specific caching with:
  - Read and search result caching
  - Automatic cache invalidation on mutations
  - Configurable max size and TTL
  - Precise invalidation on create/update/delete

#### Retry Logic (RETRY-01)

- **RetryHandler** with exponential backoff
- Configurable retry attempts and delays
- Automatic retry on 429 (rate limit) and 5xx errors
- Exponential backoff with factor 1.5

#### Auto-Batching (BATCH-01)

- **AutoBatcher** for automatic request batching
- Configurable batch window and max batch size
- Transparent batching of concurrent requests
- Automatic Bundle creation and response distribution

#### Subscriptions (SUB-01)

- **ClientSubscriptionManager** for real-time updates
- WebSocket-based subscriptions
- Automatic reconnection with configurable interval
- Event-based notification system
- Support for subscription criteria

#### Transport Layer (TRS-01)

- **HttpTransport** - Fetch-based HTTP client
- Automatic FHIR JSON content-type handling
- Request/response interceptors
- AbortSignal support for request cancellation
- Comprehensive error mapping to FHIR OperationOutcome

#### Error Handling (ERR-01)

- **FhirClientError** base class
- Specialized error types:
  - `OperationOutcomeError` - FHIR OperationOutcome errors
  - `NetworkError` - Network/connectivity errors
  - `UnauthenticatedError` - Authentication failures
  - `ResourceNotFoundError` - 404 errors
- Automatic error mapping from HTTP responses

#### Type System (TYP-01)

- Complete FHIR R4 type definitions:
  - `Resource`, `Bundle`, `BundleEntry`
  - `OperationOutcome`, `OperationOutcomeIssue`
  - `CapabilityStatement`
  - `Meta`, `Coding`, `Reference`
- Client configuration types:
  - `FhirClientOptions`
  - `AuthConfig`, `AuthCredentials`
  - `CacheConfig`, `RetryConfig`, `BatchConfig`
  - `SearchParams`, `RequestOptions`
- Authentication types:
  - `LoginState`, `LoginResponse`, `TokenResponse`
  - `TokenStorage` interface

#### Testing

- 102 tests passing across 6 test files:
  - `auth-manager.test.ts` - Authentication flows
  - `auto-batcher.test.ts` - Batch processing
  - `fhir-client.test.ts` - Main client operations
  - `resource-cache.test.ts` - Cache behavior
  - `retry-handler.test.ts` - Retry logic
  - `search-params-builder.test.ts` - Query building

#### Package Configuration (PKG-01~04)

- Dual ESM/CJS builds with proper exports
- Tree-shakeable modules
- Declaration files with source maps
- Zero runtime dependencies
- Optimized bundle sizes

### Architecture

Modular layer-based architecture:

1. **Types Layer** - Type definitions and interfaces
2. **Error Layer** - Error hierarchy and handling
3. **Transport Layer** - HTTP communication
4. **Auth Layer** - Authentication and token management
5. **Cache Layer** - Resource and search caching
6. **Retry Layer** - Automatic retry with backoff
7. **Batch Layer** - Request batching
8. **Query Layer** - Search parameter building
9. **Subscription Layer** - Real-time updates
10. **Client Layer** - Main FhirClient class

### Technical Details

- **Build System**: TypeScript + esbuild for dual ESM/CJS output
- **Test Framework**: Vitest
- **Code Quality**: Strict TypeScript, comprehensive error handling
- **Browser Support**: Modern browsers with native fetch/crypto
- **Node.js Support**: 18+ (native fetch and crypto.subtle)

### Known Limitations

Deferred to v0.2.0:

- WebSocket subscription tests (require mock WebSocket server)
- Conditional CRUD operations (If-Match, If-None-Match headers)
- Advanced search features (chained parameters, composite parameters)
- Resource builder utilities
- GraphQL support

[0.1.0]: https://github.com/nicefhir/fhir-studio/releases/tag/fhir-rest-client-v0.1.0
