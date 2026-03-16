/**
 * FHIR R4 Base Types (Self-contained)
 *
 * These types are defined locally to avoid any dependency on fhir-definition
 * or fhir-runtime packages. fhir-server is a pure HTTP wrapper and only
 * needs structural types for serialization/deserialization.
 *
 * @module fhir-server/types
 */

// =============================================================================
// Section 1: Resource Meta
// =============================================================================

/**
 * FHIR R4 Resource.meta element.
 */
export interface ResourceMeta {
  versionId: string;
  lastUpdated: string;
  source?: string;
  profile?: string[];
  security?: Coding[];
  tag?: Coding[];
}

/**
 * FHIR R4 Coding element.
 */
export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

// =============================================================================
// Section 2: Resource
// =============================================================================

/**
 * FHIR R4 Resource (minimal structural type).
 *
 * Uses index signature to allow any FHIR properties without
 * exhaustively defining every resource type.
 */
export interface Resource {
  resourceType: string;
  id?: string;
  meta?: ResourceMeta;
  [key: string]: unknown;
}

/**
 * A persisted FHIR resource with required id and meta.
 */
export interface PersistedResource extends Resource {
  id: string;
  meta: ResourceMeta;
}

// =============================================================================
// Section 3: Bundle
// =============================================================================

/**
 * FHIR R4 Bundle.link element.
 */
export interface BundleLink {
  relation: string;
  url: string;
}

/**
 * FHIR R4 Bundle.entry.request element.
 */
export interface BundleEntryRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
  ifMatch?: string;
  ifNoneExist?: string;
}

/**
 * FHIR R4 Bundle.entry.response element.
 */
export interface BundleEntryResponse {
  status: string;
  location?: string;
  etag?: string;
  lastModified?: string;
  outcome?: Resource;
}

/**
 * FHIR R4 Bundle.entry element.
 */
export interface BundleEntry {
  fullUrl?: string;
  resource?: Resource;
  request?: BundleEntryRequest;
  response?: BundleEntryResponse;
  search?: { mode?: "match" | "include" | "outcome"; score?: number };
}

/**
 * FHIR R4 Bundle resource.
 */
export interface Bundle extends Resource {
  resourceType: "Bundle";
  type: "searchset" | "batch" | "transaction" | "batch-response" | "transaction-response"
  | "history" | "document" | "message" | "collection" | "subscription-notification";
  total?: number;
  link?: BundleLink[];
  entry?: BundleEntry[];
}

// =============================================================================
// Section 4: OperationOutcome
// =============================================================================

/**
 * FHIR OperationOutcome issue severity.
 */
export type IssueSeverity = "fatal" | "error" | "warning" | "information";

/**
 * FHIR OperationOutcome issue type code (subset used by this server).
 *
 * See: https://hl7.org/fhir/R4/valueset-issue-type.html
 */
export type IssueCode =
  | "invalid"
  | "structure"
  | "required"
  | "value"
  | "not-found"
  | "deleted"
  | "conflict"
  | "exception"
  | "informational"
  | "not-supported"
  | "security"
  | "login"
  | "forbidden"
  | "processing"
  | "too-costly"
  | "throttled";

/**
 * A single issue within an OperationOutcome.
 */
export interface OperationOutcomeIssue {
  severity: IssueSeverity;
  code: IssueCode;
  diagnostics?: string;
  expression?: string[];
}

/**
 * FHIR R4 OperationOutcome resource.
 */
export interface OperationOutcome extends Resource {
  resourceType: "OperationOutcome";
  issue: OperationOutcomeIssue[];
}

// =============================================================================
// Section 5: CapabilityStatement (minimal)
// =============================================================================

/**
 * FHIR R4 CapabilityStatement (minimal structural type for server use).
 */
export interface CapabilityStatement extends Resource {
  resourceType: "CapabilityStatement";
  status: "draft" | "active" | "retired" | "unknown";
  kind: "instance" | "capability" | "requirements";
  fhirVersion: string;
  format: string[];
  rest?: CapabilityStatementRest[];
}

/**
 * CapabilityStatement.rest element.
 */
export interface CapabilityStatementRest {
  mode: "server" | "client";
  security?: {
    cors?: boolean;
    service?: Array<{ coding?: Coding[] }>;
    description?: string;
  };
  resource?: CapabilityStatementRestResource[];
}

/**
 * CapabilityStatement.rest.resource element.
 */
export interface CapabilityStatementRestResource {
  type: string;
  profile?: string;
  interaction?: Array<{ code: string }>;
  searchParam?: Array<{ name: string; type: string; documentation?: string }>;
  versioning?: "no-version" | "versioned" | "versioned-update";
  readHistory?: boolean;
  updateCreate?: boolean;
  conditionalCreate?: boolean;
  conditionalRead?: "not-supported" | "modified-since" | "not-match" | "full-support";
  conditionalUpdate?: boolean;
  conditionalDelete?: "not-supported" | "single" | "multiple";
}

// =============================================================================
// Section 6: History
// =============================================================================

/**
 * A history entry returned by persistence.readHistory().
 */
export interface HistoryEntry {
  resource: PersistedResource | null;
  resourceType: string;
  id: string;
  versionId: string;
  lastUpdated: string;
  deleted: boolean;
}

// =============================================================================
// Section 7: Search
// =============================================================================

/**
 * Search options passed to engine.search().
 */
export interface SearchOptions {
  /** Total count mode. */
  total?: "none" | "estimate" | "accurate";
}

/**
 * Search result returned by engine.search().
 * Matches fhir-persistence SearchResult.
 */
export interface SearchResult {
  /** Matched resources. */
  resources: PersistedResource[];
  /** Included resources from _include/_revinclude. */
  included?: PersistedResource[];
  /** Total count (only when total=accurate). */
  total?: number;
}
