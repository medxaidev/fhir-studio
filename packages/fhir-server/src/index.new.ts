/**
 * fhir-server — FHIR R4 REST API Server
 *
 * Public API barrel for the fhir-server package (v0.1.0).
 *
 * Architecture: Layer 3 HTTP wrapper over fhir-engine.
 * See: devdocs/architecture/ARCHITECTURE-fhir-server.md
 *
 * @module fhir-server
 */

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  // FHIR R4 Base Types
  ResourceMeta,
  Coding,
  Resource,
  PersistedResource,
  BundleLink,
  BundleEntryRequest,
  BundleEntryResponse,
  BundleEntry,
  Bundle,
  IssueSeverity,
  IssueCode,
  OperationOutcomeIssue,
  OperationOutcome,
  CapabilityStatement,
  CapabilityStatementRest,
  CapabilityStatementRestResource,
  HistoryEntry,
  SearchOptions,
  SearchResult,
  // Engine Interface Contract
  FhirEngine,
  FhirPersistence,
  FhirRuntime,
  FhirDefinitions,
  ValidationResult,
  EngineContext,
  FhirEnginePlugin,
  // Server Configuration
  FhirServerOptions,
  AuthConfig,
  CorsConfig,
  RateLimitConfig,
} from "./types/index.js";
