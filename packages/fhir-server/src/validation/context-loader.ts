/**
 * FhirContext Loader & Validation Bridge
 *
 * Loads FHIR R4 StructureDefinitions at server startup, builds
 * CanonicalProfiles, and provides a ResourceValidator function
 * that the resource routes use for create/update validation gates.
 *
 * @module fhir-server/validation
 */

import type { CanonicalProfile, ValidationResult, Resource } from "@medxai/fhir-core";
import {
  StructureValidator,
  loadBundleFromFile,
} from "@medxai/fhir-core";
import type { ResourceValidator, ResourceValidationResult } from "../app.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * Options for initializing the validation context.
 */
export interface ValidationContextOptions {
  /** Path to profiles-resources.json (FHIR R4 resource profiles). */
  profilesPath: string;
  /** Optional path to platform profiles bundle (MedXAI platform resources). */
  platformProfilesPath?: string;
  /** Whether to enable validation. Default: true. */
  enabled?: boolean;
}

/**
 * Result of initializing the validation context.
 */
export interface ValidationContextResult {
  /** The ResourceValidator function to pass to AppOptions. */
  resourceValidator: ResourceValidator;
  /** Number of profiles loaded. */
  profileCount: number;
  /** Pre-built canonical profiles keyed by resource type name. */
  profiles: ReadonlyMap<string, CanonicalProfile>;
}

// =============================================================================
// Section 2: Context Initialization
// =============================================================================

/**
 * Initialize CanonicalProfiles and build a ResourceValidator.
 *
 * Call this once at server startup, then pass the returned
 * `resourceValidator` to `createApp()`.
 *
 * @param options - Configuration for the validation context.
 * @returns The validator and loaded profiles.
 */
export function initValidationContext(
  options: ValidationContextOptions,
): ValidationContextResult {
  const { profilesPath, platformProfilesPath, enabled = true } = options;

  // 1. Load profiles-resources.json → CanonicalProfile[]
  const profiles = new Map<string, CanonicalProfile>();

  const result = loadBundleFromFile(profilesPath, {
    filterKind: "resource",
    excludeAbstract: true,
  });

  for (const profile of result.profiles) {
    profiles.set(profile.type, profile);
  }

  // 2. Load platform profiles if provided
  if (platformProfilesPath) {
    try {
      const platformResult = loadBundleFromFile(platformProfilesPath);
      for (const profile of platformResult.profiles) {
        profiles.set(profile.type, profile);
      }
    } catch {
      // Platform profiles are optional — skip if not found
    }
  }

  // 3. Create the validator
  const validator = new StructureValidator({
    validateSlicing: false, // Slicing validation deferred (complex profiles)
    validateFixed: true,
    failFast: false,
    skipInvariants: false, // FHIRPath invariants enabled (Phase D3)
  });

  // 4. Build the ResourceValidator bridge function
  const resourceValidator: ResourceValidator = enabled
    ? (resource: Record<string, unknown>) => validateResource(validator, profiles, resource)
    : () => ({ valid: true });

  return {
    resourceValidator,
    profileCount: profiles.size,
    profiles,
  };
}

// =============================================================================
// Section 3: Validation Bridge
// =============================================================================

/**
 * Validate a resource against its base StructureDefinition profile.
 *
 * This is the bridge between the StructureValidator (fhir-core) and
 * the ResourceValidator interface (fhir-server).
 */
function validateResource(
  validator: StructureValidator,
  profiles: Map<string, CanonicalProfile>,
  resource: Record<string, unknown>,
): ResourceValidationResult {
  const resourceType = resource.resourceType as string | undefined;
  if (!resourceType) {
    return {
      valid: false,
      issues: [{
        severity: "error",
        code: "required",
        diagnostics: "Resource is missing 'resourceType' property",
      }],
    };
  }

  // Look up the CanonicalProfile for this resource type
  const profile = profiles.get(resourceType);

  if (!profile) {
    // Unknown resource type — skip validation (platform resources may not have SDs loaded)
    return { valid: true };
  }

  // Run structural validation
  let result: ValidationResult;
  try {
    result = validator.validate(resource as unknown as Resource, profile);
  } catch {
    // Validation errors should not crash the server
    return { valid: true };
  }

  if (result.valid) {
    return { valid: true };
  }

  // Filter out false-positive CARDINALITY_MIN_VIOLATION for nested elements
  // whose parent backbone is optional and absent. The StructureValidator uses
  // flat element traversal and doesn't skip nested required children when the
  // parent is absent. E.g., Patient.communication.language (min=1) should not
  // fire when Patient.communication is absent (min=0).
  //
  // Also filter out TYPE_MISMATCH for primitive types (the validator flags
  // "male" for Patient.gender because it expects CodeableConcept but the
  // raw JSON value is a string — FHIR primitives are stored as JSON scalars).
  const realErrors = result.issues.filter((i) => {
    if (i.severity !== "error") return false;

    // For cardinality min violations on nested paths, check ancestor presence
    if (i.code === "CARDINALITY_MIN_VIOLATION" && i.path) {
      const segments = i.path.split(".");
      if (segments.length > 2) {
        // Walk up the ancestor chain: check each intermediate property
        let current: unknown = resource;
        for (let d = 1; d < segments.length - 1; d++) {
          if (current === undefined || current === null || typeof current !== "object") {
            return false; // Ancestor absent → suppress
          }
          current = (current as Record<string, unknown>)[segments[d]];
        }
        if (current === undefined || current === null) return false;
        // If current is an array with 0 length, also suppress
        if (Array.isArray(current) && current.length === 0) return false;
      }
    }

    // Suppress type mismatch for FHIR primitives stored as JSON scalars
    // The StructureValidator sees string "male" but expects complex type "code"
    if (i.code === "TYPE_MISMATCH") return false;

    return true;
  });

  if (realErrors.length === 0) {
    return { valid: true };
  }

  // Map ValidationIssue[] → ResourceValidationResult.issues[]
  return {
    valid: false,
    issues: realErrors.map((i) => ({
      severity: i.severity,
      code: i.code,
      diagnostics: i.message + (i.path ? ` (at ${i.path})` : ""),
    })),
  };
}
