# fhir-server API Reference

## Table of Contents

- [FhirServer](#fhirserver)
- [Error Classes](#error-classes)
- [OperationOutcome Builders](#operationoutcome-builders)
- [Middleware](#middleware)
- [Router](#router)
- [Controllers](#controllers)
- [Capability Statement](#capability-statement)
- [Subscription Manager](#subscription-manager)
- [Type Definitions](#type-definitions)

---

## FhirServer

Main server class for running a FHIR R4 REST API server.

### Constructor

```typescript
new FhirServer(options: FhirServerOptions)
```

#### FhirServerOptions

```typescript
interface FhirServerOptions {
  engine: FhirEngine;                 // Required: FHIR engine instance
  port?: number;                      // Default: 3000
  host?: string;                      // Default: '0.0.0.0'
  logger?: boolean | object;          // Fastify logger config
  trustProxy?: boolean;               // If behind reverse proxy
  cors?: CorsConfig;                  // CORS configuration
  rateLimit?: RateLimitConfig;        // Rate limiting configuration
  auth?: AuthConfig;                  // Authentication configuration
}
```

### Methods

#### start()

Start the FHIR server.

```typescript
start(): Promise<void>
```

**Example:**
```typescript
const server = new FhirServer({ engine });
await server.start();
console.log(`Server running at ${server.getAddress()}`);
```

---

#### stop()

Stop the server gracefully.

```typescript
stop(): Promise<void>
```

**Example:**
```typescript
await server.stop();
```

---

#### getAddress()

Get the server's listening address.

```typescript
getAddress(): string
```

**Returns:** Server address (e.g., 'http://127.0.0.1:3000')

---

### Properties

#### app

Access the underlying Fastify instance for custom middleware.

```typescript
readonly app: FastifyInstance
```

**Example:**
```typescript
server.app.addHook('onRequest', async (request, reply) => {
  console.log('Request:', request.method, request.url);
});
```

---

## Error Classes

### FhirServerError

Base error class for all FHIR server errors.

```typescript
class FhirServerError extends Error {
  statusCode: number;
  outcome: OperationOutcome;
}
```

---

### Specialized Error Classes

All extend `FhirServerError`:

```typescript
class BadRequestError extends FhirServerError          // 400
class UnauthorizedError extends FhirServerError        // 401
class ForbiddenError extends FhirServerError           // 403
class ResourceNotFoundError extends FhirServerError    // 404
class MethodNotAllowedError extends FhirServerError    // 405
class ConflictError extends FhirServerError            // 409
class ResourceGoneError extends FhirServerError        // 410
class PreconditionFailedError extends FhirServerError  // 412
class ValidationError extends FhirServerError          // 422
class TooManyRequestsError extends FhirServerError     // 429
class InternalServerError extends FhirServerError      // 500
```

**Example:**
```typescript
import { ResourceNotFoundError } from 'fhir-server';

throw new ResourceNotFoundError('Patient', 'patient-123');
```

---

## OperationOutcome Builders

Utility functions for creating OperationOutcome resources.

### operationOutcome()

Create a generic OperationOutcome.

```typescript
operationOutcome(
  severity: IssueSeverity,
  code: IssueCode,
  diagnostics: string,
  expression?: string[]
): OperationOutcome
```

---

### Convenience Builders

```typescript
allOk(): OperationOutcome                              // Success
notFound(diagnostics: string): OperationOutcome        // 404
gone(diagnostics: string): OperationOutcome            // 410
conflict(diagnostics: string): OperationOutcome        // 409
badRequest(diagnostics: string): OperationOutcome      // 400
serverError(diagnostics: string): OperationOutcome     // 500
notSupported(diagnostics: string): OperationOutcome    // 501
unauthorized(diagnostics: string): OperationOutcome    // 401
forbidden(diagnostics: string): OperationOutcome       // 403
```

**Example:**
```typescript
import { notFound } from 'fhir-server';

const outcome = notFound('Patient/123 not found');
```

---

### errorToOutcome()

Convert errors to OperationOutcome with appropriate HTTP status.

```typescript
errorToOutcome(error: Error): { outcome: OperationOutcome; status: number }
```

Maps fhir-engine errors:
- `ResourceNotFoundError` → 404
- `ResourceGoneError` → 410
- `ResourceVersionConflictError` → 409

---

## Response Headers

### buildETag()

Build ETag header from resource version.

```typescript
buildETag(versionId: string): string
```

---

### parseETag()

Parse ETag header to extract version ID.

```typescript
parseETag(etag: string): string | null
```

---

### buildLastModified()

Build Last-Modified header.

```typescript
buildLastModified(lastModified: string): string
```

---

### buildLocationHeader()

Build Location header for created resources.

```typescript
buildLocationHeader(baseUrl: string, type: string, id: string, versionId?: string): string
```

---

### buildResourceHeaders()

Build all standard FHIR resource headers.

```typescript
buildResourceHeaders(resource: PersistedResource, baseUrl: string): FhirResponseHeaders
```

**Returns:**
```typescript
interface FhirResponseHeaders {
  'Content-Type': 'application/fhir+json; charset=utf-8';
  'ETag'?: string;
  'Last-Modified'?: string;
  'Location'?: string;
}
```

---

## Middleware

### registerSecurityHeaders()

Register Helmet security headers.

```typescript
registerSecurityHeaders(app: FastifyInstance): void
```

---

### registerCors()

Register CORS middleware.

```typescript
registerCors(app: FastifyInstance, config?: CorsConfig): void
```

#### CorsConfig

```typescript
interface CorsConfig {
  enabled?: boolean;
  origin?: string | string[] | RegExp;
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
}
```

---

### registerRateLimit()

Register rate limiting middleware.

```typescript
registerRateLimit(app: FastifyInstance, config?: RateLimitConfig): void
```

#### RateLimitConfig

```typescript
interface RateLimitConfig {
  enabled?: boolean;
  max?: number;              // Max requests per window
  timeWindow?: number;       // Window in milliseconds
  skipOnError?: boolean;
}
```

---

### registerRequestLogger()

Register request/response logger.

```typescript
registerRequestLogger(app: FastifyInstance): void
```

---

### registerRequestContext()

Register FHIR request context parser.

```typescript
registerRequestContext(app: FastifyInstance): void
```

Parses:
- Content-Type (validates `application/fhir+json`)
- Accept header
- Prefer header

---

## Router

### fhirRouter()

Register all FHIR REST API routes.

```typescript
fhirRouter(app: FastifyInstance, engine: FhirEngine): void
```

Registers routes:
- `GET /metadata` - CapabilityStatement
- `POST /{type}` - Create
- `GET /{type}/{id}` - Read
- `PUT /{type}/{id}` - Update
- `PATCH /{type}/{id}` - Patch
- `DELETE /{type}/{id}` - Delete
- `GET /{type}` - Search (type-level)
- `GET /` - Search (system-level)
- `GET /{type}/{id}/_history` - Instance history
- `GET /{type}/_history` - Type history
- `GET /_history` - System history
- `GET /{type}/{id}/_history/{vid}` - Version read
- `POST /` - Batch/Transaction
- `POST /{type}/$validate` - Validate
- `POST /ValueSet/$expand` - Expand
- `GET /CodeSystem/$lookup` - Lookup
- `GET /ValueSet/$validate-code` - Validate code

---

## Controllers

Controllers handle FHIR REST operations. They are used internally by the router.

### CrudController

```typescript
class CrudController {
  create(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  read(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  update(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  patch(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  delete(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}
```

---

### SearchController

```typescript
class SearchController {
  searchType(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  searchSystem(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}
```

Supports:
- Search parameters
- `_include` and `_revinclude`
- `_count` and `_offset` (pagination)
- `_sort`
- `_summary`
- `_elements`

---

### HistoryController

```typescript
class HistoryController {
  historyInstance(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  historyType(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  historySystem(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  versionRead(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}
```

---

### BundleController

```typescript
class BundleController {
  processBatch(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}
```

**Note:** Transaction bundles return 501 (Not Implemented) in v0.1.0.

---

## Capability Statement

### generateCapabilityStatement()

Generate server CapabilityStatement.

```typescript
generateCapabilityStatement(
  engine: FhirEngine,
  baseUrl: string
): Promise<CapabilityStatement>
```

Delegates to `engine.capabilities()` if available, otherwise generates a fallback.

---

### cacheCapabilityStatement()

Cache CapabilityStatement with ETag support.

```typescript
cacheCapabilityStatement(
  statement: CapabilityStatement
): { etag: string; statement: CapabilityStatement }
```

---

## Subscription Manager

Manages FHIR subscriptions and notifications.

### Constructor

```typescript
new SubscriptionManager(options: { engine: FhirEngine })
```

### Methods

#### evaluateResource()

Evaluate a resource against active subscriptions.

```typescript
evaluateResource(resource: Resource): Promise<void>
```

Emits `notification` events for matching subscriptions.

---

### Events

#### on('notification', handler)

Listen for subscription notifications.

```typescript
on('notification', (event: SubscriptionEvent) => void): void
```

**SubscriptionEvent:**
```typescript
interface SubscriptionEvent {
  subscription: Resource;    // The Subscription resource
  resource: Resource;        // The resource that triggered the subscription
  timestamp: string;
}
```

---

## Type Definitions

### FhirEngine

Main engine interface that the server requires.

```typescript
interface FhirEngine {
  // CRUD
  createResource(type: string, resource: Resource): Promise<PersistedResource>;
  readResource(type: string, id: string): Promise<PersistedResource>;
  updateResource(type: string, resource: PersistedResource): Promise<PersistedResource>;
  deleteResource(type: string, id: string): Promise<void>;
  
  // Search
  search(
    type: string,
    params: Record<string, string>,
    options?: SearchOptions
  ): Promise<SearchResult>;
  
  // History
  historyInstance(type: string, id: string, params?: Record<string, string>): Promise<Bundle>;
  historyType(type: string, params?: Record<string, string>): Promise<Bundle>;
  historySystem(params?: Record<string, string>): Promise<Bundle>;
  
  // Validation
  validate(resource: Resource): Promise<ValidationResult>;
  
  // Metadata
  status(): Promise<FhirEngineStatus>;
  capabilities?(): Promise<CapabilityStatement>;
}
```

---

### Resource

```typescript
interface Resource {
  resourceType: string;
  id?: string;
  meta?: ResourceMeta;
  [key: string]: any;
}
```

---

### PersistedResource

Resource with guaranteed ID and metadata.

```typescript
interface PersistedResource extends Resource {
  id: string;
  meta: ResourceMeta & {
    versionId: string;
    lastUpdated: string;
  };
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

### SearchResult

```typescript
interface SearchResult {
  total?: number;
  entry: Array<{ resource: Resource }>;
  included?: Resource[];
}
```

---

### SearchOptions

```typescript
interface SearchOptions {
  count?: number;
  offset?: number;
  sort?: string;
  summary?: boolean;
  elements?: string[];
  include?: string[];
  revInclude?: string[];
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

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  outcome: OperationOutcome;
}
```

---

### FhirEngineStatus

```typescript
interface FhirEngineStatus {
  status: 'ok' | 'degraded' | 'error';
  version?: string;
  resourceTypes?: string[];
  [key: string]: any;
}
```

---

## Authentication

### AuthConfig

```typescript
interface AuthConfig {
  enabled?: boolean;
  jwtSecret?: string;
  jwtAlgorithm?: string;
  requireAuth?: boolean;
  publicPaths?: string[];
}
```

### JWT Token Payload

Expected JWT payload structure:

```typescript
interface JwtPayload {
  sub: string;              // User ID
  email?: string;
  roles?: string[];
  iat: number;              // Issued at
  exp: number;              // Expiration
}
```

### Access in Request Handler

```typescript
app.get('/example', async (request, reply) => {
  const user = request.authState?.user;
  if (user) {
    console.log('User ID:', user.sub);
  }
});
```

---

## Error Handler

### fhirErrorHandler()

Global error handler that converts errors to FHIR OperationOutcome.

```typescript
fhirErrorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void>
```

Automatically registered by FhirServer.

---

For complete type definitions, see the [source code](https://github.com/nicefhir/fhir-studio/tree/main/packages/fhir-server/src/types).
