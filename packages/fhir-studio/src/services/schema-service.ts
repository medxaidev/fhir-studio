/**
 * SchemaService — loads and caches StructureDefinitions for the form engine.
 *
 * Fetches SDs from the FHIR server, parses snapshot.element into
 * InternalSchemaElement maps, and caches results in memory.
 *
 * @module fhir-studio/services/schema-service
 */

import type { MedXAIClient } from 'fhir-rest-client';
import type { ParsedSchema } from '../components/fhir-react/types/schema-types';
import { parseStructureDefinition } from '../components/fhir-react/utils/schema-utils';

export class SchemaService {
  private client: MedXAIClient;
  private cache = new Map<string, ParsedSchema>();

  constructor(client: MedXAIClient) {
    this.client = client;
  }

  /**
   * Load and parse the StructureDefinition for a resource type.
   * Results are cached by resourceType.
   *
   * Uses the admin endpoint which resolves SDs from in-memory package
   * definitions (sdByUrl), falling back to DB.
   */
  async loadSchema(resourceType: string): Promise<ParsedSchema> {
    const cached = this.cache.get(resourceType);
    if (cached) return cached;

    const sd = await this.fetchStructureDefinition(resourceType);
    const snapshot = sd.snapshot as { element?: unknown[] } | undefined;
    if (!snapshot?.element) {
      throw new Error(`StructureDefinition for ${resourceType} has no snapshot`);
    }

    const schema = parseStructureDefinition(sd);
    this.cache.set(resourceType, schema);
    return schema;
  }

  /**
   * Load a profiled StructureDefinition by its canonical URL or id.
   */
  async loadProfileSchema(profileId: string): Promise<ParsedSchema> {
    const cacheKey = `profile:${profileId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const sd = await this.fetchStructureDefinition(profileId);
    const snapshot = sd.snapshot as { element?: unknown[] } | undefined;
    if (!snapshot?.element) {
      throw new Error(`StructureDefinition '${profileId}' has no snapshot`);
    }

    const schema = parseStructureDefinition(sd);
    this.cache.set(cacheKey, schema);
    return schema;
  }

  /**
   * Fetch a StructureDefinition from the admin endpoint.
   * Resolves from in-memory package definitions (sdByUrl), falling back to DB.
   */
  private async fetchStructureDefinition(idOrType: string): Promise<Record<string, unknown>> {
    const baseUrl = this.client.getBaseUrl();
    const url = `${baseUrl}/_admin/ig/structure-definition/${encodeURIComponent(idOrType)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`StructureDefinition not found: ${idOrType} (HTTP ${resp.status})`);
    }
    return resp.json() as Promise<Record<string, unknown>>;
  }

  /**
   * Check if a schema is already cached.
   */
  has(resourceType: string): boolean {
    return this.cache.has(resourceType);
  }

  /**
   * Clear all cached schemas.
   */
  clear(): void {
    this.cache.clear();
  }
}
