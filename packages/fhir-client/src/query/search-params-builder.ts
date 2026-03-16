/**
 * Search Params Builder
 *
 * Fluent DSL for building FHIR search parameters.
 *
 * @module fhir-client/query
 */

import type { SearchParams } from "../types/index.js";

// =============================================================================
// Section 1: SearchParamsBuilder
// =============================================================================

/**
 * Fluent builder for FHIR search parameters.
 *
 * @example
 * ```ts
 * const params = new SearchParamsBuilder()
 *   .where("name").is("Smith")
 *   .where("birthdate").ge("2000-01-01")
 *   .include("Patient", "organization")
 *   .sort("name")
 *   .count(10)
 *   .build();
 * ```
 */
export class SearchParamsBuilder {
  private params: Array<[string, string]> = [];
  private currentParam: string | null = null;

  /**
   * Start a new search parameter clause.
   */
  where(param: string): this {
    this.currentParam = param;
    return this;
  }

  /**
   * Exact value match (no modifier).
   */
  is(value: string): this {
    this.addParam(this.requireCurrent(), value);
    return this;
  }

  /**
   * Greater than or equal.
   */
  ge(value: string): this {
    this.addParam(this.requireCurrent(), `ge${value}`);
    return this;
  }

  /**
   * Less than or equal.
   */
  le(value: string): this {
    this.addParam(this.requireCurrent(), `le${value}`);
    return this;
  }

  /**
   * Greater than.
   */
  gt(value: string): this {
    this.addParam(this.requireCurrent(), `gt${value}`);
    return this;
  }

  /**
   * Less than.
   */
  lt(value: string): this {
    this.addParam(this.requireCurrent(), `lt${value}`);
    return this;
  }

  /**
   * Contains (string search).
   */
  contains(value: string): this {
    this.addParam(`${this.requireCurrent()}:contains`, value);
    return this;
  }

  /**
   * Exact string match.
   */
  exact(value: string): this {
    this.addParam(`${this.requireCurrent()}:exact`, value);
    return this;
  }

  /**
   * Missing modifier.
   */
  missing(value: boolean): this {
    this.addParam(`${this.requireCurrent()}:missing`, String(value));
    return this;
  }

  /**
   * _include parameter.
   */
  include(resourceType: string, param: string): this {
    this.addParam("_include", `${resourceType}:${param}`);
    return this;
  }

  /**
   * _revinclude parameter.
   */
  revInclude(resourceType: string, param: string): this {
    this.addParam("_revinclude", `${resourceType}:${param}`);
    return this;
  }

  /**
   * _sort parameter.
   */
  sort(param: string, desc?: boolean): this {
    this.addParam("_sort", desc ? `-${param}` : param);
    return this;
  }

  /**
   * _count parameter.
   */
  count(n: number): this {
    this.addParam("_count", String(n));
    return this;
  }

  /**
   * _offset parameter.
   */
  offset(n: number): this {
    this.addParam("_offset", String(n));
    return this;
  }

  /**
   * _summary parameter.
   */
  summary(mode: "true" | "false" | "count" | "text" | "data"): this {
    this.addParam("_summary", mode);
    return this;
  }

  /**
   * _elements parameter.
   */
  elements(...fields: string[]): this {
    this.addParam("_elements", fields.join(","));
    return this;
  }

  /**
   * Build the final SearchParams object.
   */
  build(): SearchParams {
    const result: SearchParams = {};
    for (const [key, value] of this.params) {
      const existing = result[key];
      if (existing === undefined) {
        result[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    }
    return result;
  }

  /**
   * Build as a URL query string.
   */
  toQueryString(): string {
    return this.params
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private requireCurrent(): string {
    if (!this.currentParam) {
      throw new Error("Call .where(param) before setting a value");
    }
    const p = this.currentParam;
    this.currentParam = null;
    return p;
  }

  private addParam(key: string, value: string): void {
    this.params.push([key, value]);
  }
}
