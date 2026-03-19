# fhir-studio

A modern FHIR R4 development platform with a full-stack TypeScript implementation.

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.3.0-green.svg)](https://github.com/nicefhir/fhir-studio)

## Overview

fhir-studio is a monorepo containing three main packages for building FHIR R4 applications:

- **fhir-rest-client** — Zero-dependency TypeScript HTTP client for FHIR servers
- **fhir-server** — High-performance FHIR R4 REST API server built on Fastify
- **fhir-studio** — Modern web UI for browsing IGs and managing FHIR resources

## Packages

### 📦 fhir-rest-client

[![npm](https://img.shields.io/npm/v/fhir-rest-client.svg)](https://www.npmjs.com/package/fhir-rest-client)

A modern, type-safe FHIR R4 TypeScript HTTP client with **zero runtime dependencies**.

**Features:**

- ✅ Zero runtime dependencies
- 🌐 Cross-platform (Browser + Node.js 18+)
- 🔒 Full TypeScript support
- 🔐 Multiple auth methods (Bearer, OAuth2, PKCE)
- 💾 Smart caching with LRU + TTL
- 🔄 Auto-retry with exponential backoff
- 📦 Auto-batching support
- 🔍 Fluent query builder
- 🔌 WebSocket subscriptions

**Installation:**

```bash
npm install fhir-rest-client
```

[View Documentation](./packages/fhir-rest-client/README.md)

### 🚀 fhir-server

[![npm](https://img.shields.io/npm/v/fhir-server.svg)](https://www.npmjs.com/package/fhir-server)

A high-performance FHIR R4 REST API server built on Fastify and fhir-engine.

**Features:**

- ⚡ High performance (30,000+ req/sec)
- 🔒 Secure by default (Helmet, CORS, rate limiting)
- 🔐 JWT authentication with access policies
- 📊 Full FHIR R4 REST API
- 🔍 Advanced search with \_include/\_revinclude
- 📜 Resource history tracking
- 🔄 Real-time subscriptions
- 🎯 Validation with $validate
- 📚 Terminology operations ($expand, $lookup, $validate-code)
- 📦 IG management (import, index, browse)

**Installation:**

```bash
npm install fhir-server fhir-engine
```

[View Documentation](./packages/fhir-server/README.md)

### 🎨 fhir-studio (UI)

A modern web application for browsing ImplementationGuides and managing FHIR resources.

**Features:**

- 📚 IG Explorer with profile/extension/valueset/codesystem browsing
- 🌳 Tree-based StructureDefinition viewer with slicing support
- 📝 Schema-driven resource CRUD forms
- 🔍 ValueSet expansion for binding-based dropdowns
- 🎯 Extension support with profile-based rendering
- 🔄 Form/JSON toggle for all resources
- 🎨 Modern UI with PrismUI components

**Tech Stack:**

- React 19 + TypeScript + Vite 7
- PrismUI v0.5.0 for state management and routing
- CSS Modules for styling
- fhir-rest-client for API communication
- fhir-runtime for schema parsing

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/nicefhir/fhir-studio.git
cd fhir-studio

# Install dependencies
npm install

# Build all packages
npm run build
```

### Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run typecheck

# Build all packages
npm run build
```

### Running the Server

```bash
cd packages/fhir-server
npm run dev
```

### Running the UI

```bash
cd packages/fhir-studio
npm run dev
```

## Architecture

The monorepo follows a layered architecture:

```
┌─────────────────────────────────────┐
│         fhir-studio (UI)            │
│   React + PrismUI + CSS Modules     │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│       fhir-rest-client (SDK)        │
│   Zero-dependency HTTP client       │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│      fhir-server (REST API)         │
│   Fastify + fhir-engine adapter     │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│         fhir-engine (Core)          │
│   Business logic + persistence      │
└─────────────────────────────────────┘
```

## Version History

### v0.3.0 (2026-03-19)

**fhir-server:**

- Added `GET /_admin/ig/resource-types` endpoint for schema-driven forms
- Enhanced IG listing to include both core and custom IGs
- Improved IGSummary transformation

**fhir-rest-client:**

- Added `loadResourceTypes()` method for resource type discovery
- Added `expandValueSet()` for ValueSet expansion support
- Enhanced defensive handling for IG list responses

**fhir-studio:**

- Implemented schema-driven resource CRUD forms
- Added 9 new UI components (TextInput, NumberInput, Combobox, etc.)
- Implemented binding-based dropdowns with ValueSet expansion
- Added extension support with profile-based rendering
- Implemented choice type detection and handling
- Added Form/JSON toggle for all resources

### v0.2.0 (2026-03-18)

- IG data loading with layered cache (L1 memory + L2 IndexedDB)
- ETag/If-None-Match support for cache revalidation
- IG Explorer UI with profile tree viewer
- Terminology API layer (CodeSystem tree, ValueSet expansion)

### v0.1.0 (2026-03-17)

- Initial release
- Complete FHIR R4 REST API implementation
- Zero-dependency HTTP client
- JWT authentication
- Smart caching and retry logic

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/nicefhir/fhir-studio)
- [Issue Tracker](https://github.com/nicefhir/fhir-studio/issues)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [npm: fhir-rest-client](https://www.npmjs.com/package/fhir-rest-client)
- [npm: fhir-server](https://www.npmjs.com/package/fhir-server)
