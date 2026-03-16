/**
 * AccessPolicy Execution Engine
 *
 * Implements three-layer AccessPolicy model:
 * - **Layer 1: supportsInteraction()** â€?Type-level pre-check (fast reject)
 * - **Layer 2: canPerformInteraction()** â€?Instance-level check
 * - **Layer 3: getSearchCriteria()** â€?Search criteria injection
 *
 * Adapted from medxai/fhir-server auth/access-policy.ts â€?uses local types,
 * removes fhir-persistence imports.
 *
 * @module fhir-server/auth
 */

import type { PersistedResource } from "../types/fhir.js";
import type { OperationContext } from "./middleware.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/** FHIR interaction types. */
export type FhirInteraction = "create" | "read" | "update" | "delete" | "search" | "history" | "vread";

/** Read-only interactions that are always allowed for readonly policies. */
const READ_INTERACTIONS: ReadonlySet<FhirInteraction> = new Set([
  "read", "search", "history", "vread",
]);

/**
 * Resource types that require superAdmin access.
 * These cannot be accessed by normal users or wildcard policies.
 */
const PROTECTED_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  "Login",
  "JsonWebKey",
  "PasswordChangeRequest",
]);

/**
 * Resource types that require explicit policy entries (wildcard '*' does NOT match).
 */
const ADMIN_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  "AccessPolicy",
  "User",
  "ClientApplication",
]);

/**
 * A single resource policy entry within an AccessPolicy.
 */
export interface AccessPolicyResourceEntry {
  /** The resource type this entry applies to. '*' for wildcard. */
  resourceType: string;
  /** If true, only read interactions are allowed. */
  readonly?: boolean;
  /** FHIR search criteria for instance-level filtering. */
  criteria?: string;
  /** Explicit interaction list. If absent, determined by readonly flag. */
  interaction?: FhirInteraction[];
}

/**
 * Parsed AccessPolicy structure.
 */
export interface ParsedAccessPolicy {
  /** Resource-level policies. */
  resource: AccessPolicyResourceEntry[];
}

/**
 * Parsed search parameter (for criteria injection).
 */
export interface ParsedSearchParam {
  code: string;
  modifier?: string;
  values: string[];
}

// =============================================================================
// Section 2: Layer 1 â€?Type-Level Pre-Check
// =============================================================================

/**
 * Layer 1: Check if the given interaction is supported for a resource type.
 *
 * Fast pre-check before any database I/O:
 * - Protected types: only superAdmin
 * - Admin types: '*' wildcard does NOT match
 * - Regular types: check AccessPolicy.resource[] for a matching entry
 */
export function supportsInteraction(
  interaction: FhirInteraction,
  resourceType: string,
  context: OperationContext,
  accessPolicy?: ParsedAccessPolicy,
): boolean {
  // Rule 1: Protected types â€?only superAdmin
  if (PROTECTED_RESOURCE_TYPES.has(resourceType) && !context.superAdmin) {
    return false;
  }

  // Rule 2: No AccessPolicy â†?allow all (superAdmin or system operations)
  if (!accessPolicy) {
    return true;
  }

  // Rule 3: Check AccessPolicy resource entries
  return accessPolicy.resource.some((entry) =>
    shallowMatchesPolicy(entry, resourceType, interaction),
  );
}

// =============================================================================
// Section 3: Layer 2 â€?Instance-Level Check
// =============================================================================

/**
 * Layer 2: Check if a specific resource instance can be accessed.
 *
 * Called after reading a resource from the database.
 */
export function canPerformInteraction(
  interaction: FhirInteraction,
  resource: PersistedResource,
  context: OperationContext,
  accessPolicy?: ParsedAccessPolicy,
): AccessPolicyResourceEntry | undefined {
  const resourceType = resource.resourceType;

  // Rule 1: Protected types â€?only superAdmin
  if (PROTECTED_RESOURCE_TYPES.has(resourceType) && !context.superAdmin) {
    return undefined;
  }

  // Rule 2: No AccessPolicy â†?allow all
  if (!accessPolicy) {
    return { resourceType: "*" };
  }

  // Rule 3: Find the matching policy entry
  return accessPolicy.resource.find((entry) =>
    shallowMatchesPolicy(entry, resourceType, interaction),
  );
}

// =============================================================================
// Section 4: AccessPolicy Parsing
// =============================================================================

/**
 * Parse an AccessPolicy FHIR resource into a structured format.
 */
export function parseAccessPolicy(
  accessPolicyResource: PersistedResource,
): ParsedAccessPolicy | undefined {
  const content = accessPolicyResource as Record<string, unknown>;
  const resourceEntries = content.resource as Array<Record<string, unknown>> | undefined;

  if (!resourceEntries || resourceEntries.length === 0) {
    return undefined;
  }

  const entries: AccessPolicyResourceEntry[] = resourceEntries.map((entry) => ({
    resourceType: (entry.resourceType as string) ?? "*",
    readonly: entry.readonly === true,
    criteria: entry.criteria as string | undefined,
    interaction: entry.interaction as FhirInteraction[] | undefined,
  }));

  return { resource: entries };
}

/**
 * Build a default "allow all" AccessPolicy for users without an explicit policy.
 */
export function buildDefaultAccessPolicy(): ParsedAccessPolicy {
  return {
    resource: [{ resourceType: "*" }],
  };
}

// =============================================================================
// Section 4b: Layer 3 â€?Search Criteria Injection
// =============================================================================

/**
 * Layer 3: Extract search criteria from the AccessPolicy for a resource type.
 */
export function getSearchCriteria(
  resourceType: string,
  context: OperationContext,
  accessPolicy?: ParsedAccessPolicy,
): ParsedSearchParam[] {
  if (!accessPolicy || context.superAdmin) {
    return [];
  }

  const entry = accessPolicy.resource.find((e) =>
    shallowMatchesPolicy(e, resourceType, "search"),
  );

  if (!entry?.criteria) {
    return [];
  }

  return parseCriteriaString(entry.criteria);
}

/**
 * Parse a FHIR search criteria string into ParsedSearchParam[].
 *
 * Format: `ResourceType?param1=value1&param2=value2`
 */
export function parseCriteriaString(criteria: string): ParsedSearchParam[] {
  const params: ParsedSearchParam[] = [];

  const qIndex = criteria.indexOf("?");
  const queryString = qIndex >= 0 ? criteria.slice(qIndex + 1) : criteria;

  if (!queryString) {
    return params;
  }

  const pairs = queryString.split("&");
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex < 0) continue;

    const rawKey = decodeURIComponent(pair.slice(0, eqIndex));
    const rawValue = decodeURIComponent(pair.slice(eqIndex + 1));

    if (!rawKey || !rawValue) continue;

    const colonIndex = rawKey.indexOf(":");
    const code = colonIndex >= 0 ? rawKey.slice(0, colonIndex) : rawKey;
    const modifier = colonIndex >= 0 ? rawKey.slice(colonIndex + 1) : undefined;

    const values = rawValue.split(",");

    params.push({ code, modifier, values });
  }

  return params;
}

// =============================================================================
// Section 5: Internal Helpers
// =============================================================================

/**
 * Check if an AccessPolicy resource entry matches a given resource type and interaction.
 */
function shallowMatchesPolicy(
  entry: AccessPolicyResourceEntry,
  resourceType: string,
  interaction: FhirInteraction,
): boolean {
  // Type matching
  if (entry.resourceType === "*") {
    if (ADMIN_RESOURCE_TYPES.has(resourceType)) {
      return false;
    }
  } else if (entry.resourceType !== resourceType) {
    return false;
  }

  // Interaction matching
  if (entry.interaction && entry.interaction.length > 0) {
    return entry.interaction.includes(interaction);
  }

  // Readonly check
  if (entry.readonly) {
    return READ_INTERACTIONS.has(interaction);
  }

  return true;
}
