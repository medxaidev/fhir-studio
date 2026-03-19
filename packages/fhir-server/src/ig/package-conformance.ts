/**
 * PackageConformance — FhirConformance adapter backed by in-memory definitions.
 *
 * When fhir-engine loads IG packages, it populates `engine.definitions` Maps
 * (sdByUrl, vsByUrl, csByUrl, etc.) but does NOT persist them to the DB and
 * does NOT create a `conformance` module. This adapter bridges that gap by
 * reading directly from the in-memory definitions to implement the
 * FhirConformance interface that IG routes expect.
 *
 * @module fhir-server/ig
 */

import type {
  FhirConformance,
  IGIndex,
  IGImportResult,
  IGResourceMapEntry,
} from "../types/engine.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/** Minimal package metadata from fhir-engine definitions.packages */
interface PackageMeta {
  name: string;
  version: string;
  path?: string;
  definitionCount?: number;
  loadedAt?: string;
}

/** Minimal StructureDefinition shape from in-memory definitions */
interface SDSummary {
  resourceType?: string;
  id?: string;
  url?: string;
  name?: string;
  title?: string;
  kind?: string;
  type?: string;
  baseDefinition?: string;
  snapshot?: { element?: unknown[] };
  differential?: { element?: unknown[] };
}

/** Minimal ValueSet/CodeSystem shape */
interface TermSummary {
  resourceType?: string;
  id?: string;
  url?: string;
  name?: string;
  title?: string;
}

/** The definitions object shape from fhir-engine runtime */
export interface EngineDefinitions {
  sdByUrl: Map<string, SDSummary>;
  vsByUrl: Map<string, TermSummary>;
  csByUrl: Map<string, TermSummary>;
  spByUrl: Map<string, unknown>;
  spByTypeAndName: Map<string, unknown>;
  packages: PackageMeta[];
}

// =============================================================================
// Section 2: URL → Package Mapping
// =============================================================================

/** Known IG URL prefixes mapped to package names */
const KNOWN_IG_PREFIXES: Array<{ prefix: string; packageName: string }> = [
  { prefix: "http://hl7.org/fhir/us/core/", packageName: "hl7.fhir.us.core" },
  { prefix: "http://hl7.org/fhir/us/davinci-", packageName: "hl7.fhir.us.davinci" },
  { prefix: "http://hl7.org/fhir/us/carin-bb/", packageName: "hl7.fhir.us.carin-bb" },
  { prefix: "http://hl7.org/fhir/us/mcode/", packageName: "hl7.fhir.us.mcode" },
];

/**
 * Determine the igId for a resource URL.
 * Returns the package name (e.g., "hl7.fhir.us.core") or "hl7.fhir.r4.core" for base.
 */
function urlToIgId(url: string, packages: PackageMeta[]): string {
  // Check known prefixes first
  for (const { prefix, packageName } of KNOWN_IG_PREFIXES) {
    if (url.startsWith(prefix)) {
      // Find matching loaded package
      const pkg = packages.find((p) => p.name.startsWith(packageName));
      if (pkg) return pkg.name;
    }
  }

  // Base FHIR definitions
  if (url.startsWith("http://hl7.org/fhir/") && !url.includes("/us/") && !url.includes("/uv/")) {
    return "hl7.fhir.r4.core";
  }

  // Generic fallback: try to infer from URL structure
  // e.g., http://hl7.org/fhir/uv/ips/ → look for matching package
  for (const pkg of packages) {
    // Convert package name to potential URL segment: hl7.fhir.us.core → us/core
    const parts = pkg.name.split(".");
    if (parts.length >= 4) {
      const realm = parts[2]; // "us", "uv", etc.
      const guide = parts.slice(3).join("-"); // "core", "davinci-pdex", etc.
      if (url.includes(`/${realm}/${guide}/`)) return pkg.name;
    }
  }

  return "hl7.fhir.r4.core";
}

// =============================================================================
// Section 3: PackageConformance Implementation
// =============================================================================

export function createPackageConformance(definitions: EngineDefinitions): FhirConformance {
  const { sdByUrl, vsByUrl, csByUrl, spByUrl, packages } = definitions;

  // Build a reverse lookup: url → igId (cached)
  const urlIgCache = new Map<string, string>();
  function getIgIdForUrl(url: string): string {
    let igId = urlIgCache.get(url);
    if (!igId) {
      igId = urlToIgId(url, packages);
      urlIgCache.set(url, igId);
    }
    return igId;
  }

  return {
    /**
     * List all loaded IG packages (excluding base hl7.fhir.r4.core).
     */
    async listIGs() {
      return packages.map((p) => ({
        name: p.name,
        version: p.version,
        status: "active",
      }));
    },

    /**
     * Get grouped IG index for a given package.
     */
    async getIGIndex(igId: string): Promise<IGIndex> {
      const profiles: IGResourceMapEntry[] = [];
      const extensions: IGResourceMapEntry[] = [];
      const valueSets: IGResourceMapEntry[] = [];
      const codeSystems: IGResourceMapEntry[] = [];
      const searchParameters: IGResourceMapEntry[] = [];

      // Scan SDs
      for (const [url, sd] of sdByUrl) {
        if (getIgIdForUrl(url) !== igId) continue;

        const entry: IGResourceMapEntry = {
          igId,
          resourceType: "StructureDefinition",
          resourceId: sd.id ?? url.split("/").pop() ?? url,
          resourceUrl: url,
          resourceName: sd.name ?? sd.title,
          baseType: sd.type,
        };

        if (sd.kind === "complex-type" && sd.type === "Extension") {
          extensions.push(entry);
        } else if (sd.kind === "resource" || sd.kind === "complex-type") {
          profiles.push(entry);
        }
      }

      // Scan ValueSets
      for (const [url, vs] of vsByUrl) {
        if (getIgIdForUrl(url) !== igId) continue;
        valueSets.push({
          igId,
          resourceType: "ValueSet",
          resourceId: vs.id ?? url.split("/").pop() ?? url,
          resourceUrl: url,
          resourceName: vs.name ?? vs.title,
        });
      }

      // Scan CodeSystems
      for (const [url, cs] of csByUrl) {
        if (getIgIdForUrl(url) !== igId) continue;
        codeSystems.push({
          igId,
          resourceType: "CodeSystem",
          resourceId: cs.id ?? url.split("/").pop() ?? url,
          resourceUrl: url,
          resourceName: cs.name ?? cs.title,
        });
      }

      // Scan SearchParameters
      for (const [url, sp] of spByUrl) {
        if (getIgIdForUrl(url) !== igId) continue;
        const spAny = sp as Record<string, unknown>;
        searchParameters.push({
          igId,
          resourceType: "SearchParameter",
          resourceId: (spAny.id as string) ?? url.split("/").pop() ?? url,
          resourceUrl: url,
          resourceName: (spAny.name as string) ?? (spAny.code as string) ?? (spAny.id as string),
          baseType: Array.isArray(spAny.base) ? (spAny.base as string[]).join(", ") : undefined,
        });
      }

      // Sort each group by name
      const byName = (a: IGResourceMapEntry, b: IGResourceMapEntry) =>
        (a.resourceName ?? "").localeCompare(b.resourceName ?? "");
      profiles.sort(byName);
      extensions.sort(byName);
      valueSets.sort(byName);
      codeSystems.sort(byName);
      searchParameters.sort(byName);

      return { profiles, extensions, valueSets, codeSystems, searchParameters };
    },

    /**
     * Import not supported in package-backed conformance (read-only).
     */
    async importIG(igId: string): Promise<IGImportResult> {
      return {
        igId,
        resourceCount: 0,
        sdIndexCount: 0,
        elementIndexCount: 0,
        conceptCount: 0,
        spIndexCount: 0,
        errors: ["Import not supported in package-backed conformance (read-only mode)"],
      };
    },
  };
}
