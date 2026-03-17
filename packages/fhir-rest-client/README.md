# fhir-rest-client

A modern, type-safe FHIR R4 TypeScript HTTP client with **zero runtime dependencies**.

[![npm version](https://img.shields.io/npm/v/fhir-rest-client.svg)](https://www.npmjs.com/package/fhir-rest-client)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- ✅ **Zero Runtime Dependencies** — No external packages required at runtime
- 🌐 **Cross-Platform** — Works in Browser and Node.js 18+
- 🔒 **Type-Safe** — Full TypeScript support with comprehensive type definitions
- 🔐 **Multiple Auth Methods** — Bearer token, Client credentials, Password flow, PKCE
- 💾 **Smart Caching** — LRU cache with TTL and automatic invalidation
- 🔄 **Auto-Retry** — Exponential backoff for transient failures
- 📦 **Auto-Batching** — Automatic request batching with configurable windows
- 🔍 **Fluent Query Builder** — Type-safe search parameter construction
- 🔌 **WebSocket Subscriptions** — Real-time resource updates with auto-reconnect
- 🪶 **Lightweight** — Tree-shakeable ESM and CJS builds

## Installation

```bash
npm install fhir-rest-client
```

## Quick Start

```typescript
import { FhirClient } from "fhir-rest-client";

// Create a client
const client = new FhirClient({
  baseUrl: "https://fhir.example.com",
  auth: {
    type: "bearer",
    token: "your-access-token",
  },
});

// Read a resource
const patient = await client.read("Patient", "patient-123");
console.log(patient.name);

// Search with query builder
import { SearchParamsBuilder } from "fhir-rest-client";

const params = new SearchParamsBuilder()
  .where("family", "Smith")
  .where("birthdate", "gt2000-01-01")
  .sort("birthdate", "desc")
  .count(10)
  .build();

const bundle = await client.search("Patient", params);
```

## Authentication

### Bearer Token

```typescript
const client = new FhirClient({
  baseUrl: "https://fhir.example.com",
  auth: {
    type: "bearer",
    token: "your-access-token",
  },
});
```

### Client Credentials

```typescript
const client = new FhirClient({
  baseUrl: "https://fhir.example.com",
  auth: {
    type: "client",
    tokenUrl: "https://auth.example.com/token",
    clientId: "your-client-id",
    clientSecret: "your-client-secret",
  },
});
```

### Password Flow

```typescript
const client = new FhirClient({
  baseUrl: "https://fhir.example.com",
  auth: {
    type: "password",
    tokenUrl: "https://auth.example.com/token",
    clientId: "your-client-id",
    username: "user@example.com",
    password: "your-password",
  },
});
```

### PKCE (Authorization Code with Proof Key)

```typescript
import { FhirClient, generatePkceChallenge } from "fhir-rest-client";

const { codeVerifier, codeChallenge } = await generatePkceChallenge();

const client = new FhirClient({
  baseUrl: "https://fhir.example.com",
  auth: {
    type: "pkce",
    tokenUrl: "https://auth.example.com/token",
    authorizeUrl: "https://auth.example.com/authorize",
    clientId: "your-client-id",
    redirectUri: "https://yourapp.com/callback",
    codeVerifier,
    codeChallenge,
  },
});

// After user authorization, exchange code for token
await client.auth.signIn({ code: "authorization-code" });
```

## CRUD Operations

```typescript
// Create
const newPatient = await client.create("Patient", {
  resourceType: "Patient",
  name: [{ family: "Smith", given: ["John"] }],
});

// Read
const patient = await client.read("Patient", "patient-123");

// Update
patient.telecom = [{ system: "phone", value: "555-1234" }];
const updated = await client.update("Patient", "patient-123", patient);

// Delete
await client.delete("Patient", "patient-123");

// Patch (JSON Patch)
await client.patch("Patient", "patient-123", [
  { op: "replace", path: "/active", value: false },
]);
```

## Search

```typescript
// Simple search
const results = await client.search("Patient", { family: "Smith" });

// Fluent query builder
import { SearchParamsBuilder } from "fhir-rest-client";

const params = new SearchParamsBuilder()
  .where("family", "Smith")
  .where("birthdate", "gt2000-01-01")
  .where("active", "true")
  .sort("birthdate", "desc")
  .count(20)
  .include("Patient", "organization")
  .revInclude("Observation", "subject")
  .build();

const bundle = await client.search("Patient", params);

// Pagination
if (bundle.link) {
  const nextPage = await client.searchByUrl(
    bundle.link.find((l) => l.relation === "next")?.url,
  );
}
```

## Caching

```typescript
const client = new FhirClient({
  baseUrl: "https://fhir.example.com",
  cache: {
    enabled: true,
    maxSize: 1000, // Max cached items
    ttl: 300000, // 5 minutes TTL
    invalidateOnMutate: true, // Auto-invalidate on create/update/delete
  },
});

// Reads are cached automatically
const patient1 = await client.read("Patient", "123"); // Cache miss
const patient2 = await client.read("Patient", "123"); // Cache hit

// Updates invalidate cache
await client.update("Patient", "123", updatedPatient); // Cache invalidated
const patient3 = await client.read("Patient", "123"); // Cache miss
```

## Retry & Error Handling

```typescript
const client = new FhirClient({
  baseUrl: "https://fhir.example.com",
  retry: {
    enabled: true,
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    factor: 1.5, // Exponential backoff
  },
});

try {
  const patient = await client.read("Patient", "invalid-id");
} catch (error) {
  if (error instanceof ResourceNotFoundError) {
    console.error("Patient not found");
  } else if (error instanceof OperationOutcomeError) {
    console.error("FHIR error:", error.outcome);
  } else if (error instanceof NetworkError) {
    console.error("Network error:", error.message);
  }
}
```

## Auto-Batching

```typescript
const client = new FhirClient({
  baseUrl: "https://fhir.example.com",
  batch: {
    enabled: true,
    maxBatchSize: 100,
    windowMs: 50, // Batch requests within 50ms window
  },
});

// These requests are automatically batched into a single Bundle
const [patient1, patient2, patient3] = await Promise.all([
  client.read("Patient", "1"),
  client.read("Patient", "2"),
  client.read("Patient", "3"),
]);
```

## WebSocket Subscriptions

```typescript
import { ClientSubscriptionManager } from "fhir-rest-client";

const subscriptionManager = new ClientSubscriptionManager({
  wsUrl: "wss://fhir.example.com/ws",
  token: "your-token",
  reconnect: true,
  reconnectInterval: 5000,
});

// Subscribe to resource updates
subscriptionManager.on("notification", (event) => {
  console.log("Resource updated:", event.resource);
});

subscriptionManager.on("error", (error) => {
  console.error("Subscription error:", error);
});

await subscriptionManager.connect();

// Subscribe to specific criteria
await subscriptionManager.subscribe({
  resourceType: "Subscription",
  id: "subscription-123",
  criteria: "Observation?status=final",
});
```

## API Reference

### FhirClient

Main client class for interacting with FHIR servers.

**Methods:**

- `read<T>(type, id, options?)` — Read a resource by ID
- `create<T>(type, resource, options?)` — Create a new resource
- `update<T>(type, id, resource, options?)` — Update a resource
- `patch(type, id, patch, options?)` — Patch a resource with JSON Patch
- `delete(type, id, options?)` — Delete a resource
- `search<T>(type, params?, options?)` — Search resources
- `searchByUrl<T>(url, options?)` — Search by full URL
- `history(type?, id?, params?, options?)` — Get resource history
- `batch(bundle, options?)` — Execute a batch/transaction Bundle
- `capabilities(options?)` — Get server CapabilityStatement

### SearchParamsBuilder

Fluent builder for constructing FHIR search parameters.

**Methods:**

- `where(param, value)` — Add search parameter
- `sort(param, order?)` — Add sort parameter
- `count(n)` — Set page size
- `offset(n)` — Set offset (for servers that support it)
- `include(resourceType, param)` — Add \_include
- `revInclude(resourceType, param)` — Add \_revinclude
- `summary(mode)` — Set \_summary mode
- `elements(...fields)` — Set \_elements
- `build()` — Build final SearchParams object

## TypeScript Support

Full TypeScript definitions included:

```typescript
import type {
  Resource,
  Bundle,
  OperationOutcome,
  FhirClientOptions,
  SearchParams,
  RequestOptions,
} from "fhir-rest-client";
```

## Browser Support

Works in all modern browsers with native `fetch` and `crypto` support:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Node.js Support

Requires Node.js 18+ (native `fetch` and `crypto.subtle` support).

## License

Apache-2.0

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## Links

- [GitHub Repository](https://github.com/nicefhir/fhir-studio)
- [Issue Tracker](https://github.com/nicefhir/fhir-studio/issues)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
