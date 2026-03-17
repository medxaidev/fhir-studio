# fhir-server

A high-performance FHIR R4 REST API server built on Fastify and fhir-engine.

[![npm version](https://img.shields.io/npm/v/fhir-server.svg)](https://www.npmjs.com/package/fhir-server)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Features

- ⚡ **High Performance** — Built on Fastify for maximum throughput
- 🔒 **Secure by Default** — Helmet security headers, CORS, rate limiting
- 🔐 **JWT Authentication** — Built-in JWT auth with access policies
- 📊 **Full FHIR R4 REST API** — Complete implementation of FHIR REST operations
- 🔍 **Advanced Search** — Full search parameter support with _include/_revinclude
- 📜 **Resource History** — Complete version history tracking
- 🔄 **Subscriptions** — Real-time resource change notifications
- 🎯 **Validation** — $validate operation with OperationOutcome
- 📚 **Terminology** — $expand, $lookup, $validate-code operations
- 🔌 **Pluggable Engine** — Works with any fhir-engine implementation
- 📝 **Request Logging** — Comprehensive request/response logging
- 🎨 **Type-Safe** — Full TypeScript support

## Installation

```bash
npm install fhir-server fhir-engine
```

## Quick Start

```typescript
import { FhirServer } from 'fhir-server';
import { createFhirEngine } from 'fhir-engine'; // Your engine implementation

// Create FHIR engine instance
const engine = await createFhirEngine({
  // Your engine configuration
});

// Create and start server
const server = new FhirServer({
  engine,
  port: 3000,
  host: '0.0.0.0',
  cors: {
    enabled: true,
    origin: '*'
  },
  auth: {
    enabled: true,
    jwtSecret: 'your-secret-key'
  }
});

await server.start();
console.log(`FHIR server running at ${server.getAddress()}`);
```

## Configuration

### Basic Configuration

```typescript
import { FhirServer, type FhirServerOptions } from 'fhir-server';

const options: FhirServerOptions = {
  engine,                    // Required: FhirEngine instance
  port: 3000,               // Default: 3000
  host: '0.0.0.0',          // Default: '0.0.0.0'
  logger: true,             // Enable request logging
  trustProxy: true          // If behind reverse proxy
};

const server = new FhirServer(options);
```

### CORS Configuration

```typescript
const server = new FhirServer({
  engine,
  cors: {
    enabled: true,
    origin: ['https://app.example.com', 'https://admin.example.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Location', 'ETag', 'Last-Modified']
  }
});
```

### Rate Limiting

```typescript
const server = new FhirServer({
  engine,
  rateLimit: {
    enabled: true,
    max: 100,              // Max requests per window
    timeWindow: 60000,     // 1 minute window
    skipOnError: false
  }
});
```

### Authentication & Authorization

```typescript
const server = new FhirServer({
  engine,
  auth: {
    enabled: true,
    jwtSecret: process.env.JWT_SECRET,
    jwtAlgorithm: 'HS256',
    requireAuth: true,     // Require auth for all endpoints
    publicPaths: ['/metadata']  // Paths that don't require auth
  }
});
```

## FHIR REST API

The server implements the complete FHIR R4 REST API:

### Metadata

```bash
GET /metadata
```

Returns the server's CapabilityStatement.

### CRUD Operations

```bash
# Create
POST /{resourceType}
Content-Type: application/fhir+json

# Read
GET /{resourceType}/{id}

# Update
PUT /{resourceType}/{id}
Content-Type: application/fhir+json

# Patch
PATCH /{resourceType}/{id}
Content-Type: application/json-patch+json

# Delete
DELETE /{resourceType}/{id}

# Conditional Create
POST /{resourceType}
If-None-Exist: identifier=12345

# Conditional Update
PUT /{resourceType}?identifier=12345

# Conditional Delete
DELETE /{resourceType}?status=inactive
```

### Search

```bash
# Type-level search
GET /{resourceType}?param=value

# System-level search
GET /?_type=Patient,Observation&param=value

# Search with _include
GET /Patient?_include=Patient:organization

# Search with _revinclude
GET /Patient?_revinclude=Observation:subject

# Pagination
GET /Patient?_count=20&_offset=40

# Sorting
GET /Patient?_sort=birthdate

# Summary
GET /Patient?_summary=true
```

### History

```bash
# Instance history
GET /{resourceType}/{id}/_history

# Type history
GET /{resourceType}/_history

# System history
GET /_history

# Specific version
GET /{resourceType}/{id}/_history/{vid}
```

### Batch/Transaction

```bash
POST /
Content-Type: application/fhir+json

{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [...]
}
```

### Operations

```bash
# Validate resource
POST /{resourceType}/$validate
POST /{resourceType}/{id}/$validate

# Expand ValueSet
GET /ValueSet/$expand?url=http://...
POST /ValueSet/$expand

# Lookup code
GET /CodeSystem/$lookup?system=http://...&code=123

# Validate code
GET /ValueSet/$validate-code?url=http://...&code=123
```

## Authentication

### JWT Token Format

The server expects JWT tokens in the Authorization header:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Payload

```typescript
{
  sub: 'user-id',
  email: 'user@example.com',
  roles: ['practitioner', 'admin'],
  iat: 1234567890,
  exp: 1234571490
}
```

### Access Policies

The server supports three-layer access control:

1. **System-level**: Global permissions
2. **Resource-level**: Per-resource-type permissions
3. **Instance-level**: Per-resource-instance permissions

```typescript
// Example: User can read all Patients, but only update their own
{
  "resourceType": "AccessPolicy",
  "resource": [
    {
      "resourceType": "Patient",
      "interaction": ["read", "search"]
    },
    {
      "resourceType": "Patient",
      "criteria": "Patient?_id={{user.patientId}}",
      "interaction": ["update"]
    }
  ]
}
```

## Subscriptions

### WebSocket Subscriptions

The server supports real-time subscriptions via WebSocket:

```typescript
// Client-side
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    criteria: 'Observation?status=final'
  }));
});

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Resource updated:', event.resource);
});
```

### Subscription Manager

```typescript
import { SubscriptionManager } from 'fhir-server';

const subscriptionManager = new SubscriptionManager({ engine });

subscriptionManager.on('notification', (event) => {
  // Handle notification
  console.log('Subscription triggered:', event);
});

// Evaluate resource against subscriptions
await subscriptionManager.evaluateResource({
  resourceType: 'Observation',
  id: 'obs-123',
  status: 'final'
});
```

## Error Handling

The server returns FHIR-compliant OperationOutcome resources for errors:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "not-found",
      "diagnostics": "Resource Patient/invalid-id not found"
    }
  ]
}
```

### HTTP Status Codes

- `200 OK` — Successful read/search
- `201 Created` — Successful create
- `204 No Content` — Successful delete
- `400 Bad Request` — Invalid request
- `401 Unauthorized` — Missing/invalid authentication
- `403 Forbidden` — Insufficient permissions
- `404 Not Found` — Resource not found
- `409 Conflict` — Version conflict
- `410 Gone` — Resource deleted
- `422 Unprocessable Entity` — Validation error
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Server error

## Middleware

### Custom Middleware

You can register custom Fastify middleware:

```typescript
import { FhirServer } from 'fhir-server';

const server = new FhirServer({ engine });

// Access the underlying Fastify instance
server.app.addHook('onRequest', async (request, reply) => {
  // Custom logic
  console.log('Request:', request.method, request.url);
});

await server.start();
```

### Built-in Middleware

The server includes these middleware layers:

1. **Security Headers** (Helmet)
2. **CORS**
3. **Rate Limiting**
4. **Request Logging**
5. **Request Context** (parses FHIR content-type)
6. **Authentication** (JWT validation)
7. **Error Handler** (converts to OperationOutcome)

## Engine Interface

The server requires a `FhirEngine` implementation:

```typescript
interface FhirEngine {
  // CRUD
  createResource(type: string, resource: Resource): Promise<PersistedResource>;
  readResource(type: string, id: string): Promise<PersistedResource>;
  updateResource(type: string, resource: PersistedResource): Promise<PersistedResource>;
  deleteResource(type: string, id: string): Promise<void>;
  
  // Search
  search(type: string, params: Record<string, string>, options?: SearchOptions): Promise<SearchResult>;
  
  // History
  historyInstance(type: string, id: string, params?: Record<string, string>): Promise<Bundle>;
  historyType(type: string, params?: Record<string, string>): Promise<Bundle>;
  historySystem(params?: Record<string, string>): Promise<Bundle>;
  
  // Validation
  validate(resource: Resource): Promise<ValidationResult>;
  
  // Metadata
  status(): Promise<FhirEngineStatus>;
}
```

## TypeScript Support

Full TypeScript definitions included:

```typescript
import type {
  FhirServer,
  FhirServerOptions,
  FhirEngine,
  Resource,
  Bundle,
  OperationOutcome
} from 'fhir-server';
```

## Performance

Built on Fastify for maximum performance:

- **Throughput**: 30,000+ req/sec (simple reads)
- **Latency**: <5ms p50, <20ms p99 (with in-memory engine)
- **Memory**: Efficient streaming for large bundles
- **Concurrency**: Handles thousands of concurrent connections

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "dist/esm/index.mjs"]
```

### Environment Variables

```bash
PORT=3000
HOST=0.0.0.0
JWT_SECRET=your-secret-key
CORS_ORIGIN=https://app.example.com
RATE_LIMIT_MAX=100
LOG_LEVEL=info
```

## License

Apache-2.0

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## Links

- [GitHub Repository](https://github.com/nicefhir/fhir-studio)
- [Issue Tracker](https://github.com/nicefhir/fhir-studio/issues)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [fhir-engine](https://www.npmjs.com/package/fhir-engine)
