/**
 * Conformance Resource Seed
 *
 * Loads FHIR R4 conformance resources (CodeSystem, ValueSet, StructureDefinition)
 * from spec bundle files into the database via ResourceRepository.
 *
 * Resources are loaded with upsert semantics: if a resource with the same
 * `resourceType` and `id` already exists, it is skipped.
 *
 * ## Supported resource types:
 * - CodeSystem  — from valuesets.json, v3-codesystems.json, v2-tables.json
 * - ValueSet    — from valuesets.json, v3-codesystems.json, v2-tables.json
 * - StructureDefinition — from profiles-types.json, profiles-resources.json, profiles-others.json
 *
 * @module fhir-server/terminology
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { ResourceRepository } from "@medxai/fhir-persistence";

// UUID v4 regex for detecting whether an id is already a UUID
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generate a deterministic UUID from a string key.
 * Uses SHA-256 and formats bytes 0-15 as a UUID v4-shaped string.
 */
function deterministicUuid(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),       // version nibble = 4
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join("-");
}

// =============================================================================
// Section 1: Types
// =============================================================================

/** Options for seeding conformance resources. */
export interface SeedConformanceOptions {
  /** Path to spec/fhir/r4/ directory. */
  specDir: string;

  /** Path to spec/platform/ directory (for custom resources). */
  platformDir?: string;

  /** Resource types to seed. Default: all. */
  resourceTypes?: Array<"CodeSystem" | "ValueSet" | "StructureDefinition">;

  /** If true, skip resources that already exist (default: true). */
  skipExisting?: boolean;

  /** Progress callback. */
  onProgress?: (msg: string) => void;
}

/** Result of the seed operation. */
export interface SeedConformanceResult {
  /** Total entries found in bundle files. */
  total: number;
  /** Successfully created. */
  created: number;
  /** Skipped (already exists or filtered out). */
  skipped: number;
  /** Failed to create. */
  failed: number;
  /** Errors encountered. */
  errors: Array<{ resourceType: string; id: string; error: string }>;
  /** Breakdown by resource type. */
  byType: Record<string, { created: number; skipped: number; failed: number }>;
}

// =============================================================================
// Section 2: Bundle Parsing
// =============================================================================

interface BundleEntry {
  fullUrl?: string;
  resource?: Record<string, unknown>;
}

interface BundleShape {
  resourceType: string;
  entry?: BundleEntry[];
}

/**
 * Extract resources of the given types from a bundle JSON file.
 */
function extractResourcesFromFile(
  filePath: string,
  allowedTypes: Set<string>,
): Array<Record<string, unknown>> {
  const raw = readFileSync(filePath, "utf-8");
  const bundle: BundleShape = JSON.parse(raw);

  if (bundle.resourceType !== "Bundle" || !Array.isArray(bundle.entry)) {
    return [];
  }

  return bundle.entry
    .filter(
      (e): e is { resource: Record<string, unknown> } =>
        e.resource !== undefined &&
        e.resource !== null &&
        typeof e.resource === "object" &&
        typeof e.resource.resourceType === "string" &&
        allowedTypes.has(e.resource.resourceType as string),
    )
    .map((e) => e.resource);
}

/**
 * Strip narrative text from a resource to reduce storage size.
 * The `text` element can be very large and is not needed for
 * terminology/conformance operations.
 */
function stripNarrative(resource: Record<string, unknown>): Record<string, unknown> {
  const { text, ...rest } = resource;
  return rest;
}

// =============================================================================
// Section 3: Seed Function
// =============================================================================

/**
 * Seed conformance resources into the database.
 *
 * Reads FHIR R4 spec files and custom platform files, then creates
 * each resource via `repo.createResource()`. Already-existing resources
 * (matched by resourceType + id) are skipped.
 *
 * @param repo - A system-level repository (no project restrictions).
 * @param options - Seed options.
 * @returns Summary of the seed operation.
 */
export async function seedConformanceResources(
  repo: ResourceRepository,
  options: SeedConformanceOptions,
): Promise<SeedConformanceResult> {
  const {
    specDir,
    platformDir,
    resourceTypes,
    skipExisting = true,
    onProgress,
  } = options;

  const allowedTypes = new Set<string>(
    resourceTypes ?? ["CodeSystem", "ValueSet", "StructureDefinition"],
  );

  const result: SeedConformanceResult = {
    total: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    byType: {},
  };

  const initType = (type: string) => {
    if (!result.byType[type]) {
      result.byType[type] = { created: 0, skipped: 0, failed: 0 };
    }
  };

  // Collect all resources from spec files
  const allResources: Array<Record<string, unknown>> = [];

  // -- ValueSet + CodeSystem sources --
  if (allowedTypes.has("ValueSet") || allowedTypes.has("CodeSystem")) {
    const vsFiles = [
      resolve(specDir, "valuesets.json"),
      resolve(specDir, "v3-codesystems.json"),
      resolve(specDir, "v2-tables.json"),
    ];
    for (const file of vsFiles) {
      try {
        const resources = extractResourcesFromFile(file, allowedTypes);
        onProgress?.(`Loaded ${resources.length} resources from ${file.split(/[\\/]/).pop()}`);
        allResources.push(...resources);
      } catch (err) {
        onProgress?.(`Warning: Could not read ${file}: ${(err as Error).message}`);
      }
    }

    // Platform custom ValueSet/CodeSystem
    if (platformDir) {
      for (const fileName of ["valuesets-medxai.json", "codesystems-medxai.json"]) {
        try {
          const resources = extractResourcesFromFile(
            resolve(platformDir, fileName),
            allowedTypes,
          );
          if (resources.length > 0) {
            onProgress?.(`Loaded ${resources.length} custom resources from ${fileName}`);
            allResources.push(...resources);
          }
        } catch {
          // Custom files may not exist yet — that's OK
        }
      }
    }
  }

  // -- StructureDefinition sources --
  if (allowedTypes.has("StructureDefinition")) {
    const sdFiles = [
      resolve(specDir, "profiles-types.json"),
      resolve(specDir, "profiles-resources.json"),
      resolve(specDir, "profiles-others.json"),
    ];
    for (const file of sdFiles) {
      try {
        const sdSet = new Set(["StructureDefinition"]);
        const resources = extractResourcesFromFile(file, sdSet);
        onProgress?.(`Loaded ${resources.length} StructureDefinitions from ${file.split(/[\\/]/).pop()}`);
        allResources.push(...resources);
      } catch (err) {
        onProgress?.(`Warning: Could not read ${file}: ${(err as Error).message}`);
      }
    }

    // Platform custom StructureDefinition
    if (platformDir) {
      try {
        const sdSet = new Set(["StructureDefinition"]);
        const resources = extractResourcesFromFile(
          resolve(platformDir, "profiles-medxai.json"),
          sdSet,
        );
        if (resources.length > 0) {
          onProgress?.(`Loaded ${resources.length} custom StructureDefinitions from profiles-medxai.json`);
          allResources.push(...resources);
        }
      } catch {
        // Custom file may not exist yet
      }
    }
  }

  result.total = allResources.length;
  onProgress?.(`Total conformance resources to seed: ${result.total}`);

  // Deduplicate by resourceType + id (later entries override earlier)
  const deduped = new Map<string, Record<string, unknown>>();
  for (const resource of allResources) {
    const rt = resource.resourceType as string;
    const id = resource.id as string;
    if (rt && id) {
      deduped.set(`${rt}/${id}`, resource);
    }
  }
  const dedupedCount = deduped.size;
  const dupSkipped = result.total - dedupedCount;
  if (dupSkipped > 0) {
    onProgress?.(`Deduplicated: ${dedupedCount} unique (${dupSkipped} duplicates removed)`);
    result.skipped += dupSkipped;
  }

  // Insert resources in batches
  let processed = 0;
  for (const [, resource] of deduped) {
    const rt = resource.resourceType as string;
    const id = resource.id as string;
    initType(rt);

    // DB id column is UUID — convert non-UUID spec IDs to deterministic UUIDs
    const dbId = UUID_RE.test(id) ? id : deterministicUuid(`${rt}/${id}`);

    try {
      if (skipExisting) {
        // Check if resource already exists
        try {
          await repo.readResource(rt, dbId);
          // Already exists — skip
          result.skipped++;
          result.byType[rt].skipped++;
          processed++;
          continue;
        } catch {
          // Does not exist — proceed to create
        }
      }

      // Strip narrative text to save space
      const cleaned = stripNarrative(resource);

      await repo.createResource(cleaned as any, { assignedId: dbId });
      result.created++;
      result.byType[rt].created++;
    } catch (err) {
      result.failed++;
      result.byType[rt].failed++;
      result.errors.push({
        resourceType: rt,
        id,
        error: (err as Error).message,
      });
    }

    processed++;
    if (processed % 500 === 0) {
      onProgress?.(`Progress: ${processed}/${dedupedCount} (${result.created} created, ${result.skipped} skipped, ${result.failed} failed)`);
    }
  }

  onProgress?.(
    `Seed complete: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed`,
  );

  return result;
}
