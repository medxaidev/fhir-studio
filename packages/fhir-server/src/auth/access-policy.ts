/**
 * AccessPolicy Execution Engine
 *
 * Implements the first three layers of Medplum's four-layer AccessPolicy model:
 *
 * - **Layer 1: supportsInteraction()** — Type-level pre-check (fast reject)
 * - **Layer 2: canPerformInteraction()** — Instance-level check (projectId + readonly)
 * - **Layer 3: getSearchCriteria()** — Search SQL criteria injection
 *
 * Layer 4 (field-level control) is deferred.
 *
 * @module fhir-server/auth
 */

import type { PersistedResource } from "@medxai/fhir-persistence";
import {
  PROTECTED_RESOURCE_TYPES,
  PROJECT_ADMIN_RESOURCE_TYPES,
} from "@medxai/fhir-persistence";
import type { ParsedSearchParam } from "@medxai/fhir-persistence";
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
 * A single resource policy entry within an AccessPolicy.
 *
 * Mirrors the `AccessPolicy.resource[]` element structure.
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
 *
 * Built from the AccessPolicy FHIR resource at login time.
 */
export interface ParsedAccessPolicy {
  /** Resource-level policies. */
  resource: AccessPolicyResourceEntry[];
}

// =============================================================================
// Section 2: Layer 1 — Type-Level Pre-Check
// =============================================================================

/**
 * Layer 1: Check if the given interaction is supported for a resource type.
 *
 * This is a fast pre-check before any database I/O:
 * - protectedResourceTypes: only superAdmin can access
 * - projectAdminResourceTypes: '*' wildcard does NOT match
 * - Regular types: check AccessPolicy.resource[] for a matching entry
 *
 * @returns true if the interaction is allowed at the type level.
 */
export function supportsInteraction(
  interaction: FhirInteraction,
  resourceType: string,
  context: OperationContext,
  accessPolicy?: ParsedAccessPolicy,
): boolean {
  // Rule 1: Protected types — only superAdmin
  if (PROTECTED_RESOURCE_TYPES.has(resourceType) && !context.superAdmin) {
    return false;
  }

  // Rule 2: No AccessPolicy → allow all (superAdmin or system operations)
  if (!accessPolicy) {
    return true;
  }

  // Rule 3: Check AccessPolicy resource entries
  return accessPolicy.resource.some((entry) =>
    shallowMatchesPolicy(entry, resourceType, interaction),
  );
}

// =============================================================================
// Section 3: Layer 2 — Instance-Level Check
// =============================================================================

/**
 * Layer 2: Check if a specific resource instance can be accessed.
 *
 * Called after reading a resource from the database. Checks:
 * - protectedResourceTypes (superAdmin only)
 * - AccessPolicy readonly enforcement for write operations
 *
 * @returns The matching policy entry, or undefined if access is denied.
 */
export function canPerformInteraction(
  interaction: FhirInteraction,
  resource: PersistedResource,
  context: OperationContext,
  accessPolicy?: ParsedAccessPolicy,
): AccessPolicyResourceEntry | undefined {
  const resourceType = resource.resourceType;

  // Rule 1: Protected types — only superAdmin
  if (PROTECTED_RESOURCE_TYPES.has(resourceType) && !context.superAdmin) {
    return undefined;
  }

  // Rule 2: No AccessPolicy → allow all
  if (!accessPolicy) {
    return { resourceType: "*" }; // Synthetic "allow all" entry
  }

  // Rule 3: Find the matching policy entry
  const matchingEntry = accessPolicy.resource.find((entry) =>
    shallowMatchesPolicy(entry, resourceType, interaction),
  );

  return matchingEntry;
}

// =============================================================================
// Section 4: AccessPolicy Parsing
// =============================================================================

/**
 * Parse an AccessPolicy FHIR resource into a structured format.
 *
 * @param accessPolicyResource - The AccessPolicy resource from the database.
 * @returns Parsed policy, or undefined if the resource has no entries.
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
 *
 * This grants full access to all non-admin resource types.
 */
export function buildDefaultAccessPolicy(): ParsedAccessPolicy {
  return {
    resource: [{ resourceType: "*" }],
  };
}

// =============================================================================
// Section 4b: Layer 3 — Search Criteria Injection
// =============================================================================

/**
 * Layer 3: Extract search criteria from the AccessPolicy for a resource type.
 *
 * Finds the matching policy entry and returns parsed search parameters
 * from its `criteria` field. These should be injected into the search
 * request as additional AND conditions.
 *
 * @param resourceType - The FHIR resource type being searched.
 * @param context - The operation context.
 * @param accessPolicy - The parsed access policy.
 * @returns Parsed search parameters from criteria, or empty array.
 */
export function getSearchCriteria(
  resourceType: string,
  context: OperationContext,
  accessPolicy?: ParsedAccessPolicy,
): ParsedSearchParam[] {
  if (!accessPolicy || context.superAdmin) {
    return [];
  }

  // Find the matching entry for this resource type + search interaction
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
 * The criteria string is in the format:
 *   `ResourceType?param1=value1&param2=value2`
 *
 * @param criteria - The criteria string from AccessPolicy.resource.criteria.
 * @returns Parsed search parameters.
 */
export function parseCriteriaString(criteria: string): ParsedSearchParam[] {
  const params: ParsedSearchParam[] = [];

  // Strip the ResourceType? prefix if present
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

    // Parse modifier from key (e.g., "name:exact" → code="name", modifier="exact")
    const colonIndex = rawKey.indexOf(":");
    const code = colonIndex >= 0 ? rawKey.slice(0, colonIndex) : rawKey;
    const modifier = colonIndex >= 0 ? rawKey.slice(colonIndex + 1) : undefined;

    // Split comma-separated values (OR semantics within a single param)
    const values = rawValue.split(",");

    params.push({
      code,
      modifier: modifier as ParsedSearchParam["modifier"],
      values,
    });
  }

  return params;
}

// =============================================================================
// Section 5: Internal Helpers
// =============================================================================

/**
 * Check if an AccessPolicy resource entry matches a given resource type and interaction.
 *
 * Key rules:
 * - '*' wildcard matches all types EXCEPT projectAdminResourceTypes
 * - Explicit resourceType must match exactly
 * - If entry has interaction list, interaction must be in the list
 * - If entry has readonly flag, only read interactions are allowed
 */
function shallowMatchesPolicy(
  entry: AccessPolicyResourceEntry,
  resourceType: string,
  interaction: FhirInteraction,
): boolean {
  // Type matching
  if (entry.resourceType === "*") {
    // Wildcard does NOT match projectAdminResourceTypes
    if (PROJECT_ADMIN_RESOURCE_TYPES.has(resourceType)) {
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

  // No restrictions — allow
  return true;
}
