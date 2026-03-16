/**
 * FhirEngine Interface Contract
 *
 * Defines the interface that fhir-server programs against.
 * Matches the real fhir-engine@0.6.0 API shape.
 *
 * Based on ARCHITECTURE-fhir-server.md §9.2 — Engine Interface Usage.
 *
 * @module fhir-server/types
 */

import type {
  Resource,
  PersistedResource,
  OperationOutcome,
  HistoryEntry,
  SearchResult,
} from "./fhir.js";

// =============================================================================
// Section 1: FhirEngine (Top-level)
// =============================================================================

/**
 * The FhirEngine instance — single dependency for fhir-server.
 *
 * Provides access to persistence, runtime, and definitions subsystems.
 */
export interface FhirEngine {
  /** CRUD + history operations. */
  persistence: FhirPersistence;
  /** Validation + search parameter extraction. */
  runtime: FhirRuntime;
  /** StructureDefinition, ValueSet, SearchParameter registry. */
  definitions: FhirDefinitions;
  /** Resource types with database tables. */
  resourceTypes: string[];
  /** High-level FHIR search — parses query params, executes search, returns results. */
  search(
    resourceType: string,
    queryParams: Record<string, string | string[] | undefined>,
    options?: { total?: "none" | "estimate" | "accurate" },
  ): Promise<SearchResult>;
  /** Return engine health/status information. */
  status(): FhirEngineStatus;
  /** Stop the engine (cleanup). */
  stop(): Promise<void>;
}

/**
 * Engine status information returned by engine.status().
 */
export interface FhirEngineStatus {
  databaseType: string;
  fhirVersions: string[];
  resourceTypes: string[];
  loadedPackages: string[];
  igAction: string;
  startedAt: string;
  plugins: string[];
}

// =============================================================================
// Section 2: FhirPersistence
// =============================================================================

/**
 * Persistence subsystem — CRUD, history.
 *
 * All data operations go through this interface. fhir-server never
 * touches the database directly.
 */
export interface FhirPersistence {
  // ── CRUD ──────────────────────────────────────────────────────────────────
  createResource(resourceType: string, resource: Resource): Promise<PersistedResource>;
  readResource(resourceType: string, id: string): Promise<PersistedResource>;
  updateResource(resourceType: string, resource: Resource, options?: { ifMatch?: string }): Promise<PersistedResource>;
  deleteResource(resourceType: string, id: string): Promise<void>;

  // ── History ───────────────────────────────────────────────────────────────
  readHistory(resourceType: string, id: string): Promise<HistoryEntry[]>;
  readVersion(resourceType: string, id: string, versionId: string): Promise<PersistedResource>;
}

// =============================================================================
// Section 3: FhirRuntime
// =============================================================================

/**
 * Validation result from runtime.validate().
 */
export interface ValidationResult {
  valid: boolean;
  outcome: OperationOutcome;
}

/**
 * Runtime subsystem — validation + search parameter extraction.
 */
export interface FhirRuntime {
  /** Validate a resource against an optional profile URL. */
  validate(resource: unknown, profileUrl?: string): Promise<ValidationResult>;

  /** Validate multiple resources. */
  validateMany?(resources: unknown[]): Promise<ValidationResult[]>;

  /** Get search parameters for a resource type. */
  getSearchParameters?(resourceType: string): unknown[];

  /** Extract search values from a resource. */
  extractSearchValues?(resource: unknown, params: unknown[]): unknown[];
}

// =============================================================================
// Section 4: FhirDefinitions
// =============================================================================

/**
 * Definitions subsystem — StructureDefinition, ValueSet, SearchParameter lookup.
 *
 * Matches fhir-definition DefinitionRegistry.
 */
export interface FhirDefinitions {
  /** Get a StructureDefinition by canonical URL. */
  getStructureDefinition(url: string): Resource | undefined;

  /** Get a ValueSet by canonical URL. */
  getValueSet(url: string): Resource | undefined;

  /** Get a CodeSystem by canonical URL. */
  getCodeSystem?(url: string): Resource | undefined;

  /** Get search parameters for a resource type. */
  getSearchParameters?(resourceType: string): unknown[];

  /** List all StructureDefinitions. */
  listStructureDefinitions?(): unknown[];

  /** Get registry statistics. */
  getStatistics?(): unknown;
}

// =============================================================================
// Section 5: FhirEngine Plugin (for plugin mode)
// =============================================================================

/**
 * Context passed to engine plugins during lifecycle hooks.
 */
export interface EngineContext {
  persistence: FhirPersistence;
  runtime: FhirRuntime;
  definitions: FhirDefinitions;
}

/**
 * Plugin interface for fhir-engine plugin system.
 *
 * fhir-server can operate as a plugin within fhir-engine's lifecycle.
 */
export interface FhirEnginePlugin {
  name: string;
  init?(ctx: EngineContext): Promise<void>;
  start?(ctx: EngineContext): Promise<void>;
  ready?(ctx: EngineContext): Promise<void>;
  stop?(ctx: EngineContext): Promise<void>;
}
