/**
 * Public Type Exports
 *
 * Barrel file for all fhir-server public types.
 *
 * @module fhir-server/types
 */

// ── FHIR R4 Base Types ──────────────────────────────────────────────────────
export type {
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
} from "./fhir.js";

// ── FhirEngine Interface Contract ────────────────────────────────────────────
export type {
  FhirEngine,
  FhirEngineStatus,
  FhirPersistence,
  FhirRuntime,
  FhirDefinitions,
  ValidationResult,
  EngineContext,
  FhirEnginePlugin,
} from "./engine.js";

// ── Server Configuration ─────────────────────────────────────────────────────
export type {
  FhirServerOptions,
  AuthConfig,
  CorsConfig,
  RateLimitConfig,
} from "./config.js";
