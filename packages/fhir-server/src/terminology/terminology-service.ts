/**
 * Terminology Service
 *
 * Implements FHIR terminology operations:
 * - $expand — expand a ValueSet into a flat list of codes
 * - $validate-code — check if a code belongs to a CodeSystem or ValueSet
 * - $lookup — retrieve details about a code in a CodeSystem
 *
 * Uses the standard FHIR CRUD via ResourceRepository to read
 * CodeSystem and ValueSet resources.
 *
 * @module fhir-server/terminology
 */

import type { ResourceRepository } from "@medxai/fhir-persistence";

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * A concept in a CodeSystem or ValueSet expansion.
 */
export interface Coding {
  system?: string;
  code: string;
  display?: string;
  version?: string;
}

/**
 * Result of a $expand operation.
 */
export interface ExpandResult {
  url?: string;
  name?: string;
  total: number;
  contains: Coding[];
}

/**
 * Result of a $validate-code operation.
 */
export interface ValidateCodeResult {
  result: boolean;
  display?: string;
  message?: string;
}

/**
 * Result of a $lookup operation.
 */
export interface LookupResult {
  name: string;
  display?: string;
  property?: Array<{ code: string; value: unknown }>;
}

/**
 * Options for $expand operations.
 */
export interface ExpandOptions {
  /** Text filter applied to code and display. */
  filter?: string;
  /** Preferred language for display values (BCP-47, e.g. "zh-CN"). */
  displayLanguage?: string;
  /** Maximum number of codes to return. */
  count?: number;
  /** Offset for paging. */
  offset?: number;
}

/**
 * Result of a $subsumes operation.
 */
export interface SubsumesResult {
  outcome: "equivalent" | "subsumes" | "subsumed-by" | "not-subsumed";
}

// =============================================================================
// Section 2: Terminology Service
// =============================================================================

export class TerminologyService {
  constructor(private readonly repo: ResourceRepository) { }

  // ── $expand ──────────────────────────────────────────────────────────────

  /**
   * Expand a ValueSet by ID.
   */
  async expandById(id: string, options?: string | ExpandOptions): Promise<ExpandResult> {
    const opts = typeof options === "string" ? { filter: options } : (options ?? {});
    const vs = await this.repo.readResource("ValueSet", id);
    return this.expandValueSet(vs as any, opts);
  }

  /**
   * Expand a ValueSet by canonical URL.
   */
  async expandByUrl(url: string, options?: string | ExpandOptions): Promise<ExpandResult> {
    const opts = typeof options === "string" ? { filter: options } : (options ?? {});
    const result = await this.repo.searchResources({
      resourceType: "ValueSet",
      params: [{ code: "url", values: [url] }],
      count: 1,
    });
    if (result.resources.length === 0) {
      throw new TerminologyError(404, `ValueSet not found: ${url}`);
    }
    return this.expandValueSet(result.resources[0] as any, opts);
  }

  /**
   * Expand a ValueSet resource into a flat coding list.
   *
   * Supports:
   * - Pre-expanded ValueSets (expansion.contains)
   * - compose.include with explicit concept lists
   * - compose.include with system reference (loads from CodeSystem)
   * - compose.include.filter (property-based filtering, T1.2)
   * - displayLanguage (designation-based display override, T1.1)
   * - count/offset paging
   */
  private async expandValueSet(
    vs: Record<string, any>,
    options: ExpandOptions,
  ): Promise<ExpandResult> {
    const { filter, displayLanguage, count, offset } = options;
    const contains: Coding[] = [];

    // 1. If the ValueSet has an expansion, use it directly
    if (vs.expansion?.contains) {
      for (const c of vs.expansion.contains) {
        contains.push({
          system: c.system,
          code: c.code,
          display: this.resolveDisplay(c, displayLanguage),
          version: c.version,
        });
      }
    }

    // 2. Process compose.include
    if (vs.compose?.include) {
      for (const include of vs.compose.include) {
        const system = include.system as string | undefined;

        // Direct concept list
        if (include.concept) {
          for (const c of include.concept) {
            contains.push({
              system,
              code: c.code,
              display: this.resolveDisplay(c, displayLanguage),
            });
          }
        }

        // If no concept list but has a system, try to load all codes from CodeSystem
        if (!include.concept && system) {
          const csCodes = await this.getCodeSystemCodes(system, displayLanguage);

          // Apply compose.include.filter if present (T1.2)
          if (include.filter && Array.isArray(include.filter)) {
            const filtered = this.applyIncludeFilters(csCodes, include.filter, system);
            contains.push(...filtered);
          } else {
            contains.push(...csCodes);
          }
        }
      }
    }

    // 3. Apply text filter if provided
    let filtered = contains;
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      filtered = contains.filter(
        (c) =>
          c.code.toLowerCase().includes(lowerFilter) ||
          (c.display?.toLowerCase().includes(lowerFilter) ?? false),
      );
    }

    // 4. Apply paging
    const total = filtered.length;
    if (offset !== undefined || count !== undefined) {
      const start = offset ?? 0;
      const end = count !== undefined ? start + count : undefined;
      filtered = filtered.slice(start, end);
    }

    return {
      url: vs.url,
      name: vs.name,
      total,
      contains: filtered,
    };
  }

  // ── $validate-code ───────────────────────────────────────────────────────

  /**
   * Validate a code against a CodeSystem by ID.
   */
  async validateCodeById(
    id: string,
    code: string,
    system?: string,
  ): Promise<ValidateCodeResult> {
    const cs = await this.repo.readResource("CodeSystem", id);
    return this.validateInCodeSystem(cs as any, code, system);
  }

  /**
   * Validate a code against a CodeSystem by URL.
   */
  async validateCodeByUrl(
    url: string,
    code: string,
  ): Promise<ValidateCodeResult> {
    const result = await this.repo.searchResources({
      resourceType: "CodeSystem",
      params: [{ code: "url", values: [url] }],
      count: 1,
    });
    if (result.resources.length === 0) {
      throw new TerminologyError(404, `CodeSystem not found: ${url}`);
    }
    return this.validateInCodeSystem(result.resources[0] as any, code);
  }

  /**
   * Validate a code against a ValueSet by ID.
   */
  async validateCodeInValueSetById(
    id: string,
    code: string,
    system?: string,
  ): Promise<ValidateCodeResult> {
    const expansion = await this.expandById(id);
    const match = expansion.contains.find(
      (c) => c.code === code && (!system || c.system === system),
    );
    return {
      result: !!match,
      display: match?.display,
      message: match ? undefined : `Code '${code}' not found in ValueSet`,
    };
  }

  private validateInCodeSystem(
    cs: Record<string, any>,
    code: string,
    system?: string,
  ): ValidateCodeResult {
    if (system && cs.url && cs.url !== system) {
      return {
        result: false,
        message: `CodeSystem URL mismatch: expected ${system}, got ${cs.url}`,
      };
    }

    const found = this.findConcept(cs.concept, code);
    return {
      result: !!found,
      display: found?.display,
      message: found ? undefined : `Code '${code}' not found in CodeSystem '${cs.url ?? cs.id}'`,
    };
  }

  // ── $lookup ──────────────────────────────────────────────────────────────

  /**
   * Lookup a code in a CodeSystem by ID.
   */
  async lookupById(
    id: string,
    code: string,
  ): Promise<LookupResult> {
    const cs = await this.repo.readResource("CodeSystem", id);
    return this.lookupInCodeSystem(cs as any, code);
  }

  /**
   * Lookup a code in a CodeSystem by URL.
   */
  async lookupByUrl(
    system: string,
    code: string,
  ): Promise<LookupResult> {
    const result = await this.repo.searchResources({
      resourceType: "CodeSystem",
      params: [{ code: "url", values: [system] }],
      count: 1,
    });
    if (result.resources.length === 0) {
      throw new TerminologyError(404, `CodeSystem not found: ${system}`);
    }
    return this.lookupInCodeSystem(result.resources[0] as any, code);
  }

  private lookupInCodeSystem(
    cs: Record<string, any>,
    code: string,
  ): LookupResult {
    const found = this.findConcept(cs.concept, code);
    if (!found) {
      throw new TerminologyError(
        404,
        `Code '${code}' not found in CodeSystem '${cs.url ?? cs.id}'`,
      );
    }

    const properties: Array<{ code: string; value: unknown }> = [];
    if (found.property) {
      for (const p of found.property) {
        properties.push({
          code: p.code,
          value: p.valueString ?? p.valueCoding ?? p.valueCode ?? p.valueBoolean ?? p.valueInteger,
        });
      }
    }

    return {
      name: cs.name ?? cs.title ?? cs.id,
      display: found.display,
      property: properties.length > 0 ? properties : undefined,
    };
  }

  // ── $subsumes (T1.3) ──────────────────────────────────────────────────────

  /**
   * Check subsumption relationship between two codes in a CodeSystem.
   *
   * Returns:
   * - "equivalent"    — codeA and codeB are the same code
   * - "subsumes"      — codeA is an ancestor of codeB
   * - "subsumed-by"   — codeB is an ancestor of codeA
   * - "not-subsumed"  — no hierarchical relationship
   */
  async subsumes(
    system: string,
    codeA: string,
    codeB: string,
  ): Promise<SubsumesResult> {
    if (codeA === codeB) {
      return { outcome: "equivalent" };
    }

    // Load the CodeSystem
    const result = await this.repo.searchResources({
      resourceType: "CodeSystem",
      params: [{ code: "url", values: [system] }],
      count: 1,
    });
    if (result.resources.length === 0) {
      throw new TerminologyError(404, `CodeSystem not found: ${system}`);
    }

    const cs = result.resources[0] as Record<string, any>;
    const concepts = cs.concept;
    if (!concepts) {
      return { outcome: "not-subsumed" };
    }

    // Check if codeA is ancestor of codeB
    if (this.isAncestor(concepts, codeA, codeB)) {
      return { outcome: "subsumes" };
    }

    // Check if codeB is ancestor of codeA
    if (this.isAncestor(concepts, codeB, codeA)) {
      return { outcome: "subsumed-by" };
    }

    return { outcome: "not-subsumed" };
  }

  /**
   * Check subsumption by CodeSystem ID.
   */
  async subsumesById(
    id: string,
    codeA: string,
    codeB: string,
  ): Promise<SubsumesResult> {
    if (codeA === codeB) {
      return { outcome: "equivalent" };
    }

    const cs = await this.repo.readResource("CodeSystem", id);
    const concepts = (cs as Record<string, any>).concept;
    if (!concepts) {
      return { outcome: "not-subsumed" };
    }

    if (this.isAncestor(concepts, codeA, codeB)) {
      return { outcome: "subsumes" };
    }
    if (this.isAncestor(concepts, codeB, codeA)) {
      return { outcome: "subsumed-by" };
    }

    return { outcome: "not-subsumed" };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Find a concept in a (possibly hierarchical) concept list.
   */
  private findConcept(
    concepts: any[] | undefined,
    code: string,
  ): Record<string, any> | undefined {
    if (!concepts) return undefined;
    for (const c of concepts) {
      if (c.code === code) return c;
      // Recurse into children
      if (c.concept) {
        const found = this.findConcept(c.concept, code);
        if (found) return found;
      }
    }
    return undefined;
  }

  /**
   * Check if `ancestor` is a parent/grandparent of `descendant`
   * in a hierarchical concept tree.
   */
  private isAncestor(
    concepts: any[],
    ancestor: string,
    descendant: string,
  ): boolean {
    // Find the ancestor node, then check if descendant is in its subtree
    const ancestorNode = this.findConcept(concepts, ancestor);
    if (!ancestorNode || !ancestorNode.concept) return false;
    return this.findConcept(ancestorNode.concept, descendant) !== undefined;
  }

  /**
   * Resolve the display string for a concept, optionally using
   * a language-specific designation.
   */
  private resolveDisplay(
    concept: Record<string, any>,
    displayLanguage?: string,
  ): string | undefined {
    if (!displayLanguage) return concept.display;

    // Look for a matching designation
    if (Array.isArray(concept.designation)) {
      // Exact match first
      const exact = concept.designation.find(
        (d: any) => d.language === displayLanguage,
      );
      if (exact?.value) return exact.value;

      // Prefix match (e.g., "zh" matches "zh-CN")
      const prefix = concept.designation.find(
        (d: any) => d.language?.startsWith(displayLanguage.split("-")[0]),
      );
      if (prefix?.value) return prefix.value;
    }

    // Fallback to default display
    return concept.display;
  }

  /**
   * Load all codes from a CodeSystem by its URL.
   */
  private async getCodeSystemCodes(
    systemUrl: string,
    displayLanguage?: string,
  ): Promise<Coding[]> {
    try {
      const result = await this.repo.searchResources({
        resourceType: "CodeSystem",
        params: [{ code: "url", values: [systemUrl] }],
        count: 1,
      });
      if (result.resources.length === 0) return [];

      const cs = result.resources[0] as Record<string, any>;
      return this.flattenConcepts(cs.concept, systemUrl, displayLanguage);
    } catch {
      return [];
    }
  }

  /**
   * Flatten a hierarchical concept tree into a flat list.
   */
  private flattenConcepts(
    concepts: any[] | undefined,
    system: string,
    displayLanguage?: string,
  ): Coding[] {
    if (!concepts) return [];
    const result: Coding[] = [];
    for (const c of concepts) {
      result.push({
        system,
        code: c.code,
        display: this.resolveDisplay(c, displayLanguage),
      });
      if (c.concept) {
        result.push(...this.flattenConcepts(c.concept, system, displayLanguage));
      }
    }
    return result;
  }

  /**
   * Apply compose.include.filter rules to a set of codes.
   *
   * FHIR filter has: property, op, value.
   * Supported ops: is-a, =, regex, in, not-in, generalizes, exists.
   * We implement the most common: is-a, =, regex, in.
   */
  private applyIncludeFilters(
    codes: Coding[],
    filters: any[],
    systemUrl: string,
  ): Coding[] {
    let result = codes;

    for (const f of filters) {
      const op = f.op as string;
      const value = f.value as string;

      switch (op) {
        case "=":
          // Exact match on display or code
          result = result.filter(
            (c) => c.code === value || c.display === value,
          );
          break;

        case "in":
          // Code is in a comma-separated list
          {
            const allowed = new Set(value.split(",").map((v) => v.trim()));
            result = result.filter((c) => allowed.has(c.code));
          }
          break;

        case "not-in":
          // Code is not in a comma-separated list
          {
            const excluded = new Set(value.split(",").map((v) => v.trim()));
            result = result.filter((c) => !excluded.has(c.code));
          }
          break;

        case "regex":
          // Regex match on code
          try {
            const re = new RegExp(value);
            result = result.filter((c) => re.test(c.code));
          } catch {
            // Invalid regex — skip this filter
          }
          break;

        case "is-a":
          // Include only descendants of the given code (hierarchical filter)
          // For flat codes, just match the code itself
          result = result.filter((c) => c.code === value || c.code.startsWith(value + "."));
          break;

        default:
          // Unsupported op — no filtering
          break;
      }
    }

    return result;
  }
}

// =============================================================================
// Section 3: Error
// =============================================================================

export class TerminologyError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TerminologyError";
    this.status = status;
  }
}
