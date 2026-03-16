/**
 * FhirEngine Interface Contract
 *
 * Defines the interface that fhir-server programs against.
 * When fhir-engine package is implemented, this local interface will be
 * replaced by: `import type { FhirEngine } from "fhir-engine"`.
 *
 * Based on ARCHITECTURE-fhir-server.md §9.2 — Engine Interface Usage.
 *
 * @module fhir-server/types
 */

import type {
  Resource,
  PersistedResource,
  Bundle,
  OperationOutcome,
  HistoryEntry,
  SearchOptions,
  SearchResult,
  CapabilityStatement,
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
  /** CRUD, search, history, bundle operations. */
  persistence: FhirPersistence;
  /** Validation, FHIRPath, CapabilityStatement generation. */
  runtime: FhirRuntime;
  /** StructureDefinition, ValueSet, SearchParameter registry. */
  definitions: FhirDefinitions;
  /** Stop the engine (cleanup). */
  stop(): Promise<void>;
}

// =============================================================================
// Section 2: FhirPersistence
// =============================================================================

/**
 * Persistence subsystem — CRUD, search, history, bundle.
 *
 * All data operations go through this interface. fhir-server never
 * touches the database directly.
 */
export interface FhirPersistence {
  // ── CRUD ──────────────────────────────────────────────────────────────────
  createResource(resourceType: string, resource: Resource): Promise<PersistedResource>;
  readResource(resourceType: string, id: string): Promise<PersistedResource>;
  updateResource(resourceType: string, id: string, resource: Resource): Promise<PersistedResource>;
  deleteResource(resourceType: string, id: string): Promise<void>;

  // ── History ───────────────────────────────────────────────────────────────
  readHistory(resourceType: string, id: string): Promise<HistoryEntry[]>;
  readVersion(resourceType: string, id: string, versionId: string): Promise<PersistedResource>;

  // ── Search ────────────────────────────────────────────────────────────────
  searchResources(options: SearchOptions): Promise<SearchResult>;

  // ── Bundle ────────────────────────────────────────────────────────────────
  processBundle(bundle: Bundle): Promise<Bundle>;
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
 * Runtime subsystem — validation, FHIRPath, capability generation.
 */
export interface FhirRuntime {
  /** Validate a resource against an optional profile URL. */
  validate(resource: Resource, profileUrl?: string): Promise<ValidationResult>;

  /** Evaluate a FHIRPath expression against a resource. */
  evalFhirPath(expression: string, resource: Resource): unknown[];

  /** Generate a CapabilityStatement for the server. */
  generateCapabilityStatement(baseUrl: string): CapabilityStatement;
}

// =============================================================================
// Section 4: FhirDefinitions
// =============================================================================

/**
 * Definitions subsystem — StructureDefinition, ValueSet, SearchParameter lookup.
 */
export interface FhirDefinitions {
  /** Get a StructureDefinition by canonical URL. */
  getStructureDefinition(url: string): Resource | undefined;

  /** Get a ValueSet by canonical URL. */
  getValueSet(url: string): Resource | undefined;

  /** Get all registered resource type names. */
  getResourceTypes(): string[];
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
