# fhir-client API Reference

## Table of Contents

- [FhirClient](#fhirclient)
- [SearchParamsBuilder](#searchparamsbuilder)
- [ClientSubscriptionManager](#clientsubscriptionmanager)
- [Authentication](#authentication)
- [Caching](#caching)
- [Error Classes](#error-classes)
- [Type Definitions](#type-definitions)

---

## FhirClient

Main client class for interacting with FHIR servers.

### Constructor

```typescript
new FhirClient(options: FhirClientOptions)
```

#### FhirClientOptions

```typescript
interface FhirClientOptions {
  baseUrl: string;                    // FHIR server base URL
  auth?: AuthConfig;                  // Authentication configuration
  cache?: CacheConfig;                // Cache configuration
  retry?: RetryConfig;                // Retry configuration
  batch?: BatchConfig;                // Auto-batch configuration
  logger?: Logger;                    // Custom logger
  fetch?: typeof fetch;               // Custom fetch implementation
}
```

### CRUD Methods

#### create()

Create a new resource.

```typescript
create<T extends Resource>(
  resourceType: string,
  resource: T,
  options?: RequestOptions
): Promise<T>
```

**Parameters:**
- `resourceType` - FHIR resource type (e.g., 'Patient')
- `resource` - Resource object to create
- `options` - Optional request options

**Returns:** Created resource with server-assigned ID and metadata

**Example:**
```typescript
const patient = await client.create('Patient', {
  resourceType: 'Patient',
  name: [{ family: 'Smith', given: ['John'] }]
});
```

---

#### read()

Read a resource by ID.

```typescript
read<T extends Resource>(
  resourceType: string,
  id: string,
  options?: RequestOptions
): Promise<T>
```

**Parameters:**
- `resourceType` - FHIR resource type
- `id` - Resource ID
- `options` - Optional request options

**Returns:** The requested resource

**Throws:**
- `ResourceNotFoundError` - If resource doesn't exist
- `OperationOutcomeError` - For other FHIR errors

**Example:**
```typescript
const patient = await client.read('Patient', 'patient-123');
```

---

#### update()

Update an existing resource.

```typescript
update<T extends Resource>(
  resourceType: string,
  id: string,
  resource: T,
  options?: RequestOptions
): Promise<T>
```

**Parameters:**
- `resourceType` - FHIR resource type
- `id` - Resource ID
- `resource` - Updated resource object
- `options` - Optional request options

**Returns:** Updated resource

**Example:**
```typescript
patient.active = false;
const updated = await client.update('Patient', 'patient-123', patient);
```

---

#### patch()

Patch a resource using JSON Patch.

```typescript
patch<T extends Resource>(
  resourceType: string,
  id: string,
  patch: JsonPatch[],
  options?: RequestOptions
): Promise<T>
```

**Parameters:**
- `resourceType` - FHIR resource type
- `id` - Resource ID
- `patch` - Array of JSON Patch operations
- `options` - Optional request options

**Returns:** Patched resource

**Example:**
```typescript
const patched = await client.patch('Patient', 'patient-123', [
  { op: 'replace', path: '/active', value: false },
  { op: 'add', path: '/telecom/-', value: { system: 'phone', value: '555-1234' } }
]);
```

---

#### delete()

Delete a resource.

```typescript
delete(
  resourceType: string,
  id: string,
  options?: RequestOptions
): Promise<void>
```

**Parameters:**
- `resourceType` - FHIR resource type
- `id` - Resource ID
- `options` - Optional request options

**Example:**
```typescript
await client.delete('Patient', 'patient-123');
```

---

### Search Methods

#### search()

Search for resources.

```typescript
search<T extends Resource>(
  resourceType: string,
  params?: SearchParams,
  options?: RequestOptions
): Promise<Bundle<T>>
```

**Parameters:**
- `resourceType` - FHIR resource type (or empty string for system-level search)
- `params` - Search parameters
- `options` - Optional request options

**Returns:** Bundle containing search results

**Example:**
```typescript
const bundle = await client.search('Patient', {
  family: 'Smith',
  birthdate: 'gt2000-01-01',
  _sort: 'birthdate',
  _count: '20'
});
```

---

#### searchByUrl()

Search using a full URL (useful for pagination).

```typescript
searchByUrl<T extends Resource>(
  url: string,
  options?: RequestOptions
): Promise<Bundle<T>>
```

**Parameters:**
- `url` - Full search URL
- `options` - Optional request options

**Returns:** Bundle containing search results

**Example:**
```typescript
const nextPage = await client.searchByUrl(bundle.link.find(l => l.relation === 'next')?.url);
```

---

### History Methods

#### history()

Get resource version history.

```typescript
history(
  resourceType?: string,
  id?: string,
  params?: SearchParams,
  options?: RequestOptions
): Promise<Bundle>
```

**Parameters:**
- `resourceType` - Optional resource type (omit for system history)
- `id` - Optional resource ID (omit for type history)
- `params` - Optional search parameters (_count, _since, etc.)
- `options` - Optional request options

**Returns:** Bundle of type 'history'

**Example:**
```typescript
// Instance history
const history = await client.history('Patient', 'patient-123');

// Type history
const typeHistory = await client.history('Patient');

// System history
const systemHistory = await client.history();
```

---

### Other Methods

#### batch()

Execute a batch or transaction Bundle.

```typescript
batch(
  bundle: Bundle,
  options?: RequestOptions
): Promise<Bundle>
```

**Parameters:**
- `bundle` - Bundle of type 'batch' or 'transaction'
- `options` - Optional request options

**Returns:** Bundle with responses

---

#### capabilities()

Get server CapabilityStatement.

```typescript
capabilities(options?: RequestOptions): Promise<CapabilityStatement>
```

**Returns:** Server's CapabilityStatement

**Example:**
```typescript
const capabilities = await client.capabilities();
console.log(capabilities.fhirVersion);
```

---

## SearchParamsBuilder

Fluent builder for constructing FHIR search parameters.

### Constructor

```typescript
new SearchParamsBuilder()
```

### Methods

#### where()

Add a search parameter.

```typescript
where(param: string, value: string): SearchParamsBuilder
```

**Example:**
```typescript
builder.where('family', 'Smith').where('given', 'John')
```

---

#### sort()

Add sort parameter.

```typescript
sort(param: string, order?: 'asc' | 'desc'): SearchParamsBuilder
```

**Example:**
```typescript
builder.sort('birthdate', 'desc')
```

---

#### count()

Set page size.

```typescript
count(n: number): SearchParamsBuilder
```

**Example:**
```typescript
builder.count(20)
```

---

#### offset()

Set offset (for servers that support it).

```typescript
offset(n: number): SearchParamsBuilder
```

---

#### include()

Add _include parameter.

```typescript
include(resourceType: string, param: string): SearchParamsBuilder
```

**Example:**
```typescript
builder.include('Patient', 'organization')
```

---

#### revInclude()

Add _revinclude parameter.

```typescript
revInclude(resourceType: string, param: string): SearchParamsBuilder
```

**Example:**
```typescript
builder.revInclude('Observation', 'subject')
```

---

#### summary()

Set _summary mode.

```typescript
summary(mode: 'true' | 'text' | 'data' | 'count' | 'false'): SearchParamsBuilder
```

---

#### elements()

Set _elements (field filtering).

```typescript
elements(...fields: string[]): SearchParamsBuilder
```

**Example:**
```typescript
builder.elements('id', 'name', 'birthDate')
```

---

#### build()

Build final SearchParams object.

```typescript
build(): SearchParams
```

**Returns:** SearchParams object ready for use with `client.search()`

---

## ClientSubscriptionManager

Manages WebSocket subscriptions for real-time resource updates.

### Constructor

```typescript
new ClientSubscriptionManager(options: SubscriptionManagerOptions)
```

#### SubscriptionManagerOptions

```typescript
interface SubscriptionManagerOptions {
  wsUrl: string;                    // WebSocket URL
  token?: string;                   // Authentication token
  reconnect?: boolean;              // Auto-reconnect (default: true)
  reconnectInterval?: number;       // Reconnect interval in ms (default: 5000)
}
```

### Methods

#### connect()

Connect to WebSocket server.

```typescript
connect(): Promise<void>
```

---

#### disconnect()

Disconnect from WebSocket server.

```typescript
disconnect(): void
```

---

#### subscribe()

Subscribe to resource updates.

```typescript
subscribe(subscription: { resourceType: string; id: string; criteria: string }): Promise<void>
```

---

### Events

#### on('notification', handler)

Listen for resource update notifications.

```typescript
on('notification', (event: SubscriptionNotificationEvent) => void): void
```

---

#### on('error', handler)

Listen for errors.

```typescript
on('error', (error: Error) => void): void
```

---

#### on('connected', handler)

Listen for connection events.

```typescript
on('connected', () => void): void
```

---

#### on('disconnected', handler)

Listen for disconnection events.

```typescript
on('disconnected', () => void): void
```

---

## Authentication

### AuthManager

Handles authentication and token management.

```typescript
class AuthManager {
  signIn(credentials?: AuthCredentials): Promise<LoginResponse>;
  signOut(): Promise<void>;
  refreshIfExpired(): Promise<void>;
  handleUnauthorized(): Promise<void>;
}
```

### Auth Utilities

#### generatePkceChallenge()

Generate PKCE challenge for authorization code flow.

```typescript
generatePkceChallenge(): Promise<{ codeVerifier: string; codeChallenge: string }>
```

---

#### base64UrlEncode()

Base64 URL-safe encoding.

```typescript
base64UrlEncode(buffer: ArrayBuffer): string
```

---

## Caching

### LRUCache

Generic LRU cache with TTL support.

```typescript
class LRUCache<K, V> {
  constructor(options: { maxSize: number; ttl?: number });
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): void;
  clear(): void;
  has(key: K): boolean;
  get size(): number;
}
```

---

### ResourceCache

FHIR-specific caching with automatic invalidation.

```typescript
class ResourceCache {
  constructor(options: CacheConfig);
  getCachedRead<T>(type: string, id: string): T | undefined;
  cacheRead<T>(type: string, id: string, resource: T): void;
  getCachedSearch<T>(type: string, params: SearchParams): Bundle<T> | undefined;
  cacheSearch<T>(type: string, params: SearchParams, bundle: Bundle<T>): void;
  invalidate(type: string, id?: string): void;
  clear(): void;
}
```

---

## Error Classes

### FhirClientError

Base error class.

```typescript
class FhirClientError extends Error {
  constructor(message: string, cause?: unknown);
}
```

---

### OperationOutcomeError

FHIR OperationOutcome error.

```typescript
class OperationOutcomeError extends FhirClientError {
  outcome: OperationOutcome;
  statusCode: number;
}
```

---

### NetworkError

Network/connectivity error.

```typescript
class NetworkError extends FhirClientError {
  statusCode?: number;
}
```

---

### UnauthenticatedError

Authentication failure.

```typescript
class UnauthenticatedError extends FhirClientError {
  statusCode: 401;
}
```

---

### ResourceNotFoundError

Resource not found (404).

```typescript
class ResourceNotFoundError extends FhirClientError {
  statusCode: 404;
  resourceType: string;
  id: string;
}
```

---

## Type Definitions

### Resource

```typescript
interface Resource {
  resourceType: string;
  id?: string;
  meta?: Meta;
  [key: string]: any;
}
```

---

### Bundle

```typescript
interface Bundle<T extends Resource = Resource> {
  resourceType: 'Bundle';
  type: 'searchset' | 'history' | 'transaction' | 'batch' | 'collection' | 'document';
  total?: number;
  link?: BundleLink[];
  entry?: BundleEntry<T>[];
}
```

---

### OperationOutcome

```typescript
interface OperationOutcome {
  resourceType: 'OperationOutcome';
  issue: OperationOutcomeIssue[];
}

interface OperationOutcomeIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  diagnostics?: string;
  expression?: string[];
}
```

---

### SearchParams

```typescript
type SearchParams = Record<string, string | string[]>;
```

---

### RequestOptions

```typescript
interface RequestOptions {
  signal?: AbortSignal;           // For request cancellation
  headers?: Record<string, string>;
  skipCache?: boolean;            // Skip cache for this request
  skipRetry?: boolean;            // Skip retry for this request
  skipBatch?: boolean;            // Skip auto-batching for this request
}
```

---

For complete type definitions, see the [source code](https://github.com/nicefhir/fhir-studio/tree/main/packages/fhir-client/src/types).
